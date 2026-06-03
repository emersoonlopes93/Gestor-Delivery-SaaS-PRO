import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const API = process.env.SMOKE_API_BASE_URL ?? 'http://localhost:3333/api/v1';
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? 'admin@saas.com';
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD ?? 'admin123';
const TENANT_A_SLUG = process.env.SMOKE_TENANT_SLUG ?? 'pizzaria-demo';
const TENANT_A_EMAIL = process.env.SMOKE_TENANT_EMAIL ?? 'demo@demo.com';
const TENANT_A_PASSWORD = process.env.SMOKE_TENANT_PASSWORD ?? 'demo123';
const TENANT_B_SLUG = 'smoke-media-tenant-b';
const TENANT_B_EMAIL = 'smoke-media-b@demo.com';
const TENANT_B_PASSWORD = 'smoke123';

type TestResult = {
  name: string;
  passed: boolean;
  detail: string;
};

type ApiResult = {
  status: number;
  data: unknown;
  raw: unknown;
};

type UploadField = {
  name: string;
  value: string;
};

const prisma = new PrismaClient();
const results: TestResult[] = [];

const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

function record(name: string, passed: boolean, detail: string, payload?: unknown) {
  const suffix = payload === undefined ? '' : ` | Payload: ${JSON.stringify(payload).slice(0, 700)}`;
  results.push({ name, passed, detail: `${detail}${suffix}` });
  process.stdout.write(`${passed ? 'OK ' : 'ERR'} ${name}${passed ? '' : `: ${detail}${suffix}`}\n`);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pickString(value: unknown, key: string): string | null {
  const field = asRecord(value)?.[key];
  return typeof field === 'string' ? field : null;
}

function pickBool(value: unknown, key: string): boolean | null {
  const field = asRecord(value)?.[key];
  return typeof field === 'boolean' ? field : null;
}

async function api(method: string, path: string, body?: unknown, token?: string): Promise<ApiResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`API offline ou inacessivel em ${API}. Suba a API antes de rodar pnpm smoke:media. Detalhe: ${message}`);
  }

  const raw: unknown = await response.json().catch(() => ({}));
  const rawRecord = asRecord(raw);
  const data = rawRecord && 'success' in rawRecord && 'data' in rawRecord ? rawRecord.data : raw;
  return { status: response.status, data, raw };
}

async function upload(path: string, token: string, file: Blob, filename: string, fields: UploadField[] = []): Promise<ApiResult> {
  const form = new FormData();
  form.set('file', file, filename);
  for (const field of fields) form.set(field.name, field.value);

  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const raw: unknown = await response.json().catch(() => ({}));
  const rawRecord = asRecord(raw);
  const data = rawRecord && 'success' in rawRecord && 'data' in rawRecord ? rawRecord.data : raw;
  return { status: response.status, data, raw };
}

async function loginAdmin(): Promise<string> {
  const response = await api('POST', '/auth/admin/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const token = pickString(response.data, 'accessToken');
  record('Admin login', response.status === 200 || response.status === 201, `status=${response.status}`, response.raw);
  record('Admin token presente', !!token && token.length > 20, 'accessToken presente');
  return token ?? '';
}

async function loginTenant(email: string, password: string, tenantSlug: string): Promise<string> {
  const response = await api('POST', '/auth/tenant/login', { email, password, tenantSlug });
  const token = pickString(response.data, 'accessToken');
  record(`Tenant login ${tenantSlug}`, response.status === 200 || response.status === 201, `status=${response.status}`, response.raw);
  record(`Tenant token ${tenantSlug}`, !!token && token.length > 20, 'accessToken presente');
  return token ?? '';
}

function firstStorefrontProduct(storefront: unknown): { id: string | null; imageSource: string | null } {
  const categories = asArray(asRecord(storefront)?.categories);
  for (const category of categories) {
    const products = asArray(asRecord(category)?.products);
    for (const product of products) {
      return {
        id: pickString(product, 'id'),
        imageSource: pickString(product, 'imageSource'),
      };
    }
  }
  return { id: null, imageSource: null };
}

function storefrontHasProductSource(storefront: unknown, productId: string, source: string): boolean {
  const categories = asArray(asRecord(storefront)?.categories);
  for (const category of categories) {
    for (const product of asArray(asRecord(category)?.products)) {
      if (pickString(product, 'id') === productId && pickString(product, 'imageSource') === source) return true;
    }
  }
  return false;
}

function listContainsAsset(listPayload: unknown, assetId: string): boolean {
  return asArray(listPayload).some((asset) => pickString(asset, 'id') === assetId);
}

async function seedSmokeTenant(slug: string, email: string, password: string): Promise<string> {
  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: { status: 'active' },
    create: { name: `Smoke Media ${slug}`, slug, status: 'active' },
  });

  const role = await prisma.tenantRole.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'tenant_owner' } },
    update: { name: 'Tenant Owner' },
    create: { tenantId: tenant.id, name: 'Tenant Owner', slug: 'tenant_owner', isSystem: true },
  });

  const permissions = await prisma.tenantPermission.findMany({ select: { id: true } });
  for (const permission of permissions) {
    await prisma.tenantRolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id },
    });
  }

  const user = await prisma.tenantUser.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email } },
    update: { isActive: true },
    create: {
      tenantId: tenant.id,
      email,
      name: `Owner ${slug}`,
      passwordHash: await bcrypt.hash(password, 12),
      isActive: true,
    },
  });

  await prisma.tenantUserRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });

  return tenant.id;
}

