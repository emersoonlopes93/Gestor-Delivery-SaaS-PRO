import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('ProductComplementGroup:', await prisma.productComplementGroup.count());
  console.log('ProductComplementItem:', await prisma.productComplementItem.count());
  console.log('OptionGroup:', await prisma.optionGroup.count());
  console.log('OptionItem:', await prisma.optionItem.count());
  console.log('ProductCombo:', await prisma.productCombo.count());
  console.log('ProductComboBlock:', await prisma.productComboBlock.count());
  console.log('ProductComboBlockItem:', await prisma.productComboBlockItem.count());
  console.log('ComboSlot:', await prisma.comboSlot.count());
  console.log('ComboBundleItem:', await prisma.comboBundleItem.count());
  console.log('Products:', await prisma.product.count());
  console.log('Publications:', await prisma.catalogPublication.count());
}

main().then(() => prisma.$disconnect()).catch(e => {
  console.error(e);
  prisma.$disconnect();
});
