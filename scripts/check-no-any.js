const fs = require('fs');
const path = require('path');

const patterns = [
  /\bas\s+any\b/,
  /:\s*any\b/,
  /<\s*any\s*>/,
  /any\[\]/,
  /Array<any>/,
  /Record<string,\s*any>/,
  /Promise<any>/,
  /@ts-(ignore|nocheck)/,
  /as\s+unknown\s+as\b/,
];

const ignoreFiles = [
  'node_modules',
  'dist',
  '.next',
  'build',
  'coverage',
  'generated',
  'scripts',
  'prisma/seed.ts',
  'check-no-any.js'
];

const targetDirs = [
  'apps/api',
  'apps/web-tenant',
  'apps/web-admin',
  'apps/web-storefront',
  'packages/types',
  'packages/core',
  'packages/auth',
  'packages/utils',
  'packages/ui',
];

// Allowlist format: { 'relative/path/to/file.ts': [line_number] }
// Or: { 'relative/path/to/file.ts': 'all' }
const allowlist = {
  // 'apps/api/src/example.ts': [10, 15],
};

let totalFound = 0;

function isAllowlisted(filePath, lineIndex) {
  const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  if (allowlist[relativePath]) {
    if (allowlist[relativePath] === 'all') return true;
    if (Array.isArray(allowlist[relativePath]) && allowlist[relativePath].includes(lineIndex + 1)) return true;
  }
  return false;
}

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (!ignoreFiles.some(id => fullPath.includes(id))) {
        results = results.concat(walk(fullPath));
      }
    } else {
      if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
        results.push(fullPath);
      }
    }
  });
  return results;
}

console.log('🚀 Iniciando auditoria de tipagem (Anti-any) - Rodada de Hardening 2...');

targetDirs.forEach(targetDir => {
  const absolutePath = path.resolve(process.cwd(), targetDir);
  if (!fs.existsSync(absolutePath)) return;

  const files = walk(absolutePath);
  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      patterns.forEach(pattern => {
        if (pattern.test(line)) {
          if (isAllowlisted(file, index)) {
            // console.log(`ℹ️ [ALLOWLIST] Ignorado em: ${path.relative(process.cwd(), file)}:${index + 1}`);
            return;
          }
          console.error(`❌ [ERRO] Encontrado "${pattern.source}" em: ${path.relative(process.cwd(), file)}:${index + 1}`);
          totalFound++;
        }
      });
    });
  });
});

if (totalFound > 0) {
  console.error(`\nTotal de regressões encontradas: ${totalFound}`);
  console.error('Por favor, corrija as tipagens frouxas antes de prosseguir.');
  process.exit(1);
} else {
  console.log('\n✅ Auditoria concluída! Nenhuma tipagem frouxa encontrada nas áreas críticas.');
  process.exit(0);
}
