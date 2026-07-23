/**
 * SCRIPT DE MANUTENÇÃO — clean_schema2.js
 *
 * PROPÓSITO: Remove linhas contendo referências a modelos legados de catálogo v2.
 * Usado durante a migração do catálogo v2 para v3 (drop em 2026-06-08).
 *
 * ⚠️  ATENÇÃO — USO RESTRITO:
 *   - SOMENTE para ambientes de desenvolvimento local
 *   - NUNCA executar em produção ou staging
 *   - NUNCA executar sem backup do schema.prisma
 *   - NUNCA executar com NODE_ENV=production (o script falhará)
 *
 * Uso: node scripts/maintenance/clean_schema2.js --force
 */

'use strict';

const fs = require('fs');

if (process.env.NODE_ENV === 'production') {
  console.error('❌ BLOQUEADO: Este script não pode ser executado em NODE_ENV=production.');
  process.exit(1);
}

if (!process.argv.includes('--force')) {
  console.error('❌ BLOQUEADO: Este script requer a flag --force para execução explícita.');
  console.error('   Uso: node scripts/maintenance/clean_schema2.js --force');
  console.error('   ⚠️  Certifique-se de ter um backup do schema.prisma antes de prosseguir.');
  process.exit(1);
}

console.warn('⚠️  Executando limpeza de modelos legados do schema.prisma...');

const schemaPath = 'apps/api/prisma/schema.prisma';

if (!fs.existsSync(schemaPath)) {
  console.error(`❌ Arquivo não encontrado: ${schemaPath}`);
  process.exit(1);
}

let lines = fs.readFileSync(schemaPath, 'utf8').split('\n');

lines = lines.filter(line => {
  if (line.includes('OrderItemComboSelection')) return false;
  if (line.includes('OrderItemComplement')) return false;
  if (line.includes('ProductComboBlockItem')) return false;
  if (line.includes('ProductComboBlock')) return false;
  if (line.includes('ProductCombo')) return false;
  if (line.includes('ProductComplementGroupLink')) return false;
  if (line.includes('ProductComplementGroup')) return false;
  if (line.includes('ProductComplementItem')) return false;
  return true;
});

fs.writeFileSync(schemaPath, lines.join('\n'));
console.log('✅ Referências a modelos legados removidas do schema.prisma');
console.log('   Execute `pnpm prisma:validate` para verificar a integridade do schema.');
