const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testCheckoutV2() {
  console.log('Testing Checkout V2 with snapshot...');
  
  try {
    // Get a configurable product
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
    
    if (!configurableProduct) {
      throw new Error('No configurable product found');
    }
    
    // Build V2 snapshot
    const snapshot = {
      version: '2.0',
      channel: 'storefront_delivery',
      timestamp: new Date().toISOString(),
      product: {
        id: configurableProduct.id,
        name: configurableProduct.name,
        type: configurableProduct.type,
        basePrice: Number(configurableProduct.basePrice),
        publication: configurableProduct.publication,
      },
      optionGroups: configurableProduct.optionGroupLinks.map(link => ({
        id: link.optionGroup.id,
        name: link.optionGroup.name,
        selectionType: link.optionGroup.selectionType,
        isRequired: link.isRequired ?? link.optionGroup.isRequired,
        minSelect: link.overrideMinSelect ?? link.optionGroup.minSelect,
        maxSelect: link.overrideMaxSelect ?? link.optionGroup.maxSelect,
        pricingAxis: link.pricingAxis,
        items: link.optionGroup.items.map(item => ({
          id: item.id,
          name: item.name,
          priceImpactType: item.priceImpactType,
          priceImpactValue: Number(item.priceImpactValue),
          allowQuantity: item.allowQuantity,
        }))
      })),
      selections: [
        {
          optionGroupId: configurableProduct.optionGroupLinks[0]?.optionGroup.id,
          items: [
            {
              optionItemId: configurableProduct.optionGroupLinks[0]?.optionGroup.items[0]?.id,
              qty: 1
            }
          ]
        },
        {
          optionGroupId: configurableProduct.optionGroupLinks[1]?.optionGroup.id,
          items: [
            {
              optionItemId: configurableProduct.optionGroupLinks[1]?.optionGroup.items[0]?.id,
              qty: 1
            },
            {
              optionItemId: configurableProduct.optionGroupLinks[1]?.optionGroup.items[1]?.id,
              qty: 1
            }
          ]
        }
      ]
    };
    
    console.log('V2 Snapshot:', JSON.stringify(snapshot, null, 2));
    
    // Calculate total price
    let totalPrice = snapshot.product.basePrice;
    
    snapshot.selections.forEach(selection => {
      const optionGroup = snapshot.optionGroups.find(og => og.id === selection.optionGroupId);
      if (!optionGroup) return;
      
      selection.items.forEach(selectionItem => {
        const optionItem = optionGroup.items.find(oi => oi.id === selectionItem.optionItemId);
        if (!optionItem) return;
        
        if (optionGroup.pricingAxis === 'primary') {
          if (optionItem.priceImpactType === 'fixed') {
            totalPrice += optionItem.priceImpactValue * selectionItem.qty;
          }
        } else if (optionGroup.pricingAxis === 'secondary') {
          if (optionItem.priceImpactType === 'fixed') {
            totalPrice += optionItem.priceImpactValue * selectionItem.qty;
          }
        }
      });
    });
    
    console.log(`Calculated total price: R$ ${totalPrice.toFixed(2)}`);
    
    // Test combo product
    const comboProduct = await prisma.product.findFirst({
      where: { type: 'combo' },
      include: {
        comboSlots: {
          include: { allowedItems: { include: { product: true } } }
        },
        publication: {
          include: { rules: true }
        }
      }
    });
    
    if (comboProduct) {
      console.log('Combo product found:', comboProduct.name);
      
      const comboSnapshot = {
        version: '2.0',
        channel: 'storefront_delivery',
        timestamp: new Date().toISOString(),
        product: {
          id: comboProduct.id,
          name: comboProduct.name,
          type: comboProduct.type,
          basePrice: Number(comboProduct.basePrice),
          publication: comboProduct.publication,
        },
        comboSlots: comboProduct.comboSlots.map(slot => ({
          id: slot.id,
          name: slot.name,
          isRequired: slot.isRequired,
          minSelect: slot.minSelect,
          maxSelect: slot.maxSelect,
          allowedItems: slot.allowedItems.map(allowed => ({
            productId: allowed.productId,
            productName: allowed.product?.name,
            additionalPrice: Number(allowed.additionalPrice),
          }))
        })),
        slotSelections: comboProduct.comboSlots.map(slot => ({
          comboSlotId: slot.id,
          items: [
            {
              productId: slot.allowedItems[0]?.productId,
              qty: slot.minSelect || 1
            }
          ]
        }))
      };
      
      console.log('Combo V2 Snapshot:', JSON.stringify(comboSnapshot, null, 2));
    }
    
    console.log('Checkout V2 test completed successfully!');
    
  } catch (error) {
    console.error('Checkout V2 test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testCheckoutV2();
