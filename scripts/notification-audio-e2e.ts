import { equal, ok } from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, type BrowserContext, type Locator, type Page } from '@playwright/test';

type LoginResponse = { accessToken?: string; data?: { accessToken?: string; user?: { tenantId?: string } }; user?: { tenantId?: string } };
type StorefrontProduct = { id?: string; type?: string; isAvailable?: boolean; basePrice?: number };
type StorefrontResponse = { data?: { categories?: Array<{ products?: StorefrontProduct[] }> }; categories?: Array<{ products?: StorefrontProduct[] }> };
type CreatedResource = { id?: string; data?: { id?: string }; category?: { id?: string } };
type JsonResponse<T> = { status: number; payload: T };
type CheckoutResponse = { data?: { id?: string }; id?: string };
type BrowserLog = { console: string[]; pageErrors: string[]; requestFailures: string[] };
type AudioAudit = { oscillators: number; resumes: number; notifications: number; events: string[]; audioContextState: 'not-created' | 'suspended' | 'running' | 'closed' };
type UnlockTrace = { step: string; state: 'running' | 'suspended' | 'closed' | null; error?: { name: string; message: string } };
type NotificationTrace = { stage: string; eventType?: string; eventId?: string; tenantId?: string; orderId?: string; sourceEventName?: string; source?: string; accepted?: boolean; reason?: string; isLeader?: boolean; tabId?: string; lockStrategy?: string; soundPreferenceEnabled?: boolean; effectiveVolume?: number; audioContextState?: string; playbackRequested?: boolean };

const apiBase = process.env.NOTIFICATION_E2E_API_BASE ?? 'http://127.0.0.1:3333/api/v1';
const webUrl = process.env.NOTIFICATION_E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const artifactDir = resolve(process.env.NOTIFICATION_E2E_ARTIFACT_DIR ?? 'qa-artifacts/notification-audio');
const tenantSlug = process.env.NOTIFICATION_E2E_TENANT_SLUG ?? 'pizzaria-demo';
const tenantEmail = process.env.NOTIFICATION_E2E_TENANT_EMAIL ?? 'owner@pizzariademo.com';
const tenantPassword = process.env.NOTIFICATION_E2E_TENANT_PASSWORD ?? 'Owner@123';

async function requestJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  return (await requestJsonWithMeta<T>(pathname, init)).payload;
}

async function requestJsonWithMeta<T>(pathname: string, init?: RequestInit): Promise<JsonResponse<T>> {
  const response = await fetch(`${apiBase}${pathname}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const payload = await response.json().catch((): unknown => ({}));
  ok(response.ok, `${pathname} returned ${response.status}: ${JSON.stringify(payload)}`);
  return { status: response.status, payload: payload as T };
}

function extractCreatedId(resource: CreatedResource): string | undefined {
  return resource.id ?? resource.data?.id ?? resource.category?.id;
}

function unwrapAccessToken(response: LoginResponse): string {
  const token = response.accessToken ?? response.data?.accessToken;
  ok(token, 'tenant login did not return an access token');
  return token;
}

function unwrapTenantId(response: LoginResponse): string {
  const tenantId = response.user?.tenantId ?? response.data?.user?.tenantId;
  ok(tenantId, 'tenant login did not return a tenantId');
  return tenantId;
}

async function installInstrumentation(context: BrowserContext, token: string): Promise<void> {
  await context.addInitScript((accessToken) => {
    type Audit = { oscillators: number; resumes: number; notifications: number; events: string[]; audioContextState: 'not-created' | 'suspended' | 'running' | 'closed' };
    const audit: Audit = { oscillators: 0, resumes: 0, notifications: 0, events: [], audioContextState: 'not-created' };
    Object.defineProperty(window, '__notificationAudioAudit', { configurable: true, value: audit });
    Object.defineProperty(window, '__notificationAudioE2ETrace', { configurable: true, value: [] });
    Object.defineProperty(window, '__notificationE2ETrace', { configurable: true, value: [] });
    window.localStorage.setItem('accessToken', accessToken);
    window.localStorage.setItem('tenantNotificationSoundEnabled', 'true');

    class FakeAudioContext {
      state: 'suspended' | 'running' | 'closed' = 'suspended';
      currentTime = 0;
      sampleRate = 44_100;
      destination = {} as AudioDestinationNode;
      constructor() { audit.audioContextState = 'suspended'; }
      resume = () => { audit.resumes += 1; this.state = 'running'; audit.audioContextState = 'running'; return Promise.resolve(); };
      createGain = () => ({ connect: () => undefined, gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined, setTargetAtTime: () => undefined } }) as unknown as GainNode;
      createOscillator = () => ({ connect: () => undefined, start: () => { audit.oscillators += 1; }, stop: () => undefined, frequency: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined }, detune: { setValueAtTime: () => undefined } }) as unknown as OscillatorNode;
      createBuffer = () => ({ getChannelData: () => new Float32Array(1) }) as unknown as AudioBuffer;
      createBufferSource = () => ({ connect: () => undefined, start: () => undefined, stop: () => undefined }) as unknown as AudioBufferSourceNode;
      createBiquadFilter = () => ({ connect: () => undefined, frequency: { setValueAtTime: () => undefined } }) as unknown as BiquadFilterNode;
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: FakeAudioContext });
    class FakeNotification {
      static permission: NotificationPermission = 'granted';
      constructor(title: string) { audit.notifications += 1; audit.events.push(`notification:${title}`); }
      close() { return undefined; }
    }
    Object.defineProperty(window, 'Notification', { configurable: true, value: FakeNotification });
  }, token);
}

function collectBrowserLog(page: Page, browserLog: BrowserLog): void {
  page.on('console', (message) => browserLog.console.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => browserLog.pageErrors.push(error.stack ?? error.message));
  page.on('requestfailed', (request) => browserLog.requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown failure'}`));
}

