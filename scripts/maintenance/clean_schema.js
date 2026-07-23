/**
 * SCRIPT DE MANUTENÇÃO — clean_schema.js
 *
 * PROPÓSITO: Remove campos de relações legadas de catálogo v2 do schema Prisma.
 * Usado durante a migração do catálogo v2 para v3 (drop em 2026-06-08).
 *
 * ⚠️  ATENÇÃO — USO RESTRITO:
 *   - SOMENTE para ambientes de desenvolvimento local
 *   - NUNCA executar em produção ou staging
 *   - NUNCA executar sem backup do schema.prisma
 *   - NUNCA executar com NODE_ENV=production (o script falhará)
 *
 * Uso: node scripts/maintenance/clean_schema.js --force
 */

'use strict';

const fs = require('fs');

if (process.env.NODE_ENV === 'production') {
  console.error('❌ BLOQUEADO: Este script não pode ser executado em NODE_ENV=production.');
  process.exit(1);
}

if (!process.argv.includes('--force')) {
  console.error('❌ BLOQUEADO: Este script requer a flag --force para execução explícita.');
  console.error('   Uso: node scripts/maintenance/clean_schema.js --force');
  console.error('   ⚠️  Certifique-se de ter um backup do schema.prisma antes de prosseguir.');
  process.exit(1);
}

console.warn('⚠️  Executando limpeza de campos legados do schema.prisma...');

const schemaPath = 'apps/api/prisma/schema.prisma';

if (!fs.existsSync(schemaPath)) {
  console.error(`❌ Arquivo não encontrado: ${schemaPath}`);
  process.exit(1);
}

let content = fs.readFileSync(schemaPath, 'utf8');

const fieldsToRemove = [
  'orderItemComboSelections',
  'orderItemComplements',
  'productComboBlockItems',
  'productComboBlocks',
  'productCombos',
  'productComplementLinks',
  'complementGroups',
  'complementItems',
  'comboBlockItems',
  'comboSelections',
  'complements\\s+OrderItemComplement',
  'complement\\s+ProductComplementItem',
  'combo\\s+ProductCombo'
];

for (const field of fieldsToRemove) {
  const regex = new RegExp(`^.*${field}.*\\n`, 'gm');
  content = content.replace(regex, '');
}

fs.writeFileSync(schemaPath, content);
console.log('✅ Campos legados removidos do schema.prisma');
console.log('   Execute `pnpm prisma:validate` para verificar a integridade do schema.');
