const fs = require('fs');
const path = require('path');

const patterns = [
  /\bas\s+any\b/,
  /:\s*any\b/,
  /<\s*any\s*>/,
  /any\[\]/,
  /Record<string,\s*any>/,
  /Promise<any>/,
  /@ts-(ignore|nocheck)/,
];

const ignoreFiles = [
  'node_modules',
  'dist',
  '.next',
  'build',
  'scripts',
  'prisma/seed.ts',
  'check-no-any.js'
];

const targetDirs = [
  'apps/api/src',
  'apps/web-tenant/src',
  'apps/web-admin/src',
  'apps/web-storefront/src',
  'packages/types/src',
  'packages/core/src',
  'packages/auth/src',
  'packages/utils/src',
  'packages/ui/src',
];

let totalFound = 0;

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (!ignoreFiles.some(id => file.includes(id))) {
        results = results.concat(walk(file));
      }
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(file);
      }
    }
  });
  return results;
}

console.log('🚀 Iniciando auditoria de tipagem (Anti-any)...');

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
          // Additional check for false positives if needed
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
