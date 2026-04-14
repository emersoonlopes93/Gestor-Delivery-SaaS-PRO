#!/usr/bin/env ts-node

/**
 * Smoke test para DeliveryCoverageConfig e engine híbrido
 * Valida: endpoints CRUD, cálculo híbrido e fallback para legacy
 */

import { PrismaClient, DeliveryZoneKind, DeliveryPricingMode } from '@prisma/client';

const API_URL = 'http://localhost:3333/api/v1';
const prisma = new PrismaClient();

// Credenciais de teste - mesmo tenant do smoke test existente
const TENANT_SLUG = 'pizzaria-demo';
const TENANT_EMAIL = 'owner@pizzariademo.com';
const TENANT_PASSWORD = 'Owner@123';

let accessToken: string | null = null;
let tenantId: string | null = null;

async function apiRequest(method: string, path: string, data?: any, useAuth: boolean = true) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  
  if (useAuth && accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  
  if (tenantId) {
    headers['x-tenant-id'] = tenantId;
  }
  
  const options: RequestInit = {
    method,
    headers,
  };
  
  if (data && method !== 'GET') {
    options.body = JSON.stringify(data);
  }
  
  const response = await fetch(`${API_URL}${path}`, options);
  const raw = await response.text();
  
  return {
    status: response.status,
    data: response.ok ? JSON.parse(raw) : raw,
    raw
  };
}

async function login() {
  console.log('🔐 Fazendo login...');
  
  const loginRes = await apiRequest('POST', '/auth/tenant/login', {
    email: TENANT_EMAIL,
    password: TENANT_PASSWORD,
    tenantSlug: TENANT_SLUG,
  }, false);
  
  if (loginRes.status !== 200 && loginRes.status !== 201) {
    throw new Error(`Login falhou: ${loginRes.status} - ${loginRes.raw}`);
  }
  
  console.log('Login response:', loginRes);
  const loginData = loginRes.data;
  accessToken = loginData.data.accessToken;
  
  // Extrair tenantId do token JWT (payload está em base64)
  if (!accessToken) throw new Error('AccessToken não encontrado');
  const tokenParts = accessToken.split('.');
  const payload = JSON.parse(atob(tokenParts[1]));
  tenantId = payload.tenantId;
  
  console.log(`✅ Login realizado - Tenant: ${tenantId}`);
}

async function test(condition: boolean, name: string, detail?: string) {
  const fullDetail = detail || '';
  console.log(condition ? `  ✅ OK  ${name}` : `  ❌ ERR ${name}: ${fullDetail}`);
  if (!condition) process.exitCode = 1;
}

async function cleanupTestData() {
  if (!tenantId) return;
  
  await prisma.deliveryCoverageConfig.deleteMany({
    where: { tenantId }
  });
  await prisma.deliveryRateRule.deleteMany({
    where: { tenantId }
  });
}

async function setupTestData() {
  if (!tenantId) {
    throw new Error('TenantId não encontrado após login');
  }

  // Verificar se já existem zonas
  const existingZones = await prisma.deliveryRateRule.findMany({
    where: { tenantId, type: 'polygon' }
  });
  console.log('Existing zones:', existingZones.length);

  // Criar configuração de cobertura base
  await prisma.deliveryCoverageConfig.create({
    data: {
      tenantId,
      storeLat: -23.5505,
      storeLng: -46.6333,
      maxRadiusKm: 10,
      defaultPricePerKm: 2.5,
      minimumFee: 5,
      maximumFee: 30,
      isDeliveryEnabled: true
    }
  });

  // Criar zonas personalizadas com campos corretos para o engine híbrido
  await prisma.deliveryRateRule.createMany({
    data: [
      {
        tenantId,
        type: 'polygon',
        isActive: true,
        priority: 1,
        isFallback: false,
        zoneKind: 'blocked_zone',
        blocksDelivery: true,
        pricingMode: 'fixed',
        fixedFee: 999,
        polygonCoordinates: [
          [-46.64, -23.55],
          [-46.63, -23.55],
          [-46.63, -23.54],
          [-46.64, -23.54]
        ] as any
      },
      {
        tenantId,
        type: 'polygon',
        isActive: true,
        priority: 2,
        isFallback: false,
        zoneKind: 'custom_zone',
        blocksDelivery: false,
        pricingMode: 'free',
        fixedFee: 0,
        polygonCoordinates: [
          [-46.62, -23.54],
          [-46.61, -23.54],
          [-46.61, -23.53],
          [-46.62, -23.53]
        ] as any
      },
      {
        tenantId,
        type: 'polygon',
        isActive: true,
        priority: 3,
        isFallback: false,
        zoneKind: 'custom_zone',
        blocksDelivery: false,
        pricingMode: 'fixed',
        fixedFee: 15,
        polygonCoordinates: [
          [-46.65, -23.56],
          [-46.64, -23.56],
          [-46.64, -23.55],
          [-46.65, -23.55]
        ] as any
      }
    ]
  });
}

