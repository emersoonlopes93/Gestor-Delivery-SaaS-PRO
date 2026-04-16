const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testV2Flow() {
  console.log('Testing V2 flow...');
  
  try {
    // 1. Test simple product
    const simpleProduct = await prisma.product.findFirst({
      where: { type: 'simple' },
      include: { publication: true }
    });
    
    console.log('Simple product:', simpleProduct?.name, simpleProduct?.type);
    
    // 2. Test configurable product with option groups
    const configurableProduct = await prisma.product.findFirst({
      where: { type: 'configurable' },
      include: {
        optionGroupLinks: {
          include: {
            optionGroup: {
              include: { items: true }
            }
          }
        },
        publication: true
      }
    });
    
    console.log('Configurable product:', configurableProduct?.name);
    console.log('Option groups:', configurableProduct?.optionGroupLinks?.length);
    
    // 3. Test combo product with slots
    const comboProduct = await prisma.product.findFirst({
      where: { type: 'combo' },
      include: {
        comboSlots: {
          include: { allowedItems: true }
        },
        publication: {
          include: { rules: true }
        }
      }
    });
    
    console.log('Combo product:', comboProduct?.name);
    console.log('Combo slots:', comboProduct?.comboSlots?.length);
    console.log('Availability rules:', comboProduct?.publication?.rules?.length);
    
    // 4. Test publication status
    const publishedProducts = await prisma.catalogPublication.findMany({
      where: { publicationStatus: 'published' }
    });
    
    console.log('Published products:', publishedProducts.length);
    
    console.log('V2 flow test completed successfully!');
    
  } catch (error) {
    console.error('V2 flow test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testV2Flow();
