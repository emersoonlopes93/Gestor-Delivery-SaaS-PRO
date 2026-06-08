import { FractionalPricingEngine, FractionalItem } from './src/catalog/fractional-pricing.engine';
import { FractionalPricingRule } from '@gestor/types';
import * as http from 'http';

const API_BASE_HOST = 'localhost';
const API_BASE_PORT = 3333;
const API_BASE_PATH = '/api/v1';
const EMAIL = 'new9store@gmail.com';
const PASSWORD = 'Audit@2024!'; // Senha resetada na auditoria anterior

function request(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr).toString();

    const req = http.request(
      {
        hostname: API_BASE_HOST,
        port: API_BASE_PORT,
        path: API_BASE_PATH + path,
        method,
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 0, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode || 0, data });
          }
        });
      },
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function runTests() {
  console.log('🧪 INICIANDO TESTES DO MOTOR DE PRECIFICAÇÃO FRACIONADA (FRACTIONAL PRICING)');

  const engine = new FractionalPricingEngine();

  // Cenário 1 — HIGHEST_PRICE
  const itemsHighest: FractionalItem[] = [
    { id: '1', name: 'Calabresa', price: 40, fraction: 0.5 },
    { id: '2', name: 'Frango Catupiry', price: 55, fraction: 0.5 },
  ];
  const resHighest = engine.calculate(itemsHighest, FractionalPricingRule.HIGHEST_PRICE);
  console.log(`\nCenário 1 — HIGHEST_PRICE:`);
  console.log(`  Esperado: 55.00 | Calculado: ${resHighest.calculatedPrice}`);
  if (resHighest.calculatedPrice === 55.00) {
    console.log('  ✅ SUCESSO');
  } else {
    console.error('  ❌ FALHA');
    process.exit(1);
  }

  // Cenário 2 — AVERAGE_PRICE
  const resAverage = engine.calculate(itemsHighest, FractionalPricingRule.AVERAGE_PRICE);
  console.log(`\nCenário 2 — AVERAGE_PRICE:`);
  console.log(`  Esperado: 47.50 | Calculado: ${resAverage.calculatedPrice}`);
  if (resAverage.calculatedPrice === 47.50) {
    console.log('  ✅ SUCESSO');
  } else {
    console.error('  ❌ FALHA');
    process.exit(1);
  }

  // Cenário 3 — PROPORTIONAL
  const itemsProportional: FractionalItem[] = [
    { id: '1', name: 'Calabresa', price: 40, fraction: 0.25 },
    { id: '2', name: 'Frango Catupiry', price: 55, fraction: 0.75 },
  ];
  const resProportional = engine.calculate(itemsProportional, FractionalPricingRule.PROPORTIONAL);
  console.log(`\nCenário 3 — PROPORTIONAL:`);
  console.log(`  Esperado: 51.25 | Calculado: ${resProportional.calculatedPrice}`);
  if (resProportional.calculatedPrice === 51.25) {
    console.log('  ✅ SUCESSO');
  } else {
    console.error('  ❌ FALHA');
    process.exit(1);
  }

  // Cenário 4 — Snapshot format validation
  const snapshot = {
    fractionalRuleApplied: resAverage.ruleApplied,
    fractionalPriceResult: resAverage.calculatedPrice,
  };
  console.log(`\nCenário 4 — Snapshot:`);
  console.log(JSON.stringify(snapshot, null, 2));
  if (snapshot.fractionalRuleApplied === 'AVERAGE_PRICE' && snapshot.fractionalPriceResult === 47.50) {
    console.log('  ✅ SUCESSO');
  } else {
    console.error('  ❌ FALHA');
    process.exit(1);
  }

  // ---- TESTES DE INTEGRAÇÃO COM A API REAL ----
  console.log('\n--- testando integração com a API local ---');

  // 1. Login
  const loginRes = await request('POST', '/auth/tenant/login', {
    email: EMAIL,
    password: PASSWORD,
  });
  if (loginRes.status !== 200 && loginRes.status !== 201) {
    console.error('❌ Falha ao fazer login:', loginRes.data);
    process.exit(1);
  }
  const token = loginRes.data.data?.accessToken || loginRes.data.accessToken;
  console.log('✅ Login efetuado com sucesso.');

  // 2. Criar OptionGroup com a nova regra de precificação fracionada
  const createGroupRes = await request(
    'POST',
    '/catalog/option-groups',
    {
      name: 'Sabores Pizza V3 Test',
      selectionType: 'multiple',
      isRequired: true,
      minSelect: 1,
      maxSelect: 2,
      fractionalPricingRule: 'AVERAGE_PRICE',
    },
    token,
  );
  if (createGroupRes.status !== 201 && createGroupRes.status !== 200) {
    console.error('❌ Falha ao criar OptionGroup:', createGroupRes.data);
    process.exit(1);
  }
  const optionGroupId = createGroupRes.data.data?.id || createGroupRes.data.id;
  const persistedRule = createGroupRes.data.data?.fractionalPricingRule || createGroupRes.data.fractionalPricingRule;
  console.log(`✅ OptionGroup criado com ID: ${optionGroupId} | Regra persistida: ${persistedRule}`);
  if (persistedRule !== 'AVERAGE_PRICE') {
    console.error('❌ Regra persistida está incorreta!');
    process.exit(1);
  }

  // 3. Criar OptionItem usando o alias REST (POST /catalog/option-groups/:id/items)
  const createItem1Res = await request(
    'POST',
    `/catalog/option-groups/${optionGroupId}/items`,
    {
      name: 'Calabresa Test',
      priceImpactType: 'replace',
      priceImpactValue: 40,
      order: 0,
    },
    token,
  );
  if (createItem1Res.status !== 201 && createItem1Res.status !== 200) {
    console.error('❌ Falha ao criar OptionItem 1 via alias:', createItem1Res.data);
    process.exit(1);
  }
  console.log('✅ OptionItem 1 (Calabresa) criado com sucesso via alias.');

  // 4. Criar OptionItem usando a rota legada/existente (POST /catalog/option-groups/items)
  const createItem2Res = await request(
    'POST',
    '/catalog/option-groups/items',
    {
      optionGroupId,
      name: 'Frango Catupiry Test',
      priceImpactType: 'replace',
      priceImpactValue: 55,
      order: 1,
    },
    token,
  );
  if (createItem2Res.status !== 201 && createItem2Res.status !== 200) {
    console.error('❌ Falha ao criar OptionItem 2 via rota legada:', createItem2Res.data);
    process.exit(1);
  }
  console.log('✅ OptionItem 2 (Frango) criado com sucesso via rota legada.');

  // 5. Testar a atualização da regra via PATCH
  const updateGroupRes = await request(
    'PATCH',
    `/catalog/option-groups/${optionGroupId}`,
    {
      fractionalPricingRule: 'PROPORTIONAL',
    },
    token,
  );
  if (updateGroupRes.status !== 200 && updateGroupRes.status !== 201) {
    console.error('❌ Falha ao atualizar OptionGroup:', updateGroupRes.data);
    process.exit(1);
  }
  const updatedRule = updateGroupRes.data.data?.fractionalPricingRule || updateGroupRes.data.fractionalPricingRule;
  console.log(`✅ OptionGroup atualizado com sucesso. Nova regra persistida: ${updatedRule}`);
  if (updatedRule !== 'PROPORTIONAL') {
    console.error('❌ Nova regra persistida está incorreta!');
    process.exit(1);
  }

  console.log('\n🎉 TODOS OS TESTES PASSARAM COM EXCELÊNCIA!');
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
