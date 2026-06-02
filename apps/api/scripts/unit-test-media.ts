import { BadRequestException } from '@nestjs/common';
import { validateBufferSafety } from '../src/upload/upload.service';
import { StorageService } from '../src/upload/storage.service';
import { UploadService } from '../src/upload/upload.service';
import { TenantService } from '../src/tenant/tenant.service';
import * as path from 'path';
import * as fs from 'fs';

declare const process: { exitCode?: number };

type TestResult = {
  name: string;
  passed: boolean;
  detail: string;
};

const results: TestResult[] = [];

function assert(name: string, condition: boolean, detail: string, payload?: unknown) {
  const fullDetail = payload ? `${detail} | Payload: ${JSON.stringify(payload)}` : detail;
  results.push({ name, passed: condition, detail: fullDetail });
  console.log(condition ? `  OK  ${name}` : `  ERR ${name}: ${fullDetail}`);
}

async function main() {
  console.log('=== UNIT TEST: MEDIA HARDENING & QA ===\n');

  // ==========================================
  // TEST CASE 1: validateBufferSafety
  // ==========================================
  
  // Valid JPEG magic number
  const validJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]);
  try {
    validateBufferSafety(validJpeg, 'image/jpeg');
    assert('validateBufferSafety: Aceita JPEG válido com assinatura correta', true, 'Sucesso');
  } catch (err) {
    assert('validateBufferSafety: Aceita JPEG válido com assinatura correta', false, String(err));
  }

  // Invalid JPEG signature
  const invalidJpeg = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  try {
    validateBufferSafety(invalidJpeg, 'image/jpeg');
    assert('validateBufferSafety: Rejeita JPEG com assinatura inválida', false, 'Deveria ter lançado erro');
  } catch (err) {
    assert('validateBufferSafety: Rejeita JPEG com assinatura inválida', err instanceof BadRequestException && err.message.includes('JPEG'), `Erro esperado, lançado: ${String(err)}`);
  }

  // Valid PNG magic number
  const validPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  try {
    validateBufferSafety(validPng, 'image/png');
    assert('validateBufferSafety: Aceita PNG válido com assinatura correta', true, 'Sucesso');
  } catch (err) {
    assert('validateBufferSafety: Aceita PNG válido com assinatura correta', false, String(err));
  }

  // Valid WebP magic number
  const validWebp = Buffer.alloc(12);
  validWebp.write('RIFF', 0, 4, 'ascii');
  validWebp.write('WEBP', 8, 4, 'ascii');
  try {
    validateBufferSafety(validWebp, 'image/webp');
    assert('validateBufferSafety: Aceita WebP válido com assinatura correta', true, 'Sucesso');
  } catch (err) {
    assert('validateBufferSafety: Aceita WebP válido com assinatura correta', false, String(err));
  }

  // Block SVG content disguised as JPEG
  // We write "<svg" header inside the JPEG buffer
  const fakeJpegWithSvg = Buffer.concat([
    Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]),
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
  ]);
  try {
    validateBufferSafety(fakeJpegWithSvg, 'image/jpeg');
    assert('validateBufferSafety: Rejeita SVG contido no buffer (mimetype forjado)', false, 'Deveria ter detectado SVG no buffer');
  } catch (err) {
    assert('validateBufferSafety: Rejeita SVG contido no buffer (mimetype forjado)', err instanceof BadRequestException && err.message.includes('perigoso'), `Bloqueou SVG com sucesso: ${String(err)}`);
  }

  // Block scripts/HTML tags inside image buffer
  const fakePngWithScript = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    Buffer.from('<script>alert(1)</script>')
  ]);
  try {
    validateBufferSafety(fakePngWithScript, 'image/png');
    assert('validateBufferSafety: Rejeita script contido no buffer', false, 'Deveria ter detectado script no buffer');
  } catch (err) {
    assert('validateBufferSafety: Rejeita script contido no buffer', err instanceof BadRequestException && err.message.includes('perigoso'), `Bloqueou script com sucesso: ${String(err)}`);
  }


  // ==========================================
  // TEST CASE 2: StorageService Path Traversal
  // ==========================================
  const mockConfig = {
    get: (key: string, fallback?: any) => {
      if (key === 'STORAGE_DRIVER') return 'local';
      if (key === 'UPLOAD_DIR') return 'uploads_test';
      return fallback;
    },
    getOrThrow: (key: string) => {
      throw new Error('Not implemented');
    }
  } as any;

  const storageService = new StorageService(mockConfig);

  // Test write/delete path traversal detection
  let uploadTraversalThrown = false;
  try {
    await storageService.uploadBuffer({
      buffer: Buffer.from('test'),
      key: '../traversal-test.webp',
      contentType: 'image/webp'
    });
  } catch (err) {
    uploadTraversalThrown = err instanceof BadRequestException && err.message.includes('path traversal');
  }
  assert('StorageService: Impede upload fora da pasta base (Path Traversal)', uploadTraversalThrown, 'Barrou tentativa de subida de nível');

  let deleteTraversalThrown = false;
  try {
    await storageService.delete('../traversal-test.webp');
  } catch (err) {
    deleteTraversalThrown = err instanceof BadRequestException && err.message.includes('path traversal');
  }
  assert('StorageService: Impede delete fora da pasta base (Path Traversal)', deleteTraversalThrown, 'Barrou tentativa de deleção fora de nível');


  // ==========================================
  // TEST CASE 3: UploadService delete reference cleanup & cache invalidation
  // ==========================================
  const dbData = {
    mediaAsset: {
      tenantId: 'tenant-a',
      path: 'tenants/tenant-a/storefront-background/asset-1.webp',
      publicUrl: 'http://cdn.com/asset-1.webp'
    },
    tenantSettings: {
      tenantId: 'tenant-a',
      storefrontThemeJson: {
        backgroundImageMediaId: 'asset-1',
        backgroundImageUrl: 'http://cdn.com/asset-1.webp'
      }
    }
  };

  let updateSettingsCalled = false;
  let cacheInvalidatedKeys: string[] = [];

  const mockPrisma = {
    mediaAsset: {
      findFirst: async () => ({
        id: 'asset-1',
        tenantId: 'tenant-a',
        path: dbData.mediaAsset.path,
        publicUrl: dbData.mediaAsset.publicUrl
      }),
      delete: async () => ({ id: 'asset-1' })
    },
    tenantSettings: {
      findUnique: async () => ({
        tenantId: 'tenant-a',
        storefrontThemeJson: dbData.tenantSettings.storefrontThemeJson,
        tenant: { slug: 'tenant-a-slug' }
      }),
      update: async (args: any) => {
        updateSettingsCalled = true;
        assert('UploadService: Limpa o ID e a URL do background nas configurações do inquilino', args.data.storefrontThemeJson.backgroundImageMediaId === null && args.data.storefrontThemeJson.backgroundImageUrl === null, 'Deletou as referências com sucesso');
        return {};
      }
    }
  } as any;

  const mockStorage = {
    delete: async (path: string) => {
      assert('UploadService: Chama delete físico do Storage correspondente', path === dbData.mediaAsset.path, 'Deletou arquivo do storage');
    }
  } as any;

  const mockOptimizer = {} as any;
  const mockCache = {
    del: async (key: string) => {
      cacheInvalidatedKeys.push(key);
    }
  } as any;

  const mockUploadConfig = {
    get: (key: string) => 10 * 1024 * 1024
  } as any;

  const uploadService = new UploadService(
    mockPrisma,
    mockStorage,
    mockOptimizer,
    mockUploadConfig,
    mockCache
  );

  await uploadService.deleteMediaAsset('tenant-a', 'asset-1');
  assert('UploadService: Invalida o cache do storefront ao deletar a mídia', cacheInvalidatedKeys.includes('storefront:tenant-a-slug:delivery') && cacheInvalidatedKeys.includes('storefront:tenant-a-slug:pickup'), 'Invalidação das chaves delivery e pickup');


  // ==========================================
  // TEST CASE 4: TenantService.updateStorefrontCustomization Multi-tenant checks
  // ==========================================
  const mockTenantPrisma = {
    mediaAsset: {
      // Retorna nulo se tentar associar mídia pertencente a outro tenant (ou inexistente)
      findFirst: async (args: any) => {
        const { id, tenantId } = args.where;
        if (id === 'asset-belonging-to-tenant-b' && tenantId === 'tenant-a') {
          return null; // Don't allow access!
        }
        if (id === 'asset-belonging-to-tenant-a' && tenantId === 'tenant-a') {
          return { id: 'asset-belonging-to-tenant-a', tenantId: 'tenant-a', publicUrl: 'http://cdn.com/my-asset.webp' };
        }
        return null;
      }
    },
    tenantSettings: {
      update: async (args: any) => {
        return {
          storefrontThemeJson: args.data.storefrontThemeJson,
          storefrontLayoutJson: {},
          tenant: { slug: 'tenant-a-slug' }
        };
      }
    }
  } as any;

  const tenantService = new TenantService(mockTenantPrisma, mockCache);

  // Tenant A tries to set Tenant B's asset as background
  let bkgInjectionFailed = false;
  try {
    await tenantService.updateStorefrontCustomization('tenant-a', {
      theme: {
        backgroundImageMediaId: 'asset-belonging-to-tenant-b',
        backgroundImageUrl: 'http://cdn.com/different-url.webp'
      }
    });
  } catch (err) {
    bkgInjectionFailed = err instanceof BadRequestException && err.message.includes('outro inquilino');
  }
  assert('TenantService: Bloqueia Tenant A de aplicar mídia do Tenant B como background', bkgInjectionFailed, 'Erro lançado corretamente impedindo injeção de ID estrangeiro');

  // Tenant A sets their own asset as background
  try {
    const updated = await tenantService.updateStorefrontCustomization('tenant-a', {
      theme: {
        backgroundImageMediaId: 'asset-belonging-to-tenant-a',
        backgroundImageUrl: 'http://hacker.com/spoofed.webp' // Tentando forçar outra URL
      }
    });
    // Check if backgroundImageUrl was forced to the database URL instead of the spoofed one
    assert('TenantService: Sobrescreve a URL enviada com a URL oficial do banco (evita injeção de links arbitrários)', updated.theme.backgroundImageUrl === 'http://cdn.com/my-asset.webp', `URL forçada: ${updated.theme.backgroundImageUrl}`);
  } catch (err) {
    assert('TenantService: Permite Tenant A associar sua própria mídia', false, String(err));
  }


  // ==========================================
  // SUMMARY
  // ==========================================
  const failed = results.filter((r) => !r.passed);
  console.log(`\n=== RESULTS: ${results.length - failed.length} passed, ${failed.length} failed ===`);
  if (failed.length) {
    failed.forEach((f) => console.log(`- FAIL: ${f.name}: ${f.detail}`));
    process.exitCode = 1;
  } else {
    console.log('✅ All tests completed successfully!');
  }
}

main().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exitCode = 1;
});