async function seedPlaceholderProduct(tenantId: string): Promise<string> {
  const category = await prisma.productCategory.upsert({
    where: { tenantId_slug: { tenantId, slug: 'smoke-media-placeholder' } },
    update: { isActive: true, deletedAt: null },
    create: { tenantId, slug: 'smoke-media-placeholder', name: 'Smoke Media Placeholder', isActive: true },
  });

  const product = await prisma.product.upsert({
    where: { tenantId_slug: { tenantId, slug: 'smoke-media-placeholder' } },
    update: {
      categoryId: category.id,
      image: null,
      mediaAssetId: null,
      isActive: true,
      isAvailable: true,
      sellableOnline: true,
      deletedAt: null,
    },
    create: {
      tenantId,
      categoryId: category.id,
      name: 'Smoke Media Placeholder',
      slug: 'smoke-media-placeholder',
      basePrice: 9,
      image: null,
      isActive: true,
      isAvailable: true,
      sellableOnline: true,
    },
  });

  await prisma.catalogPublication.upsert({
    where: { productId: product.id },
    update: { publicationStatus: 'published', operationalStatus: 'active' },
    create: {
      tenantId,
      productId: product.id,
      publicationStatus: 'published',
      operationalStatus: 'active',
    },
  });

  return product.id;
}