async function testDeliveryCoverageEndpoints() {
  console.log('\n🔍 Testando endpoints DeliveryCoverage...');

  try {
    // GET - obter configuração
    const getRes = await apiRequest('GET', '/delivery/coverage');
    console.log('GET Response:', { status: getRes.status, data: getRes.data });
    test(getRes.status === 200, 'GET /delivery/coverage - status 200');
    test(getRes.data.data.tenantId === tenantId, 'GET retorna tenant correto');
    test(Number(getRes.data.data.maxRadiusKm) === 10, 'GET retorna radius configurado');

    // PUT - atualizar configuração
    const putRes = await apiRequest('PUT', '/delivery/coverage', {
      storeLat: -23.5505,
      storeLng: -46.6333,
      maxRadiusKm: 15,
      defaultPricePerKm: 3,
      minimumFee: 7,
      maximumFee: 35,
      isDeliveryEnabled: true
    });
    console.log('PUT Response:', { status: putRes.status, data: putRes.data });
    test(putRes.status === 200, 'PUT /delivery/coverage - status 200');
    test(Number(putRes.data.data.maxRadiusKm) === 15, 'PUT atualiza radius');

    // Verificar persistência
    const verifyRes = await apiRequest('GET', '/delivery/coverage');
    test(Number(verifyRes.data.data.maxRadiusKm) === 15, 'Dados persistidos após PUT');

  } catch (error: any) {
    console.log('Erro detalhado:', error);
    test(false, `Erro nos endpoints: ${error.message}`);
  }
}

async function testHybridEngine() {
  console.log('\n🔍 Testando engine híbrido...');

  try {
    // Teste 1: Endereço em zona bloqueada (não pode entregar)
    const blockedRes = await apiRequest('POST', '/delivery/rates/calculate-decision', {
      tenantId,
      address: {
        neighborhood: 'Centro',
        lat: -23.545,
        lng: -46.635
      }
    });
    console.log('Blocked Response:', { status: blockedRes.status, data: blockedRes.data });
    test(blockedRes.status === 200, 'Calculate zona bloqueada - status 200');
    test(blockedRes.data.data.canDeliver === false, 'Zona bloqueada bloqueia entrega');
    test(blockedRes.data.data.matchedStrategy === 'blocked_zone', 'Strategy correto para zona bloqueada');

    // Teste 2: Endereço em zona grátis
    const freeRes = await apiRequest('POST', '/delivery/rates/calculate-decision', {
      tenantId,
      address: {
        neighborhood: 'Norte',
        lat: -23.535,
        lng: -46.615
      }
    });
    test(freeRes.status === 200, 'Calculate zona grátis - status 200');
    test(freeRes.data.data.canDeliver === true, 'Zona grátis permite entrega');
    test(freeRes.data.data.fee === 0, 'Zona grátis taxa zero');
    test(freeRes.data.data.matchedStrategy === 'custom_zone_free', 'Strategy correto para zona grátis');

    // Teste 3: Endereço em zona fixa
    const fixedRes = await apiRequest('POST', '/delivery/rates/calculate-decision', {
      tenantId,
      address: {
        neighborhood: 'Centro',
        lat: -23.555,
        lng: -46.645
      }
    });
    test(fixedRes.status === 200, 'Calculate zona fixa - status 200');
    test(fixedRes.data.data.canDeliver === true, 'Zona fixa permite entrega');
    test(fixedRes.data.data.fee === 15, 'Zona fixa taxa correta');
    test(fixedRes.data.data.matchedStrategy === 'custom_zone_fixed', 'Strategy correto para zona fixa');

    // Teste 4: Endereço dentro do raio base (sem zona específica)
    const radiusRes = await apiRequest('POST', '/delivery/rates/calculate-decision', {
      tenantId,
      address: {
        neighborhood: 'Centro',
        lat: -23.5,
        lng: -46.6
      }
    });
    test(radiusRes.status === 200, 'Calculate raio base - status 200');
    test(radiusRes.data.data.canDeliver === true, 'Raio base permite entrega');
    test(radiusRes.data.data.matchedStrategy === 'base_radius', 'Strategy correto para raio base');
    test(radiusRes.data.data.fee > 0, 'Taxa raio base calculada');

    // Teste 5: Endereço fora de cobertura
    const outRes = await apiRequest('POST', '/delivery/rates/calculate-decision', {
      tenantId,
      address: {
        neighborhood: 'Fora',
        lat: -23.4,
        lng: -46.5
      }
    });
    test(outRes.status === 200, 'Calculate fora cobertura - status 200');
    test(outRes.data.data.canDeliver === false, 'Fora de cobertura bloqueia entrega');
    test(outRes.data.data.matchedStrategy === 'out_of_coverage', 'Strategy correto para fora de cobertura');

  } catch (error: any) {
    test(false, `Erro no engine híbrido: ${error.message}`);
    if (error.response) {
      console.log('Response data:', error.response.data);
    }
  }
}

