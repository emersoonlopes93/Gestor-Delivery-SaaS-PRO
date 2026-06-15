import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { StorageService } from '../apps/api/src/upload/storage.service';
import { UploadService } from '../apps/api/src/upload/upload.service';
import { slugify } from '@gestor/utils';

// Helper mock para o config service do Storage
class MockConfigService {
  private config: Record<string, string> = {
    MEDIA_STORAGE_PROVIDER: process.env.MEDIA_STORAGE_PROVIDER || process.env.STORAGE_DRIVER || 'local',
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID || '',
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || '',
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || '',
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || '',
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL || '',
  };
  get(key: string) { return this.config[key]; }
}

const prisma = new PrismaClient();
const storage = new StorageService(new MockConfigService() as any);
const uploader = new UploadService(prisma, storage);

interface MetadataEntry {
  file: string;
  title: string;
  altText?: string;
  categorySlug?: string;
  publicationStatus?: 'published' | 'draft';
  tags?: string[];
}

async function main() {
  const args = process.argv.slice(2);
  const metadataPath = args[0];

  if (!metadataPath) {
    console.error(`
Uso: npx ts-node scripts/import-global-media.ts <caminho/para/metadata.json>

O metadata.json deve seguir o formato:
[
  {
    "file": "pizza.jpg",
    "title": "Pizza Calabresa",
    "categorySlug": "pizzas",
    "publicationStatus": "published",
    "tags": ["lookup:pizza_calabresa", "tag:pizza"]
  }
]
    `);
    process.exit(1);
  }

  const absoluteMetadataPath = path.resolve(metadataPath);
  const baseDir = path.dirname(absoluteMetadataPath);

  if (!fs.existsSync(absoluteMetadataPath)) {
    console.error(`Arquivo metadata.json nao encontrado: ${absoluteMetadataPath}`);
    process.exit(1);
  }

  const entries: MetadataEntry[] = JSON.parse(fs.readFileSync(absoluteMetadataPath, 'utf-8'));
  console.log(`Lendo ${entries.length} arquivos de mídia a partir de ${baseDir}...`);

  for (const entry of entries) {
    const filePath = path.join(baseDir, entry.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`[PULANDO] Arquivo não encontrado: ${filePath}`);
      continue;
    }

    let categoryId: string | null = null;
    let categoryName: string | null = null;

    if (entry.categorySlug) {
      const category = await prisma.mediaCategory.findFirst({
        where: { tenantId: null, scope: 'system_gallery', slug: entry.categorySlug },
      });
      if (!category) {
        // Auto-create category
        const titleCase = entry.categorySlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const newCat = await prisma.mediaCategory.create({
          data: {
            tenantId: null,
            scope: 'system_gallery',
            name: titleCase,
            slug: entry.categorySlug,
            isActive: true,
          }
        });
        categoryId = newCat.id;
        categoryName = newCat.name;
      } else {
        categoryId = category.id;
        categoryName = category.name;
      }
    }

    const buffer = fs.readFileSync(filePath);
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };
    const ext = path.extname(entry.file).toLowerCase();
    const mimetype = mimeMap[ext] || 'application/octet-stream';

    try {
      const uploaded = await uploader.createMediaAsset({
        tenantId: null,
        scope: 'system_gallery',
        file: {
          buffer,
          originalname: entry.file,
          mimetype,
          size: buffer.length,
        },
        title: entry.title,
        altText: entry.altText || entry.title,
        categoryId: categoryId,
        category: categoryName || undefined,
        tagsJson: entry.tags ? Array.from(new Set(entry.tags.map(t => t.trim().toLowerCase()))) : [],
        publicationStatus: entry.publicationStatus || 'draft',
      });
      console.log(`✅ [SUCESSO] ${entry.file} importado como ID: ${uploaded.id}`);
    } catch (err) {
      console.error(`❌ [ERRO] Falha ao importar ${entry.file}:`, err);
    }
  }

  console.log('Importação concluída com sucesso!');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