async function captureFailureEvidence(page: Page, name: string, browserLog: BrowserLog): Promise<void> {
  const state = await page.evaluate(() => ({
    url: window.location.href,
    audioAudit: (window as unknown as { __notificationAudioAudit?: AudioAudit }).__notificationAudioAudit ?? null,
    unlockTrace: (window as unknown as { __notificationAudioE2ETrace?: UnlockTrace[] }).__notificationAudioE2ETrace ?? [],
    notificationTrace: (window as unknown as { __notificationE2ETrace?: NotificationTrace[] }).__notificationE2ETrace ?? [],
    soundPreferenceEnabled: window.localStorage.getItem('tenantNotificationSoundEnabled'),
    soundVolume: window.localStorage.getItem('tenantNotificationVolume'),
    soundLegacyUnlock: window.localStorage.getItem('tenantNotificationAudioUnlocked'),
    notificationCenterText: Array.from(document.querySelectorAll('[role="alert"]')).map((element) => element.textContent?.trim() ?? ''),
    visibleText: document.body.innerText,
  }));
  await page.screenshot({ path: join(artifactDir, `${name}-failure.png`), fullPage: true });
  await writeFile(join(artifactDir, `${name}-failure-dom.html`), await page.content());
  await writeFile(join(artifactDir, `${name}-failure-state.json`), JSON.stringify({ ...state, browserLog }, null, 2));
}

async function openNotificationSettings(page: Page): Promise<void> {
  await page.goto(`${webUrl}/settings/notifications`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('alert')
    .getByRole('button', { name: /Permitir notificacoes e ativar som|Tentar novamente/ })
    .waitFor({ timeout: 10_000 });
}

async function assertNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 4);
  equal(overflow, false, `${label} has horizontal overflow`);
}

async function activateSounds(page: Page): Promise<void> {
  const activationButton = page.getByRole('alert')
    .getByRole('button', { name: /Permitir notificacoes e ativar som|Tentar novamente/ });
  await activationButton.click();
  await assertSoundsActive(page, activationButton);
}

async function activateSoundsAfterSharedConfirmation(page: Page): Promise<void> {
  const activationButton = page.getByRole('alert')
    .getByRole('button', { name: /Permitir notificacoes e ativar som|Tentar novamente/ });
  await activationButton.waitFor({ state: 'hidden', timeout: 5_000 });
  await page.getByRole('button', { name: 'Ativar notificacoes sonoras' }).click();
  await assertSoundsActive(page, activationButton);
}

async function assertSoundsActive(page: Page, activationButton: Locator): Promise<void> {
  await page.waitForFunction(() => {
    const audit = (window as unknown as { __notificationAudioAudit?: AudioAudit }).__notificationAudioAudit;
    return audit?.audioContextState === 'running';
  }, { timeout: 5_000 });
  await activationButton.waitFor({ state: 'hidden', timeout: 5_000 });
  await page.getByRole('button', { name: 'Testar som' }).waitFor({ state: 'visible', timeout: 5_000 });
}

async function waitForLeader(pages: Page[]): Promise<Page> {
  return Promise.any(pages.map(async (page) => {
    await page.waitForFunction(() => {
      const trace = (window as unknown as { __notificationE2ETrace?: NotificationTrace[] }).__notificationE2ETrace ?? [];
      for (let index = trace.length - 1; index >= 0; index -= 1) {
        const currentLeader = trace[index];
        if (currentLeader?.stage === 'leader.ready' && currentLeader.isLeader === true) {
          return !trace.some((entry) => entry.stage === 'leader.destroyed' && entry.tabId === currentLeader.tabId);
        }
      }
      return false;
    }, { timeout: 5_000 });
    return page;
  }));
}

