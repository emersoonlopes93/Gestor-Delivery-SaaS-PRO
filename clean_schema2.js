const fs = require('fs');
let lines = fs.readFileSync('apps/api/prisma/schema.prisma', 'utf8').split('\n');

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

fs.writeFileSync('apps/api/prisma/schema.prisma', lines.join('\n'));
console.log('Cleaned relationships from schema.prisma');
