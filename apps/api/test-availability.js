const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function isProductAvailable(publication, rules, channel = 'storefront_delivery') {
  // Check publication status
  if (publication.publicationStatus !== 'published') {
    return { available: false, reason: 'Product not published' };
  }
  
  // Check operational status
  if (publication.operationalStatus !== 'active') {
    return { available: false, reason: `Product is ${publication.operationalStatus}` };
  }
  
  // Check availability rules
  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday
  const currentTime = now.getHours() * 60 + now.getMinutes();
  
  const applicableRules = rules.filter(rule => 
    rule.isActive && 
    rule.channel === channel
  );
  
  if (applicableRules.length === 0) {
    return { available: true, reason: 'No restrictions' };
  }
  
  for (const rule of applicableRules) {
    if (!rule.daysOfWeek.includes(currentDay)) {
      return { available: false, reason: `Not available on this day (rule: ${rule.daysOfWeek})` };
    }
    
    const [startHour, startMin] = rule.startTime.split(':').map(Number);
    const [endHour, endMin] = rule.endTime.split(':').map(Number);
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;
    
    if (currentTime < startTime || currentTime > endTime) {
      return { available: false, reason: `Not available at this time (rule: ${rule.startTime}-${rule.endTime})` };
    }
  }
  
  return { available: true, reason: 'Available according to rules' };
}

async function testAvailability() {
  console.log('Testing Availability Rules...');
  
  try {
    // Get combo product with availability rules
    const comboProduct = await prisma.product.findFirst({
      where: { type: 'combo' },
      include: {
        publication: {
          include: { rules: true }
        }
      }
    });
    
    if (!comboProduct) {
      throw new Error('No combo product found');
    }
    
    console.log('Combo product:', comboProduct.name);
    console.log('Publication status:', comboProduct.publication.publicationStatus);
    console.log('Operational status:', comboProduct.publication.operationalStatus);
    console.log('Rules:', comboProduct.publication.rules.length);
    
    // Test availability
    const availability = isProductAvailable(
      comboProduct.publication,
      comboProduct.publication.rules,
      'storefront_delivery'
    );
    
    console.log('Availability check:', availability);
    
    // Test configurable product (should be always available)
    const configurableProduct = await prisma.product.findFirst({
      where: { type: 'configurable' },
      include: {
        publication: {
          include: { rules: true }
        }
      }
    });
    
    if (configurableProduct) {
      const configurableAvailability = isProductAvailable(
        configurableProduct.publication,
        configurableProduct.publication.rules,
        'storefront_delivery'
      );
      
      console.log('Configurable product availability:', configurableAvailability);
    }
    
    // Test blocking scenario - change combo to draft
    console.log('\nTesting blocking scenario...');
    
    await prisma.catalogPublication.update({
      where: { id: comboProduct.publication.id },
      data: { publicationStatus: 'draft' }
    });
    
    const updatedProduct = await prisma.product.findFirst({
      where: { id: comboProduct.id },
      include: { publication: { include: { rules: true } } }
    });
    
    const blockedAvailability = isProductAvailable(
      updatedProduct.publication,
      updatedProduct.publication.rules,
      'storefront_delivery'
    );
    
    console.log('Blocked availability:', blockedAvailability);
    
    // Restore to published
    await prisma.catalogPublication.update({
      where: { id: comboProduct.publication.id },
      data: { publicationStatus: 'published' }
    });
    
    console.log('Availability test completed successfully!');
    
  } catch (error) {
    console.error('Availability test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testAvailability();
