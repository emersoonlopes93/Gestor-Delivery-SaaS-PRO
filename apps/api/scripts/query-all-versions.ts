import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  console.log('Querying all versions for template acai...');
  const template = await prisma.baseMenuTemplate.findUnique({
    where: { slug: 'acai' }
  });
  if (!template) {
    console.error('Acai template not found');
    await app.close();
    return;
  }

  console.log('Template ID:', template.id);
  const versions = await prisma.baseMenuTemplateVersion.findMany({
    where: { templateId: template.id }
  });

  console.log('All Versions in DB:', JSON.stringify(versions, null, 2));

  await app.close();
}

run().catch(console.error);
