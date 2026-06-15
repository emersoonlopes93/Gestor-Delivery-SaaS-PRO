import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { slugify } from '@gestor/utils';
import { MENU_TEMPLATES, type ProductTemplate } from '../src/catalog/menu-import/menu-templates.data';

type PublicationStatus = 'draft' | 'published';

type CliOptions = {
  templateIds: Set<string>;
  publicationStatus: PublicationStatus;
  force: boolean;
  dryRun: boolean;
  exportManifest: boolean;
  executeAiGeneration: boolean;
  limit: number | null;
  manifestPath: string;
  promptsPath: string;
};

type GenerationItem = {
  templateId: string;
  templateName: string;
  categoryName: string;
  product: ProductTemplate & {
    mediaLookupKey: string;
    mediaCategory: string;
    mediaPrompt: string;
  };
};

type ManifestEntry = {
  segment: string;
  segmentName: string;
  category: string;
  productName: string;
  mediaLookupKey: string;
  fileName: string;
  altText: string;
  publicationStatus: PublicationStatus;
  tags: string[];
  prompt: string;
  negativePrompt: string;
  metadata: Prisma.InputJsonObject;
};

const DEFAULT_TEMPLATE_IDS = new Set(['acai', 'padaria-cafeteria']);
const SCRIPT_USER_ID = 'system:menu-import-media-generator';
const NEGATIVE_PROMPT =
  'sem texto, sem logotipo, sem marca d agua, sem embalagem de marca, sem pessoas, sem maos, sem distorcoes, sem objetos cortados, sem identidade de terceiros';

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const items = collectGenerationItems(options);

  if (!options.dryRun && !options.exportManifest && !options.executeAiGeneration) {
    throw new Error(
      'Este comando pode consumir creditos de API. Use --export-manifest para gerar apenas prompts ou --execute-ai-generation para executar geracao real.',
    );
  }

  if (items.length === 0) {
    console.log('Nenhum item com prompt de midia encontrado para os templates selecionados.');
    return;
  }

  if (options.exportManifest) {
    exportManifestFiles(items, options);
    return;
  }

  console.log(`Preparando ${items.length} imagens globais para Banco Global (${options.publicationStatus}).`);

  if (options.dryRun) {
    for (const item of items) {
      console.log(`[DRY RUN] ${item.templateName} / ${item.categoryName} / ${item.product.name} -> ${item.product.mediaLookupKey}`);
    }
    return;
  }

  const [{ AppModule }, { PrismaService }, { MediaLibraryService }, { OpenAiImageProvider }] = await Promise.all([
    import('../src/app.module'),
    import('../src/database/prisma.service'),
    import('../src/upload/media-library.service'),
    import('../src/ai-agent/providers/openai-image.provider'),
  ]);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const prisma = app.get(PrismaService);
  const media = app.get(MediaLibraryService);
  const imageProvider = app.get(OpenAiImageProvider);

  try {
    const isAvailable = await imageProvider.isAvailable();
    if (!isAvailable) {
      throw new Error('Provider de imagem OpenAI indisponivel. Configure a chave no SaaS Admin ou ENV antes de rodar o lote.');
    }

    let created = 0;
    let skipped = 0;

    for (const item of items) {
      const existing = await prisma.mediaAsset.findFirst({
        where: {
          tenantId: null,
          scope: 'system_gallery',
          isSystem: true,
          deletedAt: null,
          tagsJson: { array_contains: [item.product.mediaLookupKey] },
        },
        select: { id: true, title: true, publicationStatus: true },
      });

      if (existing && !options.force) {
        skipped++;
        console.log(`[PULANDO] ${item.product.name}: ja existe asset ${existing.id} (${existing.publicationStatus}).`);
        continue;
      }

      const category = await media.upsertCategory('system_gallery', null, {
        name: item.product.mediaCategory,
        isActive: true,
      });

      console.log(`[GERANDO] ${item.product.name} (${item.product.mediaLookupKey})...`);
      const generated = await imageProvider.generateImage({
        prompt: item.product.mediaPrompt,
        n: 1,
        size: '1024x1024',
        response_format: 'b64_json',
      });

      const image = generated.data[0];
      if (generated.error || !image?.b64_json) {
        const message = generated.error?.message ?? 'Imagem nao retornada pelo provider.';
        console.warn(`[FALHA] ${item.product.name}: ${message}`);
        continue;
      }

      const buffer = Buffer.from(image.b64_json, 'base64');
      const manifestEntry = toManifestEntry(item, options.publicationStatus);
      const categoryRecord = await media.upsertCategory('system_gallery', null, {
        name: item.product.mediaCategory,
        isActive: true,
      });

      const safeTitle = item.product.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const asset = await media.uploadSystemAsset(
        {
          buffer,
          originalname: `ai_generated_${safeTitle}.png`,
          mimetype: 'image/png',
          size: buffer.length,
        },
        {
          title: item.product.name,
          altText: manifestEntry.altText,
          description: `Prompt: ${item.product.mediaPrompt}`,
          categoryId: categoryRecord.id ?? category.id,
          publicationStatus: options.publicationStatus,
          tags: manifestEntry.tags,
          metadata: manifestEntry.metadata,
        },
        SCRIPT_USER_ID,
      );

      created++;
      console.log(`[OK] ${item.product.name}: asset ${asset.id}`);
    }

    console.log(`Concluido. Criados: ${created}. Ignorados: ${skipped}.`);
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
}