async function testLegacyFallback() {
  console.log('\n🔍 Testando fallback para legacy...');

  // Remover configuração de cobertura para forçar fallback
  if (!tenantId) throw new Error('TenantId não encontrado');
  await prisma.deliveryCoverageConfig.deleteMany({
    where: { tenantId }
  });

  // Limpar zonas existentes e criar regras legadas
  await prisma.deliveryRateRule.deleteMany({
    where: { tenantId: tenantId! }
  });

  // Criar regra legada (neighborhood)
  await prisma.deliveryRateRule.create({
    data: {
      tenantId,
      type: 'neighborhood',
      isActive: true,
      priority: 1,
      isFallback: false,
      neighborhood: 'Vila Mariana',
      rate: 25
    }
  });

  try {
    const legacyRes = await apiRequest('POST', '/delivery/rates/calculate', {
      tenantId,
      address: {
        neighborhood: 'Vila Mariana'
      }
    });
    
    console.log('Legacy Response:', { status: legacyRes.status, data: legacyRes.data });
    console.log('Legacy Rule Detail:', JSON.stringify(legacyRes.data.data.rule, null, 2));
    
    // Endpoint legado retorna estrutura diferente
    test(legacyRes.status === 200, 'Fallback legacy - status 200');
    test(legacyRes.data.success === true, 'Legacy response success');
    test(legacyRes.data.data.fee === 25, 'Legacy fee correto');
    test(legacyRes.data.data.rule.type === 'NEIGHBORHOOD', 'Legacy rule type correto');

  } catch (error: any) {
    test(false, `Erro no fallback legacy: ${error.message}`);
  }
}

