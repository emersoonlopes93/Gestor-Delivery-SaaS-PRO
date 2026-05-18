
const API = 'http://localhost:3333/api/v1';
const TENANT_SLUG = 'pizzaria-demo';
const TENANT_EMAIL = 'owner@pizzariademo.com';
const TENANT_PASSWORD = 'Owner@123';

async function run() {
  console.log('--- Setup Test Data ---');
  const loginRes = await fetch(API + '/auth/tenant/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TENANT_EMAIL, password: TENANT_PASSWORD, tenantSlug: TENANT_SLUG })
  });
  const loginData: any = await loginRes.json();
  const token = loginData.data.accessToken;

  // 1. Enable Payment Methods
  console.log('Habilitando métodos de pagamento...');
  await fetch(API + '/settings/tenant', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ paymentMethods: ['cash', 'pix', 'credit_card', 'debit_card', 'card_on_delivery'] })
  });

  // 2. Setup Coverage
  console.log('Configurando cobertura...');
  await fetch(API + '/delivery/coverage', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({
      storeLat: -23.5505,
      storeLng: -46.6333,
      maxRadiusKm: 50, // Large radius for testing
      defaultPricePerKm: 1,
      isDeliveryEnabled: true
    })
  });

  console.log('Setup concluído!');
}
run();
