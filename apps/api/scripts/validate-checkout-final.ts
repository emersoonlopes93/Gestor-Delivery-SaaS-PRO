
const API = 'http://localhost:3333/api/v1';
const TENANT_SLUG = 'pizzaria-demo';
const TENANT_EMAIL = 'owner@pizzariademo.com';
const TENANT_PASSWORD = 'Owner@123';

async function api(method: string, path: string, body?: any, token?: string) {
  const headers: any = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  
  const rawData = await res.json().catch(() => ({}));
  const data = (rawData as any).data || rawData;
  return { status: res.status, data, raw: rawData };
}

async function getTenantToken() {
  const { data } = await api('POST', '/auth/tenant/login', {
    email: TENANT_EMAIL,
    password: TENANT_PASSWORD,
    tenantSlug: TENANT_SLUG,
  });
  return data?.accessToken;
}

async function runValidation() {
  console.log('🚀 Iniciando Validação Final E2E do Checkout\n');
  
  const token = await getTenantToken();
  if (!token) {
    console.error('❌ Falha ao obter token de acesso do tenant');
    return;
  }

  const { data: storefront } = await api('GET', `/public/storefront/${TENANT_SLUG}`);
  const simpleProduct = storefront.categories[0].products[0];
  
  // 1. Pickup com produto simples
  console.log('--- Cenário 1: Pickup com produto simples ---');
  const payload1 = {
    idempotencyKey: `val-pickup-${Date.now()}`,
    items: [{ lineType: 'product', productId: simpleProduct.id, quantity: 1, complements: [] }],
    customerName: 'Cliente Pickup',
    customerPhone: '11999991111',
    fulfillmentType: 'pickup',
    payment: { method: 'pix' },
  };
  const res1 = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, payload1);
  console.log(`Status: ${res1.status}`);
  const order1 = res1.data;
  console.log(`Pedido: ${order1?.orderNumber || 'ERRO'}`);

  // 2. Delivery com produto simples
  console.log('\n--- Cenário 2: Delivery com produto simples ---');
  const payload2 = {
    idempotencyKey: `val-delivery-${Date.now()}`,
    items: [{ lineType: 'product', productId: simpleProduct.id, quantity: 1, complements: [] }],
    customerName: 'Cliente Delivery',
    customerPhone: '11999992222',
    fulfillmentType: 'delivery',
    deliveryAddress: {
      street: 'Rua Próxima',
      number: '10',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01001000',
      lat: -23.5501,
      lng: -46.6331,
    },
    payment: { method: 'pix' },
  };
  const res2 = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, payload2);
  console.log(`Status: ${res2.status}`);
  if (res2.status >= 400) console.log('Erro:', JSON.stringify(res2.raw, null, 2));
  console.log(`Pedido: ${res2.data?.orderNumber || 'ERRO'}`);

  // 3. Produto com complemento obrigatório
  console.log('\n--- Cenário 3: Complemento obrigatório ---');
  let productWithReq = null;
  for (const cat of storefront.categories) {
    for (const p of cat.products) {
      if (p.complements?.some((c: any) => c.isRequired)) {
        productWithReq = p;
        break;
      }
    }
    if (productWithReq) break;
  }
  if (productWithReq) {
    const group = productWithReq.complements.find((c: any) => c.isRequired);
    const item = group.items[0];
    const payload3 = {
      idempotencyKey: `val-comp-req-${Date.now()}`,
      items: [{ lineType: 'product', productId: productWithReq.id, quantity: 1, complements: [{ groupId: group.id, itemId: item.id }] }],
      customerName: 'Cliente Comp Req',
      customerPhone: '11999993333',
      fulfillmentType: 'pickup',
      payment: { method: 'pix' },
    };
    const res3 = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, payload3);
    console.log(`Status: ${res3.status}`);
    console.log(`Pedido: ${res3.data?.orderNumber || 'ERRO'}`);
  }

  // 4. Produto com complemento opcional
  console.log('\n--- Cenário 4: Complemento opcional (vazio) ---');
  const payload4 = {
    idempotencyKey: `val-comp-opt-${Date.now()}`,
    items: [{ lineType: 'product', productId: simpleProduct.id, quantity: 1, complements: [] }],
    customerName: 'Cliente Comp Opt',
    customerPhone: '11999994444',
    fulfillmentType: 'pickup',
    payment: { method: 'pix' },
  };
  const res4 = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, payload4);
  console.log(`Status: ${res4.status}`);

  // 5. Combo V2
  console.log('\n--- Cenário 5: Combo V2 ---');
  const comboV2 = storefront.categories.flatMap((c:any) => c.products).find((p: any) => p.type === 'combo');
  if (comboV2) {
    const payload5 = {
      idempotencyKey: `val-combo-${Date.now()}`,
      items: [{ lineType: 'combo', productId: comboV2.id, quantity: 1, slots: [] }],
      customerName: 'Cliente Combo',
      customerPhone: '11999995555',
      fulfillmentType: 'pickup',
      payment: { method: 'pix' },
    };
    const res5 = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, payload5);
    console.log(`Status: ${res5.status}`);
    console.log(`Pedido: ${res5.data?.orderNumber || 'ERRO'}`);
  }

  // 6. PIX
  console.log('\n--- Cenário 6: Pagamento PIX ---');
  if (res1.data?.pixPayment) {
    console.log('✅ PIX gerado com sucesso:', res1.data.pixPayment.transactionId);
  } else {
    console.log('❌ PIX não gerado. Verifique se o tenant possui chave PIX cadastrada.');
  }

  // 7. Dinheiro com troco
  console.log('\n--- Cenário 7: Dinheiro com troco ---');
  const payload7 = {
    idempotencyKey: `val-cash-${Date.now()}`,
    items: [{ lineType: 'product', productId: simpleProduct.id, quantity: 1, complements: [] }],
    customerName: 'Cliente Troco',
    customerPhone: '11999997777',
    fulfillmentType: 'pickup',
    payment: { method: 'cash', changeFor: 100 },
  };
  const res7 = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, payload7);
  console.log(`Status: ${res7.status}`);
  console.log(`Troco para: ${res7.data?.changeFor}`);

  // 8. Idempotência
  console.log('\n--- Cenário 8: Idempotência ---');
  const key8 = `idemp-${Date.now()}`;
  const p8 = { ...payload1, idempotencyKey: key8 };
  const r8a = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, p8);
  const r8b = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, p8);
  console.log(`Req 1 ID: ${r8a.data?.id}`);
  console.log(`Req 2 ID: ${r8b.data?.id}`);
  console.log(`Mesmo ID? ${r8a.data?.id === r8b.data?.id ? '✅ SIM' : '❌ NÃO'}`);

  // 9. Aparece na Lista
  console.log('\n--- Cenário 9: Lista de Pedidos ---');
  const res9 = await api('GET', '/orders', undefined, token);
  const foundInList = res9.data?.items?.some((o: any) => o.orderNumber === res1.data?.orderNumber);
  console.log(`Encontrado na lista? ${foundInList ? '✅ SIM' : '❌ NÃO'}`);

  // 10. Aparece no Kanban
  console.log('\n--- Cenário 10: Kanban ---');
  const res10 = await api('GET', '/orders/operation/board', undefined, token);
  const foundInBoard = res10.data?.some((o: any) => o.orderNumber === res1.data?.orderNumber);
  console.log(`Encontrado no Kanban? ${foundInBoard ? '✅ SIM' : '❌ NÃO'}`);

  console.log('\n🏁 Validação Finalizada');
}

runValidation();