async function emit(page: Page, input: { id: string; type: string; title: string; message?: string; priority?: 'low' | 'high' | 'critical' }): Promise<void> {
  await page.evaluate((event) => {
    const trace = (window as unknown as { __notificationE2ETrace?: NotificationTrace[] }).__notificationE2ETrace;
    trace?.push({
      stage: 'e2e.emit',
      eventType: event.type,
      eventId: event.id,
      orderId: event.orderId,
      sourceEventName: 'tenant:notification-event',
      source: 'e2e-direct',
      reason: 'socket-bypassed',
    });
    window.dispatchEvent(new CustomEvent('tenant:notification-event', {
      detail: {
        id: event.id,
        type: event.type,
        title: event.title,
        message: event.message,
        priority: event.priority ?? 'high',
        createdAt: new Date().toISOString(),
        source: 'socket',
      },
    }));
  }, input);
}

async function audit(page: Page): Promise<AudioAudit> {
  return page.evaluate(() => (window as unknown as { __notificationAudioAudit: AudioAudit }).__notificationAudioAudit);
}

async function createStorefrontFixture(token: string): Promise<string> {
  const runId = `notification-e2e-${Date.now()}`;
  const headers = { authorization: `Bearer ${token}` };
  const categoryResponse = await requestJsonWithMeta<CreatedResource>('/catalog/categories', {
    method: 'POST', headers,
    body: JSON.stringify({ name: `Notification E2E ${runId}`, isActive: true, order: 99_999 }),
  });
  const categoryId = extractCreatedId(categoryResponse.payload);
  ok(categoryId, `notification E2E category did not return an id: tenant=${tenantSlug} status=${categoryResponse.status} body=${JSON.stringify(categoryResponse.payload)}`);
  const product = await requestJson<CreatedResource>('/catalog/products', {
    method: 'POST', headers,
    body: JSON.stringify({ name: `Notification E2E ${runId}`, categoryId, type: 'simple', basePrice: 10, isActive: true, isAvailable: true, sellableOnline: true, order: 99_999 }),
  });
  const productId = extractCreatedId(product);
  ok(productId, `notification E2E product did not return an id: body=${JSON.stringify(product)}`);
  const storefront = await requestJson<StorefrontResponse>(`/public/storefront/${tenantSlug}?fulfillmentType=pickup`);
  const categories = storefront.data?.categories ?? storefront.categories ?? [];
  const visibleProduct = categories.flatMap((categoryRow) => categoryRow.products ?? []).find((candidate) => candidate.id === productId);
  ok(visibleProduct?.isAvailable && visibleProduct.basePrice === 10, `storefront fixture unavailable: tenant=${tenantSlug} category=${categoryId} product=${productId} response=${JSON.stringify(categories.map((categoryRow) => categoryRow.products?.map((candidate) => ({ id: candidate.id, isAvailable: candidate.isAvailable, basePrice: candidate.basePrice }))))}`);
  return productId;
}

