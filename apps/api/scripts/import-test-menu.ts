import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MenuImportService } from '../src/catalog/menu-import/menu-import.service';
import { PrismaService } from '../src/database/prisma.service';
import { TenantContextService } from '../src/common/context/tenant-context.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const importService = app.get(MenuImportService);
  const tenantContext = app.get(TenantContextService);

  const tenant = await prisma.tenant.findUnique({ where: { slug: 'tenant-teste-base-menu' } });
  if (!tenant) throw new Error('Tenant not found');

  const template = await prisma.baseMenuTemplate.findFirst({
    where: { name: 'Açaí' },
    include: {
      versions: {
        where: { status: 'published' }
      }
    }
  });

  if (!template || template.versions.length === 0) throw new Error('Template not found');

  console.log(`Starting import for tenant ${tenant.id} template ${template.slug} version ${template.versions[0].versionNumber}`);

  await new Promise<void>((resolve, reject) => {
    tenantContext.run(tenant.id, () => {
      importService.importTemplate(template.slug, { skipExisting: true })
        .then(result => {
          console.log('Import result:', JSON.stringify(result, null, 2));
          resolve();
        })
        .catch(reject);
    });
  });

  await app.close();
}

run().catch(console.error);