function exportManifestFiles(items: GenerationItem[], options: CliOptions): void {
  const entries = items.map((item) => toManifestEntry(item, options.publicationStatus));
  ensureParentDirectory(options.manifestPath);
  ensureParentDirectory(options.promptsPath);

  fs.writeFileSync(options.manifestPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf-8');
  fs.writeFileSync(options.promptsPath, toMarkdown(entries), 'utf-8');

  console.log(`Manifesto JSON gerado: ${options.manifestPath}`);
  console.log(`Prompts Markdown gerados: ${options.promptsPath}`);
  console.log(`Total de itens exportados: ${entries.length}`);
}

function toManifestEntry(item: GenerationItem, publicationStatus: PublicationStatus): ManifestEntry {
  const lookupTag = item.product.mediaLookupKey;
  const lookupValue = lookupTag.replace(/^lookup:/, '');
  const categoryTag = `category:${slugify(item.categoryName).replace(/-/g, '_')}`;
  const segmentTag = `segment:${item.templateId}`;
  const tags = Array.from(new Set([
    lookupTag,
    ...item.product.searchTags,
    segmentTag,
    categoryTag,
    'source:menu_import_base',
  ]));

  const metadata: Prisma.InputJsonObject = {
    source: 'base_menu_image_manifest',
    segment: item.templateId,
    segmentName: item.templateName,
    category: item.categoryName,
    productName: item.product.name,
    mediaLookupKey: lookupTag,
    fileName: `${lookupValue}.webp`,
    prompt: item.product.mediaPrompt,
    negativePrompt: NEGATIVE_PROMPT,
  };

  return {
    segment: item.templateId,
    segmentName: item.templateName,
    category: item.categoryName,
    productName: item.product.name,
    mediaLookupKey: lookupTag,
    fileName: `${lookupValue}.webp`,
    altText: `Imagem comercial generica de ${item.product.name}`,
    publicationStatus,
    tags,
    prompt: item.product.mediaPrompt,
    negativePrompt: NEGATIVE_PROMPT,
    metadata,
  };
}

function toMarkdown(entries: ManifestEntry[]): string {
  const lines = [
    '# Prompts de Imagens do Cardapio Base',
    '',
    'Use estes prompts fora do backend. Salve cada imagem com o nome indicado em `fileName` para importar depois.',
    '',
  ];

  for (const entry of entries) {
    lines.push(`## ${entry.segmentName} / ${entry.category} / ${entry.productName}`);
    lines.push('');
    lines.push(`- Arquivo: \`${entry.fileName}\``);
    lines.push(`- Lookup: \`${entry.mediaLookupKey}\``);
    lines.push(`- Tags: ${entry.tags.map((tag) => `\`${tag}\``).join(', ')}`);
    lines.push('');
    lines.push('Prompt:');
    lines.push('');
    lines.push(entry.prompt);
    lines.push('');
    lines.push('Negative prompt:');
    lines.push('');
    lines.push(entry.negativePrompt);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function collectGenerationItems(options: CliOptions): GenerationItem[] {
  const items: GenerationItem[] = [];

  for (const template of MENU_TEMPLATES) {
    if (!options.templateIds.has(template.id)) continue;

    for (const category of template.categories) {
      for (const product of category.products) {
        if (!product.mediaLookupKey || !product.mediaPrompt) continue;
        items.push({
          templateId: template.id,
          templateName: template.name,
          categoryName: category.name,
          product: {
            ...product,
            mediaLookupKey: product.mediaLookupKey,
            mediaCategory: product.mediaCategory ?? category.name,
            mediaPrompt: product.mediaPrompt,
          },
        });
      }
    }
  }

  return options.limit === null ? items : items.slice(0, options.limit);
}

function parseCliOptions(args: string[]): CliOptions {
  const templateArg = readArg(args, '--templates');
  const statusArg = readArg(args, '--status');
  const limitArg = readArg(args, '--limit');
  const manifestArg = readArg(args, '--manifest-output');
  const promptsArg = readArg(args, '--prompts-output');

  const templateIds = templateArg
    ? new Set(templateArg.split(',').map((item) => item.trim()).filter(Boolean))
    : DEFAULT_TEMPLATE_IDS;

  const publicationStatus = statusArg === 'published' ? 'published' : 'draft';
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');
  const exportManifest = args.includes('--export-manifest');
  const executeAiGeneration = args.includes('--execute-ai-generation');
  const parsedLimit = limitArg ? Number.parseInt(limitArg, 10) : Number.NaN;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;
  const generatedDir = path.resolve(process.cwd(), 'generated');

  return {
    templateIds,
    publicationStatus,
    force,
    dryRun,
    exportManifest,
    executeAiGeneration,
    limit,
    manifestPath: path.resolve(process.cwd(), manifestArg ?? path.join(generatedDir, 'base-menu-image-manifest.json')),
    promptsPath: path.resolve(process.cwd(), promptsArg ?? path.join(generatedDir, 'base-menu-image-prompts.md')),
  };
}

function readArg(args: string[], name: string): string | null {
  const withEquals = args.find((arg) => arg.startsWith(`${name}=`));
  if (withEquals) return withEquals.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;

  return null;
}

function ensureParentDirectory(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Falha ao preparar imagens globais: ${message}`);
  process.exitCode = 1;
});