async function main() {
  process.stdout.write(`SMOKE MEDIA\nAPI=${API}\n`);

  const tenantA = await prisma.tenant.findUnique({ where: { slug: TENANT_A_SLUG }, select: { id: true } });
  if (!tenantA) throw new Error(`Seed obrigatorio ausente: tenant ${TENANT_A_SLUG}. Rode pnpm db:seed.`);

  await seedSmokeTenant(TENANT_B_SLUG, TENANT_B_EMAIL, TENANT_B_PASSWORD);
  const placeholderProductId = await seedPlaceholderProduct(tenantA.id);

  const adminToken = await loginAdmin();
  const tenantAToken = await loginTenant(TENANT_A_EMAIL, TENANT_A_PASSWORD, TENANT_A_SLUG);
  const tenantBToken = await loginTenant(TENANT_B_EMAIL, TENANT_B_PASSWORD, TENANT_B_SLUG);

  const imageBlob = new Blob([new Uint8Array(pngBytes)], { type: 'image/png' });
  const globalUpload = await upload('/admin/media/gallery/upload', adminToken, imageBlob, 'global-media.png', [
    { name: 'title', value: 'Smoke Global Media' },
    { name: 'altText', value: 'Imagem global smoke' },
    { name: 'publicationStatus', value: 'published' },
    { name: 'tags', value: 'smoke,global' },
  ]);
  const globalAssetId = pickString(globalUpload.data, 'id');
  record('Admin faz upload publicado na biblioteca global', globalUpload.status < 300 && !!globalAssetId, `status=${globalUpload.status}`, globalUpload.raw);
  if (!globalAssetId) throw new Error('Upload global nao retornou asset id.');
  const publishGlobal = await api('PATCH', `/admin/media/gallery/${globalAssetId}`, { publicationStatus: 'published', status: 'active' }, adminToken);
  record('Admin confirma publicacao da midia global', publishGlobal.status === 200 && pickString(publishGlobal.data, 'publicationStatus') === 'published', `status=${publishGlobal.status}`, publishGlobal.raw);

  const draftUpload = await upload('/admin/media/gallery/upload', adminToken, imageBlob, 'draft-media.png', [
    { name: 'title', value: 'Smoke Draft Media' },
    { name: 'publicationStatus', value: 'draft' },
  ]);
  const draftAssetId = pickString(draftUpload.data, 'id');
  record('Admin cria midia global em rascunho', draftUpload.status < 300 && !!draftAssetId, `status=${draftUpload.status}`, draftUpload.raw);

  const adminList = await api('GET', '/admin/media/gallery?scope=system_gallery', undefined, adminToken);
  record('Admin lista biblioteca global', adminList.status === 200 && !!globalAssetId && listContainsAsset(adminList.data, globalAssetId), `status=${adminList.status}`, adminList.raw);

  const tenantSystemList = await api('GET', '/media/assets?origin=system', undefined, tenantAToken);
  record('Tenant ve midia global publicada', tenantSystemList.status === 200 && !!globalAssetId && listContainsAsset(tenantSystemList.data, globalAssetId), `status=${tenantSystemList.status}`, tenantSystemList.raw);
  record('Tenant nao ve rascunho global', tenantSystemList.status === 200 && !!draftAssetId && !listContainsAsset(tenantSystemList.data, draftAssetId), `status=${tenantSystemList.status}`, tenantSystemList.raw);

  const selectGlobal = await api('PATCH', `/catalog/products/${placeholderProductId}`, { mediaAssetId: globalAssetId }, tenantAToken);
  record('Tenant seleciona imagem global no produto', selectGlobal.status === 200 && pickString(selectGlobal.data, 'mediaAssetId') === globalAssetId, `status=${selectGlobal.status}`, selectGlobal.raw);

  const storefrontGlobal = await api('GET', `/public/storefront/${TENANT_A_SLUG}?mediaGlobal=${Date.now()}`);
  record('Storefront publica imagem global como SYSTEM_GALLERY', storefrontHasProductSource(storefrontGlobal.data, placeholderProductId, 'SYSTEM_GALLERY'), `status=${storefrontGlobal.status}`, storefrontGlobal.raw);

  const tenantUpload = await upload('/media/upload', tenantAToken, imageBlob, 'tenant-media.png', [
    { name: 'title', value: 'Smoke Tenant Media' },
    { name: 'altText', value: 'Imagem tenant smoke' },
    { name: 'tags', value: 'smoke,tenant' },
  ]);
  const tenantAssetId = pickString(tenantUpload.data, 'id');
  record('Tenant faz upload na biblioteca propria', tenantUpload.status < 300 && !!tenantAssetId, `status=${tenantUpload.status}`, tenantUpload.raw);

  const tenantOwnList = await api('GET', '/media/assets?origin=tenant', undefined, tenantAToken);
  record('Tenant lista biblioteca propria', tenantOwnList.status === 200 && !!tenantAssetId && listContainsAsset(tenantOwnList.data, tenantAssetId), `status=${tenantOwnList.status}`, tenantOwnList.raw);

  if (!tenantAssetId) throw new Error('Upload tenant nao retornou asset id.');
  const selectTenant = await api('PATCH', `/catalog/products/${placeholderProductId}`, { mediaAssetId: tenantAssetId }, tenantAToken);
  record('Tenant seleciona imagem propria no produto', selectTenant.status === 200 && pickString(selectTenant.data, 'mediaAssetId') === tenantAssetId, `status=${selectTenant.status}`, selectTenant.raw);

  const storefrontTenant = await api('GET', `/public/storefront/${TENANT_A_SLUG}?mediaTenant=${Date.now()}`);
  record('Storefront publica imagem tenant como TENANT_MEDIA', storefrontHasProductSource(storefrontTenant.data, placeholderProductId, 'TENANT_MEDIA'), `status=${storefrontTenant.status}`, storefrontTenant.raw);

  const tenantBUpload = await upload('/media/upload', tenantBToken, imageBlob, 'tenant-b-media.png', [
    { name: 'title', value: 'Smoke Tenant B Media' },
  ]);
  const tenantBAssetId = pickString(tenantBUpload.data, 'id');
  record('Tenant B cria midia propria', tenantBUpload.status < 300 && !!tenantBAssetId, `status=${tenantBUpload.status}`, tenantBUpload.raw);

  if (!tenantBAssetId) throw new Error('Upload Tenant B nao retornou asset id.');
  const crossGet = await api('GET', `/media/assets/${tenantBAssetId}`, undefined, tenantAToken);
  record('Tenant A nao acessa midia privada do Tenant B', crossGet.status === 404 || crossGet.status === 403, `status=${crossGet.status}`, crossGet.raw);

  const crossSelect = await api('PATCH', `/catalog/products/${placeholderProductId}`, { mediaAssetId: tenantBAssetId }, tenantAToken);
  record('Tenant A nao seleciona midia privada do Tenant B', crossSelect.status === 400 || crossSelect.status === 403 || crossSelect.status === 404, `status=${crossSelect.status}`, crossSelect.raw);

  const clearImage = await api('PATCH', `/catalog/products/${placeholderProductId}`, { mediaAssetId: null, image: '' }, tenantAToken);
  record('Tenant remove imagem do produto', clearImage.status === 200 && pickString(clearImage.data, 'mediaAssetId') === null, `status=${clearImage.status}`, clearImage.raw);
  const storefrontPlaceholder = await api('GET', `/public/storefront/${TENANT_A_SLUG}?mediaPlaceholder=${Date.now()}`);
  record('Produto sem imagem cai em placeholder', storefrontHasProductSource(storefrontPlaceholder.data, placeholderProductId, 'PLACEHOLDER'), `status=${storefrontPlaceholder.status}`, storefrontPlaceholder.raw);

  const svgBlob = new Blob([new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))], { type: 'image/svg+xml' });
  const svgUpload = await upload('/media/upload', tenantAToken, svgBlob, 'bad.svg');
  record('Upload SVG e rejeitado', svgUpload.status >= 400, `status=${svgUpload.status}`, svgUpload.raw);

  const mismatchedUpload = await upload('/media/upload', tenantAToken, imageBlob, 'mismatch.jpg');
  record('Upload com extensao/mime divergente e rejeitado', mismatchedUpload.status >= 400, `status=${mismatchedUpload.status}`, mismatchedUpload.raw);

  const traversalUpload = await upload('/media/upload', tenantAToken, imageBlob, '..%2fevil.png');
  record('Upload com filename traversal e rejeitado', traversalUpload.status >= 400, `status=${traversalUpload.status}`, traversalUpload.raw);

  const hugeBlob = new Blob([new Uint8Array(11 * 1024 * 1024)], { type: 'image/png' });
  const hugeUpload = await upload('/media/upload', tenantAToken, hugeBlob, 'too-big.png');
  record('Upload acima do limite e rejeitado', hugeUpload.status >= 400, `status=${hugeUpload.status}`, hugeUpload.raw);

  const deletedTenantAsset = await api('DELETE', `/media/assets/${tenantAssetId}`, undefined, tenantAToken);
  record('Tenant remove asset proprio por soft delete', deletedTenantAsset.status === 200 && pickBool(deletedTenantAsset.data, 'isActive') === false, `status=${deletedTenantAsset.status}`, deletedTenantAsset.raw);

  const deletedGlobalAsset = await api('DELETE', `/admin/media/gallery/${globalAssetId}`, undefined, adminToken);
  record('Admin remove asset global por soft delete', deletedGlobalAsset.status === 200 && pickBool(deletedGlobalAsset.data, 'isActive') === false, `status=${deletedGlobalAsset.status}`, deletedGlobalAsset.raw);

  const firstProduct = firstStorefrontProduct(storefrontPlaceholder.data);
  record('Payload publico inclui origem de imagem', storefrontPlaceholder.status === 200 && !!firstProduct.id && !!firstProduct.imageSource, `source=${firstProduct.imageSource ?? 'none'}`, storefrontPlaceholder.raw);

  const failed = results.filter((result) => !result.passed);
  process.stdout.write(`\nResumo smoke:media: ${results.length - failed.length} OK, ${failed.length} falha(s)\n`);
  for (const failure of failed) process.stdout.write(`- ${failure.name}: ${failure.detail}\n`);
  process.exitCode = failed.length ? 1 : 0;
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`SMOKE MEDIA crashed: ${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
