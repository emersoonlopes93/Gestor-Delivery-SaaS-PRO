import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

type PublicationStatus = 'draft' | 'published';

type ManifestEntry = {
  segment: string;
  segmentName: string;
  category: string;
  productName: string;
  mediaLookupKey: string;
  fileName: string;
  altText: string;
  publicationStatus?: PublicationStatus;
  tags: string[];
  prompt: string;
  negativePrompt?: string;
  metadata: Prisma.InputJsonObject;
};

type CliOptions = {
  manifestPath: string;
  imageDir: string;
  publicationStatus: PublicationStatus;
  dryRun: boolean;
  force: boolean;
  skipExisting: boolean;
  limit: number | null;
};

const SCRIPT_USER_ID = 'system:base-menu-media-importer';

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const entries = readManifest(options.manifestPath);
  const selectedEntries = options.limit === null ? entries : entries.slice(0, options.limit);

  if (selectedEntries.length === 0) {
    console.log('Manifesto sem itens para importar.');
    return;
  }

  if (options.dryRun) {
    dryRunImport(selectedEntries, options);
    return;
  }

  const [{ AppModule }, { PrismaService }, { MediaLibraryService }] = await Promise.all([
    import('../src/app.module'),
    import('../src/database/prisma.service'),
    import('../src/upload/media-library.service'),
  ]);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const prisma = app.get(PrismaService);
  const media = app.get(MediaLibraryService);

  try {
    let imported = 0;
    let skipped = 0;
    let missing = 0;

    for (const entry of selectedEntries) {
      const filePath = path.resolve(options.imageDir, entry.fileName);
      if (!fs.existsSync(filePath)) {
        missing++;
        console.warn(`[AVISO] Arquivo ausente, pulando: ${filePath}`);
        continue;
      }

      const existing = await prisma.mediaAsset.findFirst({
        where: {
          tenantId: null,
          scope: 'system_gallery',
          isSystem: true,
          deletedAt: null,
          tagsJson: { array_contains: [entry.mediaLookupKey] },
        },
        select: { id: true, title: true, publicationStatus: true },
      });

      if (existing && !options.force) {
        skipped++;
        const action = options.skipExisting ? 'pulando' : 'use --force para substituir';
        console.log(`[PULANDO] ${entry.productName}: asset existente ${existing.id} (${existing.publicationStatus}); ${action}.`);
        continue;
      }

      if (existing && options.force) {
        await media.deleteSystemAsset(existing.id);
      }

      const category = await media.upsertCategory('system_gallery', null, {
        name: entry.category,
        isActive: true,
      });

      const buffer = fs.readFileSync(filePath);
      const asset = await media.uploadSystemAsset(
        {
          buffer,
          originalname: entry.fileName,
          mimetype: mimeTypeForFile(entry.fileName),
          size: buffer.length,
        },
        {
          title: entry.productName,
          altText: entry.altText,
          description: `Prompt: ${entry.prompt}`,
          categoryId: category.id,
          publicationStatus: options.publicationStatus,
          tags: entry.tags,
          metadata: mergeMetadata(entry, options.publicationStatus),
        },
        SCRIPT_USER_ID,
      );

      imported++;
      console.log(`[OK] ${entry.productName}: asset ${asset.id}`);
    }

    console.log(`Concluido. Importados: ${imported}. Ignorados: ${skipped}. Ausentes: ${missing}.`);
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
}

function dryRunImport(entries: ManifestEntry[], options: CliOptions): void {
  let existingFiles = 0;
  let missingFiles = 0;

  for (const entry of entries) {
    const filePath = path.resolve(options.imageDir, entry.fileName);
    if (fs.existsSync(filePath)) {
      existingFiles++;
      console.log(`[DRY RUN] Importaria ${entry.productName} como system_gallery/${options.publicationStatus}: ${filePath}`);
      console.log(`          tags=${entry.tags.join(', ')}`);
    } else {
      missingFiles++;
      console.warn(`[DRY RUN][AVISO] Arquivo ausente, nao falharia o lote: ${filePath}`);
    }
  }

  console.log(`Dry-run concluido. Arquivos encontrados: ${existingFiles}. Ausentes: ${missingFiles}.`);
}

function parseCliOptions(args: string[]): CliOptions {
  const manifestArg = readArg(args, '--manifest');
  const dirArg = readArg(args, '--dir');
  const statusArg = readArg(args, '--status');
  const limitArg = readArg(args, '--limit');

  const parsedLimit = limitArg ? Number.parseInt(limitArg, 10) : Number.NaN;

  return {
    manifestPath: path.resolve(process.cwd(), manifestArg ?? path.join('generated', 'base-menu-image-manifest.json')),
    imageDir: path.resolve(process.cwd(), dirArg ?? 'generated-images'),
    publicationStatus: statusArg === 'published' ? 'published' : 'draft',
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    skipExisting: !args.includes('--force'),
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null,
  };
}

function readManifest(manifestPath: string): ManifestEntry[] {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifesto nao encontrado: ${manifestPath}`);
  }

  const parsed: unknown = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  if (!Array.isArray(parsed)) {
    throw new Error('Manifesto invalido: esperado array JSON.');
  }

  return parsed.map((entry, index) => {
    if (!isManifestEntry(entry)) {
      throw new Error(`Manifesto invalido no item ${index + 1}.`);
    }
    return entry;
  });
}

function isManifestEntry(value: unknown): value is ManifestEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value.segment === 'string' &&
    typeof value.segmentName === 'string' &&
    typeof value.category === 'string' &&
    typeof value.productName === 'string' &&
    typeof value.mediaLookupKey === 'string' &&
    typeof value.fileName === 'string' &&
    typeof value.altText === 'string' &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === 'string') &&
    typeof value.prompt === 'string' &&
    isRecord(value.metadata)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeMetadata(entry: ManifestEntry, publicationStatus: PublicationStatus): Prisma.InputJsonObject {
  return {
    ...entry.metadata,
    importedFromManifest: true,
    importedAt: new Date().toISOString(),
    publicationStatus,
  };
}

function mimeTypeForFile(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  throw new Error(`Formato nao suportado para ${fileName}. Use .webp, .png, .jpg ou .jpeg.`);
}

function readArg(args: string[], name: string): string | null {
  const withEquals = args.find((arg) => arg.startsWith(`${name}=`));
  if (withEquals) return withEquals.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;

  return null;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Falha ao importar imagens do Cardapio Base: ${message}`);
  process.exitCode = 1;
});
