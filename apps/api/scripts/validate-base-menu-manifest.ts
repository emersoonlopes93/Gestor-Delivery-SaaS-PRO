import * as fs from 'fs';
import * as path from 'path';
import { slugify } from '@gestor/utils';
import { MENU_TEMPLATES } from '../src/catalog/menu-import/menu-templates.data';

type ManifestEntry = {
  segment: string;
  segmentName: string;
  category: string;
  productName: string;
  mediaLookupKey: string;
  fileName: string;
  altText: string;
  publicationStatus?: string;
  tags: string[];
  prompt: string;
  negativePrompt?: string;
  metadata: Record<string, unknown>;
};

type TemplateProductIndex = {
  segment: string;
  category: string;
  productName: string;
  mediaLookupKey: string;
};

const allowedExtensions = new Set(['.webp', '.png', '.jpg', '.jpeg']);
const fileNamePattern = /^[a-z0-9][a-z0-9_-]*\.(webp|png|jpg|jpeg)$/;

function main(): void {
  const manifestPath = path.resolve(process.cwd(), readArg(process.argv.slice(2), '--manifest') ?? path.join('generated', 'base-menu-image-manifest.json'));
  const entries = readManifest(manifestPath);
  const productIndex = buildTemplateProductIndex();
  const errors: string[] = [];
  const warnings: string[] = [];

  validateDuplicates(entries, errors);
  validateEntries(entries, productIndex, errors, warnings);

  const validCount = entries.length - errors.length;
  console.log(`${entries.length} itens encontrados`);
  console.log(`${Math.max(validCount, 0)} validos`);
  console.log(`${errors.length} erros`);
  console.log(`${warnings.length} warnings`);

  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const warning of warnings) console.log(`- ${warning}`);
  }

  if (errors.length > 0) {
    console.log('\nErros:');
    for (const error of errors) console.log(`- ${error}`);
    process.exitCode = 1;
  }
}

function validateDuplicates(entries: ManifestEntry[], errors: string[]): void {
  reportDuplicates(entries.map((entry) => entry.mediaLookupKey), 'lookup duplicado', errors);
  reportDuplicates(entries.map((entry) => `${entry.segment}:${slugify(entry.productName)}`), 'slug duplicado', errors);
  reportDuplicates(entries.map((entry) => entry.fileName), 'filename duplicado', errors);
}

function validateEntries(entries: ManifestEntry[], productIndex: TemplateProductIndex[], errors: string[], warnings: string[]): void {
  for (const entry of entries) {
    const match = productIndex.find((product) =>
      product.segment === entry.segment &&
      product.category === entry.category &&
      product.productName === entry.productName &&
      product.mediaLookupKey === entry.mediaLookupKey
    );

    if (!match) {
      errors.push(`${entry.productName}: produto/categoria/lookup nao confere com os templates do Cardapio Base.`);
    }

    if (!entry.tags.includes(entry.mediaLookupKey)) {
      errors.push(`${entry.productName}: tags nao contem o mediaLookupKey ${entry.mediaLookupKey}.`);
    }

    if (!entry.tags.some((tag) => tag.startsWith('segment:'))) {
      errors.push(`${entry.productName}: tag segment:* obrigatoria ausente.`);
    }

    if (!entry.tags.some((tag) => tag.startsWith('category:'))) {
      errors.push(`${entry.productName}: tag category:* obrigatoria ausente.`);
    }

    for (const tag of entry.tags) {
      if (!/^[a-z0-9_:-]+$/.test(tag)) {
        errors.push(`${entry.productName}: tag invalida "${tag}".`);
      }
    }

    const ext = path.extname(entry.fileName).toLowerCase();
    if (!allowedExtensions.has(ext)) {
      errors.push(`${entry.productName}: extensao nao permitida em ${entry.fileName}.`);
    }

    if (!fileNamePattern.test(entry.fileName)) {
      errors.push(`${entry.productName}: filename fora do padrao ${entry.fileName}.`);
    }

    const expectedFile = `${entry.mediaLookupKey.replace(/^lookup:/, '')}.webp`;
    if (entry.fileName !== expectedFile) {
      warnings.push(`${entry.productName}: filename esperado ${expectedFile}, encontrado ${entry.fileName}.`);
    }

    const requiredMetadata = ['source', 'segment', 'category', 'productName', 'mediaLookupKey', 'fileName', 'prompt'];
    for (const key of requiredMetadata) {
      if (!(key in entry.metadata)) {
        errors.push(`${entry.productName}: metadata obrigatoria ausente: ${key}.`);
      }
    }

    if (!entry.prompt.toLowerCase().includes('sem texto')) {
      warnings.push(`${entry.productName}: prompt nao menciona "sem texto".`);
    }
    if (!entry.prompt.toLowerCase().includes('sem logotipos') && !entry.prompt.toLowerCase().includes('sem logotipo')) {
      warnings.push(`${entry.productName}: prompt nao menciona ausencia de logotipo.`);
    }
  }
}

function buildTemplateProductIndex(): TemplateProductIndex[] {
  return MENU_TEMPLATES.flatMap((template) =>
    template.categories.flatMap((category) =>
      category.products
        .filter((product) => Boolean(product.mediaLookupKey))
        .map((product) => ({
          segment: template.id,
          category: category.name,
          productName: product.name,
          mediaLookupKey: product.mediaLookupKey ?? '',
        }))
    )
  );
}

function reportDuplicates(values: string[], label: string, errors: string[]): void {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicated.add(value);
    seen.add(value);
  }
  for (const value of duplicated) {
    errors.push(`${label}: ${value}`);
  }
}

function readManifest(manifestPath: string): ManifestEntry[] {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifesto nao encontrado: ${manifestPath}`);
  }
  const parsed: unknown = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  if (!Array.isArray(parsed)) throw new Error('Manifesto invalido: esperado array JSON.');
  return parsed.map((item, index) => {
    if (!isManifestEntry(item)) throw new Error(`Manifesto invalido no item ${index + 1}.`);
    return item;
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

function readArg(args: string[], name: string): string | null {
  const withEquals = args.find((arg) => arg.startsWith(`${name}=`));
  if (withEquals) return withEquals.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;

  return null;
}

main();