async function testCheckoutIntegration() {
  console.log('\n🔍 Testando integração com checkout...');

  // Restaurar configuração de cobertura e zonas
  await prisma.deliveryCoverageConfig.create({
    data: {
      tenantId: tenantId!,
      storeLat: -23.5505,
      storeLng: -46.6333,
      maxRadiusKm: 10,
      defaultPricePerKm: 2.5,
      minimumFee: 5,
      maximumFee: 30,
      isDeliveryEnabled: true
    }
  });

  // Recriar zonas para testes de checkout
  await prisma.deliveryRateRule.deleteMany({
    where: { tenantId: tenantId! }
  });

  await prisma.deliveryRateRule.createMany({
    data: [
      {
        tenantId: tenantId!,
        type: 'polygon',
        isActive: true,
        priority: 1,
        isFallback: false,
        zoneKind: 'blocked_zone',
        blocksDelivery: true,
        pricingMode: 'fixed',
        fixedFee: 999,
        polygonCoordinates: [
          [-46.64, -23.55],
          [-46.63, -23.55],
          [-46.63, -23.54],
          [-46.64, -23.54]
        ] as any
      },
      {
        tenantId: tenantId!,
        type: 'polygon',
        isActive: true,
        priority: 2,
        isFallback: false,
        zoneKind: 'custom_zone',
        blocksDelivery: false,
        pricingMode: 'free',
        fixedFee: 0,
        polygonCoordinates: [
          [-46.62, -23.54],
          [-46.61, -23.54],
          [-46.61, -23.53],
          [-46.62, -23.53]
        ] as any
      },
      {
        tenantId: tenantId!,
        type: 'polygon',
        isActive: true,
        priority: 3,
        isFallback: false,
        zoneKind: 'custom_zone',
        blocksDelivery: false,
        pricingMode: 'fixed',
        fixedFee: 15,
        polygonCoordinates: [
          [-46.65, -23.56],
          [-46.64, -23.56],
          [-46.64, -23.55],
          [-46.65, -23.55]
        ] as any
      }
    ]
  });

  try {
    // Payload base para checkout
    const basePayload = {
      idempotencyKey: `test-${Date.now()}`,
      items: [
        {
          lineType: 'product',
          productId: '536c4a7a-e07d-48e3-8777-ffa8cda6765d',
          quantity: 1,
          notes: 'Test order'
        }
      ],
      customerName: 'Cliente Teste',
      customerPhone: '11999999999',
      customerEmail: 'cliente@teste.com',
      fulfillmentType: 'delivery',
      notes: 'Pedido de teste'
    };

    // 1. Checkout dentro do raio base
    const radiusCheckout = await apiRequest('POST', '/orders/public-checkout/pizzaria-demo', {
      ...basePayload,
      deliveryAddress: {
        street: 'Rua Centro',
        number: '123',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01234567',
        lat: -23.5,
        lng: -46.6
      }
    });
    console.log('Radius Checkout Response:', { status: radiusCheckout.status, data: radiusCheckout.data });
    console.log('Radius Checkout Details:', JSON.stringify(radiusCheckout.data.data, null, 2));
    test(radiusCheckout.status === 200, 'Checkout raio base - status 200');
    test(radiusCheckout.data.data.deliveryFee > 0, 'Taxa de entrega aplicada no raio base');

    // 2. Checkout em zona bloqueada (deve falhar)
    try {
      const blockedCheckout = await apiRequest('POST', '/orders/public-checkout/pizzaria-demo', {
        ...basePayload,
        idempotencyKey: `test-blocked-${Date.now()}`,
        deliveryAddress: {
          street: 'Rua Bloqueada',
          number: '999',
          neighborhood: 'Centro',
          city: 'São Paulo',
          state: 'SP',
          zipCode: '01234568',
          lat: -23.545,
          lng: -46.635
        }
      });
      console.log('Blocked Checkout Response:', { status: blockedCheckout.status, data: blockedCheckout.data });
      test(false, 'Checkout zona bloqueada deveria falhar');
    } catch (error: any) {
      console.log('Blocked Checkout Error:', error.response?.data);
      test(error.response?.status === 422, 'Checkout zona bloqueada falha corretamente');
      test(error.response?.data?.error?.message?.includes('bloqueada') || error.response?.data?.error?.message?.includes('delivery'), 'Mensagem de bloqueio correta');
    }

    // 3. Checkout em zona fixa
    const fixedCheckout = await apiRequest('POST', '/orders/public-checkout/pizzaria-demo', {
      ...basePayload,
      idempotencyKey: `test-fixed-${Date.now()}`,
      deliveryAddress: {
        street: 'Rua Fixa',
        number: '456',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01234569',
        lat: -23.555,
        lng: -46.645
      }
    });
    test(fixedCheckout.status === 200, 'Checkout zona fixa - status 200');
    test(fixedCheckout.data.data.deliveryFee === 15, 'Taxa fixa aplicada corretamente');

    // 4. Checkout em zona grátis
    const freeCheckout = await apiRequest('POST', '/orders/public-checkout/pizzaria-demo', {
      ...basePayload,
      idempotencyKey: `test-free-${Date.now()}`,
      deliveryAddress: {
        street: 'Rua Grátis',
        number: '789',
        neighborhood: 'Norte',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01234570',
        lat: -23.535,
        lng: -46.615
      }
    });
    test(freeCheckout.status === 200, 'Checkout zona grátis - status 200');
    test(freeCheckout.data.data.deliveryFee === 0, 'Entrega grátis aplicada corretamente');

    // 5. Checkout fora da cobertura (deve falhar)
    try {
      const outOfCoverageCheckout = await apiRequest('POST', '/orders/public-checkout/pizzaria-demo', {
        ...basePayload,
        idempotencyKey: `test-out-${Date.now()}`,
        deliveryAddress: {
          street: 'Rua Longe',
          number: '999',
          neighborhood: 'Fora',
          city: 'São Paulo',
          state: 'SP',
          zipCode: '01234571',
          lat: -23.4,
          lng: -46.5
        }
      });
      test(false, 'Checkout fora cobertura deveria falhar');
    } catch (error: any) {
      test(error.response?.status === 422, 'Checkout fora cobertura falha corretamente');
      test(error.response?.data?.error?.message?.includes('fora') || error.response?.data?.error?.message?.includes('delivery'), 'Mensagem de fora de cobertura correta');
    }

  } catch (error: any) {
    test(false, `Erro na integração checkout: ${error.message}`);
  }
}

async function main() {
  console.log('🚀 Iniciando smoke test - Delivery Coverage e Engine Híbrido\n');
  
  try {
    await login();
    await cleanupTestData();
    await setupTestData();
    
    await testDeliveryCoverageEndpoints();
    await testHybridEngine();
    await testLegacyFallback();
    await testCheckoutIntegration();
    
    console.log('\n✅ Smoke test concluído!');
    
  } catch (error: any) {
    console.error('\n❌ Erro geral:', error.message);
    process.exitCode = 1;
  } finally {
    await cleanupTestData();
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}
