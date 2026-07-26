import { equal, ok } from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, type BrowserContext, type Page } from '@playwright/test';

type LoginResponse = { accessToken?: string; data?: { accessToken?: string; user?: { tenantId?: string } }; user?: { tenantId?: string } };
type StorefrontResponse = { data?: { products?: Array<{ id?: string; type?: string }> }; products?: Array<{ id?: string; type?: string }> };
type CheckoutResponse = { data?: { id?: string }; id?: string };

const apiBase = process.env.NOTIFICATION_E2E_API_BASE ?? 'http://127.0.0.1:3333/api/v1';
const webUrl = process.env.NOTIFICATION_E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const artifactDir = resolve(process.env.NOTIFICATION_E2E_ARTIFACT_DIR ?? 'qa-artifacts/notification-audio');
const tenantSlug = process.env.NOTIFICATION_E2E_TENANT_SLUG ?? 'pizzaria-demo';
const tenantEmail = process.env.NOTIFICATION_E2E_TENANT_EMAIL ?? 'owner@pizzariademo.com';
const tenantPassword = process.env.NOTIFICATION_E2E_TENANT_PASSWORD ?? 'Owner@123';

async function requestJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${pathname}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const payload = await response.json().catch((): unknown => ({}));
  ok(response.ok, `${pathname} returned ${response.status}`);
  return payload as T;
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
    type Audit = { oscillators: number; resumes: number; notifications: number; events: string[] };
    const audit: Audit = { oscillators: 0, resumes: 0, notifications: 0, events: [] };
    Object.defineProperty(window, '__notificationAudioAudit', { configurable: true, value: audit });
    window.localStorage.setItem('accessToken', accessToken);
    window.localStorage.setItem('tenantNotificationSoundEnabled', 'true');

    class FakeAudioContext {
      state: 'suspended' | 'running' | 'closed' = 'suspended';
      currentTime = 0;
      sampleRate = 44_100;
      destination = {} as AudioDestinationNode;
      resume = async () => { audit.resumes += 1; this.state = 'running'; };
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

async function waitForApp(page: Page): Promise<void> {
  await page.goto(`${webUrl}/settings/notifications`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1_000);
  await page.getByRole('button', { name: 'Ativar sons', exact: true }).click();
}

async function emit(page: Page, input: { id: string; type: string; title: string; message?: string; priority?: 'low' | 'high' | 'critical' }): Promise<void> {
  await page.evaluate((event) => {
    window.dispatchEvent(new CustomEvent('tenant:notification-event', {
      detail: { ...event, createdAt: new Date().toISOString(), priority: event.priority ?? 'high', source: 'socket' },
    }));
  }, input);
}

async function audit(page: Page): Promise<{ oscillators: number; resumes: number; notifications: number; events: string[] }> {
  return page.evaluate(() => (window as unknown as { __notificationAudioAudit: { oscillators: number; resumes: number; notifications: number; events: string[] } }).__notificationAudioAudit);
}

async function createLocalOrder(token: string): Promise<string> {
  const storefront = await requestJson<StorefrontResponse>(`/public/storefront/${tenantSlug}`);
  const products = storefront.data?.products ?? storefront.products ?? [];
  const productId = products.find((product) => product.type === 'simple')?.id ?? products.find((product) => product.id)?.id;
  ok(productId, 'seed storefront did not expose a product');
  const order = await requestJson<CheckoutResponse>(`/orders/public-checkout/${tenantSlug}`, {
    method: 'POST',
    body: JSON.stringify({
      idempotencyKey: `notification-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      items: [{ lineType: 'product', productId, quantity: 1, complements: [] }],
      customerName: 'Notification E2E',
      customerPhone: '11999990000',
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

  try {
    await Promise.all([waitForApp(leader), waitForApp(secondary)]);
    ok((await audit(leader)).resumes >= 1, 'AudioContext was not resumed after the CTA interaction');

    const orderId = await createLocalOrder(token);
    await emit(leader, { id: `order.created:${orderId}`, type: 'order.created', title: 'Novo pedido', priority: 'critical' });
    await emit(secondary, { id: `order.created:${orderId}`, type: 'order.created', title: 'Novo pedido', priority: 'critical' });
    await leader.waitForTimeout(250);
    equal((await audit(leader)).oscillators + (await audit(secondary)).oscillators > 0, true, 'order.created did not call the sound engine');

    const beforeDuplicate = (await audit(leader)).oscillators + (await audit(secondary)).oscillators;
    await emit(leader, { id: `legacy:order.created:${orderId}`, type: 'order.created', title: 'Novo pedido', priority: 'critical' });
    await leader.waitForTimeout(250);
    equal((await audit(leader)).oscillators + (await audit(secondary)).oscillators, beforeDuplicate, 'duplicate order event replayed audio');

    await emit(leader, { id: `order.cancelled:${orderId}`, type: 'order.cancelled', title: 'Pedido cancelado', priority: 'high' });
    await emit(leader, { id: `order.ready:${orderId}`, type: 'order.ready', title: 'Pedido pronto', priority: 'high' });
    await emit(leader, { id: `whatsapp.handoff:${tenantId}`, type: 'whatsapp.handoff', title: 'Transferencia para atendimento humano', priority: 'high' });
    await emit(leader, { id: `connection.lost:${tenantId}`, type: 'connection.lost', title: 'Conexao perdida', priority: 'critical' });
    await emit(leader, { id: `connection.restored:${tenantId}`, type: 'connection.restored', title: 'Conexao restaurada', priority: 'low' });
    await leader.waitForTimeout(500);
    ok((await audit(leader)).oscillators + (await audit(secondary)).oscillators > beforeDuplicate, 'critical event matrix did not call the sound engine');

    await leader.screenshot({ path: join(artifactDir, 'leader-before-handoff.png'), fullPage: true });
    await leader.close();
    await secondary.waitForTimeout(300);
    const beforeHandoff = (await audit(secondary)).oscillators;
    await emit(secondary, { id: `order.created:handoff:${orderId}`, type: 'order.created', title: 'Novo pedido apos troca de lider', priority: 'critical' });
    await secondary.waitForTimeout(300);
    ok((await audit(secondary)).oscillators > beforeHandoff, 'secondary tab did not take over audio after leader close');
    await secondary.screenshot({ path: join(artifactDir, 'secondary-after-handoff.png'), fullPage: true });
  } finally {
    await context.close();
    await browser.close();
  }
}

main().then(() => process.stdout.write('NOTIFICATION_AUDIO_E2E_PASS\n')).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
