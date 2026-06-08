const fs = require('fs');

function dropLegacyModels(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  const modelsToDrop = [
    'ProductComplementGroup',
    'ProductComplementItem',
    'ProductComplementGroupLink',
    'ProductCombo',
    'ProductComboBlock',
    'ProductComboBlockItem',
    'OrderItemComplement',
    'OrderItemComboSelection'
  ];

  for (const model of modelsToDrop) {
    const regex = new RegExp(`model ${model} \\{[\\s\\S]*?\\n\\}`, 'g');
    content = content.replace(regex, '');
  }

  // Also remove relations
  content = content.replace(/.*productComboBlockItems.*\n/g, '');
  content = content.replace(/.*productComboBlocks.*\n/g, '');
  content = content.replace(/.*productCombos.*\n/g, '');
  content = content.replace(/.*productComplementLinks.*\n/g, '');
  content = content.replace(/.*complementGroups.*\n/g, '');
  content = content.replace(/.*complementItems.*\n/g, '');
  content = content.replace(/.*orderItemComboSelections.*\n/g, '');
  content = content.replace(/.*orderItemComplements.*\n/g, '');
  content = content.replace(/.*comboBlockItems.*\n/g, '');
  content = content.replace(/.*comboSelections.*\n/g, '');
  content = content.replace(/.*complements\s+OrderItemComplement\S*\n/g, '');
  content = content.replace(/.*complement\s+ProductComplementItem.*\n/g, '');
  content = content.replace(/.*combo\s+ProductCombo.*\n/g, '');

  fs.writeFileSync(filePath, content);
  console.log('Legacy models dropped from', filePath);
}

dropLegacyModels('apps/api/prisma/schema.prisma');
