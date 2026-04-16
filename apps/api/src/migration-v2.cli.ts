import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { CatalogMigrationV2Service } from './catalog/migration-v2.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const migrationService = app.get(CatalogMigrationV2Service);
  
  try {
    await migrationService.runMigration();
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();