async function createLocalOrder(token: string): Promise<string> {
  const productId = await createStorefrontFixture(token);
  const order = await requestJson<CheckoutResponse>(`/orders/public-checkout/${tenantSlug}`, {
    method: 'POST',
    body: JSON.stringify({
      idempotencyKey: `notification-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      items: [{ lineType: 'product', productId, quantity: 1 }],
      customerName: 'Notification E2E',
      customerPhone: '11999990000',
      customerEmail: 'notification-e2e@example.test',
      fulfillmentType: 'pickup',
      payment: { method: 'pix' },
    }),
  });
  const orderId = order.data?.id ?? order.id;
  ok(orderId, 'checkout did not return an order id');
  await requestJson(`/orders/${orderId}`, { headers: { authorization: `Bearer ${token}` } });
  return orderId;
}

async function main(): Promise<void> {
  await mkdir(artifactDir, { recursive: true });
  const login = await requestJson<LoginResponse>('/auth/tenant/login', {
    method: 'POST',
    body: JSON.stringify({ email: tenantEmail, password: tenantPassword, tenantSlug }),
  });
  const token = unwrapAccessToken(login);
  const tenantId = unwrapTenantId(login);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await installInstrumentation(context, token);
  const leader = await context.newPage();
  const secondary = await context.newPage();
  const leaderLog: BrowserLog = { console: [], pageErrors: [], requestFailures: [] };
  const secondaryLog: BrowserLog = { console: [], pageErrors: [], requestFailures: [] };
  collectBrowserLog(leader, leaderLog);
  collectBrowserLog(secondary, secondaryLog);

  try {
    await secondary.setViewportSize({ width: 390, height: 844 });
    await Promise.all([openNotificationSettings(leader), openNotificationSettings(secondary)]);
    equal(await leader.getByRole('button', { name: 'Testar som' }).count(), 0, 'test sound control was visible while desktop context was blocked');
    equal(await secondary.getByRole('button', { name: 'Testar som' }).count(), 0, 'test sound control was visible while mobile context was blocked');
    await Promise.all([
      leader.screenshot({ path: join(artifactDir, 'sound-activation-desktop-blocked.png'), fullPage: true }),
      secondary.screenshot({ path: join(artifactDir, 'sound-activation-mobile-blocked.png'), fullPage: true }),
    ]);
    await Promise.all([
      assertNoHorizontalOverflow(leader, 'desktop blocked activation'),
      assertNoHorizontalOverflow(secondary, 'mobile blocked activation'),
    ]);
    await activateSounds(leader);
    await activateSoundsAfterSharedConfirmation(secondary);
    await Promise.all([
      leader.screenshot({ path: join(artifactDir, 'sound-activation-desktop-active.png'), fullPage: true }),
      secondary.screenshot({ path: join(artifactDir, 'sound-activation-mobile-active.png'), fullPage: true }),
    ]);
    await Promise.all([
      assertNoHorizontalOverflow(leader, 'desktop active activation'),
      assertNoHorizontalOverflow(secondary, 'mobile active activation'),
    ]);
    ok((await audit(leader)).resumes >= 1, 'AudioContext was not resumed after the CTA interaction');
    const activeLeader = await waitForLeader([leader, secondary]);
    const standby = activeLeader === leader ? secondary : leader;

    const orderId = await createLocalOrder(token);
    await emit(activeLeader, { id: `order.created:${orderId}`, type: 'order.created', title: 'Novo pedido', priority: 'critical' });
    await leader.waitForTimeout(250);
    equal((await audit(leader)).oscillators + (await audit(secondary)).oscillators > 0, true, 'order.created did not call the sound engine');

    const beforeDuplicate = (await audit(leader)).oscillators + (await audit(secondary)).oscillators;
    await emit(activeLeader, { id: `legacy:order.created:${orderId}`, type: 'order.created', title: 'Novo pedido', priority: 'critical' });
    await activeLeader.waitForTimeout(250);
    equal((await audit(leader)).oscillators + (await audit(secondary)).oscillators, beforeDuplicate, 'duplicate order event replayed audio');

    await emit(activeLeader, { id: `order.cancelled:${orderId}`, type: 'order.cancelled', title: 'Pedido cancelado', priority: 'high' });
    await emit(activeLeader, { id: `order.ready:${orderId}`, type: 'order.ready', title: 'Pedido pronto', priority: 'high' });
    await emit(activeLeader, { id: `whatsapp.handoff:${tenantId}`, type: 'whatsapp.handoff', title: 'Transferencia para atendimento humano', priority: 'high' });
    await activeLeader.waitForTimeout(500);
    const beforeConnectivity = (await audit(leader)).oscillators + (await audit(secondary)).oscillators;
    await emit(activeLeader, { id: `connection.lost:${tenantId}`, type: 'connection.lost', title: 'Conexao perdida', priority: 'critical' });
    await emit(activeLeader, { id: `connection.restored:${tenantId}`, type: 'connection.restored', title: 'Conexao restaurada', priority: 'low' });
    await activeLeader.waitForTimeout(500);
    equal(
      (await audit(leader)).oscillators + (await audit(secondary)).oscillators,
      beforeConnectivity,
      'connectivity events must remain silent',
    );
    ok(beforeConnectivity > beforeDuplicate, 'attention event matrix did not call the sound engine');

    await activeLeader.screenshot({ path: join(artifactDir, 'leader-before-handoff.png'), fullPage: true });
    await activeLeader.close();
    await waitForLeader([standby]);
    const beforeHandoff = (await audit(standby)).oscillators;
    await emit(standby, { id: `order.created:handoff:${orderId}`, type: 'order.created', title: 'Novo pedido apos troca de lider', priority: 'critical' });
    await standby.waitForTimeout(300);
    ok((await audit(standby)).oscillators > beforeHandoff, 'secondary tab did not take over audio after leader close');
    await standby.screenshot({ path: join(artifactDir, 'secondary-after-handoff.png'), fullPage: true });
  } catch (error: unknown) {
    await Promise.all([
      !leader.isClosed() && captureFailureEvidence(leader, 'leader', leaderLog),
      !secondary.isClosed() && captureFailureEvidence(secondary, 'secondary', secondaryLog),
    ]);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

main().then(() => process.stdout.write('NOTIFICATION_AUDIO_E2E_PASS\n')).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
