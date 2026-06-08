const fs = require('fs');
let content = fs.readFileSync('apps/api/prisma/schema.prisma', 'utf8');

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

fs.writeFileSync('apps/api/prisma/schema.prisma', content);
console.log('Cleaned schema.prisma fields');
