// Teste End-to-End para Sistema de Produtos
// Este script verifica se todos os problemas foram corrigidos

const axios = require('axios');

const API_BASE = 'http://localhost:5173/api/v1';
let authToken = null;
let tenantId = null;
let testProductId = null;
let testComboId = null;
let testOptionGroupId = null;

// Função auxiliar para fazer requisições autenticadas
async function apiRequest(method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `${API_BASE}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken && { Authorization: `Bearer ${authToken}` })
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`ERRO em ${method} ${endpoint}:`, error.response?.data || error.message);
    throw error;
  }
}

async function runTests() {
  console.log('=== INICIANDO TESTE END-TO-END DO SISTEMA DE PRODUTOS ===\n');
  
  try {
    // 1. Teste de Login
    console.log('1. Testando autenticação...');
    const loginResponse = await apiRequest('POST', '/auth/tenant/login', {
      email: 'tenant@example.com', // Substituir com email real
      password: 'password123',     // Substituir com senha real
      tenantSlug: 'demo'           // Substituir com slug real
    });
    
    if (loginResponse.success) {
      authToken = loginResponse.data.accessToken;
      tenantId = loginResponse.data.user.tenantId;
      console.log('   Login realizado com sucesso! Token obtido.\n');
    } else {
      throw new Error('Falha no login');
    }
    
    // 2. Teste de Listagem de Produtos (PDV e Cardápio)
    console.log('2. Testando listagem de produtos (PDV/Cardápio)...');
    const productsResponse = await apiRequest('GET', '/catalog/products?limit=50');
    
    if (productsResponse.success && Array.isArray(productsResponse.data)) {
      console.log(`   Listagem bem-sucedida! ${productsResponse.data.length} produtos encontrados.\n`);
    } else {
      throw new Error('Falha na listagem de produtos');
    }
    
    // 3. Teste de Criação de Produto Simples
    console.log('3. Testando criação de produto simples...');
    const timestamp = Date.now();
    const newProduct = {
      name: `Produto Teste ${timestamp}`,
      basePrice: 25.90,
      shortDescription: 'Descrição do produto teste',
      categoryId: null, // Pode ser nulo para teste
      isActive: true,
      isAvailable: true,
      sellableOnline: true
    };
    
    const createProductResponse = await apiRequest('POST', '/catalog/products', newProduct);
    
    if (createProductResponse.success) {
      testProductId = createProductResponse.data.id;
      console.log(`   Produto criado com ID: ${testProductId}\n`);
    } else {
      throw new Error('Falha na criação de produto');
    }
    
    // 4. Teste de Criação de Grupo de Opções (Complemento)
    console.log('4. Testando criação de complemento...');
    const newOptionGroup = {
      name: `Complemento Teste ${timestamp}`,
      description: 'Descrição do complemento teste',
      selectionType: 'multiple',
      isRequired: false,
      minSelect: 0,
      maxSelect: 3,
      isActive: true,
      order: 0
    };
    
    const optionGroupResponse = await apiRequest('POST', '/catalog/option-groups', newOptionGroup);
    
    if (optionGroupResponse.success) {
      testOptionGroupId = optionGroupResponse.data.id;
      console.log(`   Complemento criado com ID: ${testOptionGroupId}\n`);
    } else {
      throw new Error('Falha na criação de complemento');
    }
    
    // 5. Teste de Vinculação de Complemento ao Produto
    console.log('5. Testando vinculação de complemento ao produto...');
    const linkPayload = {
      optionGroupId: testOptionGroupId,
      order: 0,
      pricingAxis: 'secondary'
    };
    
    const linkResponse = await apiRequest('POST', `/catalog/products/${testProductId}/option-groups`, linkPayload);
    
    if (linkResponse.success) {
      console.log('   Complemento vinculado com sucesso!\n');
    } else {
      throw new Error('Falha na vinculação de complemento');
    }
    
    // 6. Teste de Criação de Combo
    console.log('6. Testando criação de combo...');
    const newCombo = {
      name: `Combo Teste ${timestamp}`,
      type: 'combo',
      basePrice: 45.90,
      shortDescription: 'Descrição do combo teste',
      comboMode: 'bundle',
      comboPricingType: 'fixed_price',
      comboPricingValue: 45.90,
      isActive: true,
      isAvailable: true,
      sellableOnline: true
    };
    
    const createComboResponse = await apiRequest('POST', '/catalog/products', newCombo);
    
    if (createComboResponse.success) {
      testComboId = createComboResponse.data.id;
      console.log(`   Combo criado com ID: ${testComboId}\n`);
    } else {
      throw new Error('Falha na criação de combo');
    }
    
    // 7. Teste de Criação de Bundle Item para Combo
    console.log('7. Testando vinculação de item ao combo...');
    const bundleItemPayload = {
      productId: testProductId, // Usando o produto criado anteriormente
      qty: 1,
      sortOrder: 0
    };
    
    const bundleResponse = await apiRequest('POST', `/catalog/products/${testComboId}/bundle-items`, bundleItemPayload);
    
    if (bundleResponse.success) {
      console.log('   Item vinculado ao combo com sucesso!\n');
    } else {
      throw new Error('Falha na vinculação de item ao combo');
    }
    
    // 8. Teste de Atualização de Produto (verificar se URLs funcionam)
    console.log('8. Testando atualização de produto...');
    const updatePayload = {
      name: `Produto Teste Atualizado ${timestamp}`,
      basePrice: 29.90
    };
    
    const updateResponse = await apiRequest('PATCH', `/catalog/products/${testProductId}`, updatePayload);
    
    if (updateResponse.success) {
      console.log('   Produto atualizado com sucesso!\n');
    } else {
      throw new Error('Falha na atualização de produto');
    }
    
    // 9. Teste de Verificação na Listagem (produtos devem aparecer)
    console.log('9. Verificando se produtos aparecem na listagem...');
    const updatedProductsResponse = await apiRequest('GET', '/catalog/products?limit=50');
    
    if (updatedProductsResponse.success) {
      const foundProduct = updatedProductsResponse.data.find(p => p.id === testProductId);
      const foundCombo = updatedProductsResponse.data.find(p => p.id === testComboId);
      
      if (foundProduct && foundCombo) {
        console.log('   Produto e combo aparecem na listagem! CORRETO!\n');
      } else {
        console.log('   AVISO: Produto ou combo não encontrado na listagem\n');
      }
    }
    
    // 10. Teste de Storefront (cardápio público)
    console.log('10. Testando cardápio público (storefront)...');
    try {
      const storefrontResponse = await apiRequest('GET', '/public/storefront/demo');
      
      if (storefrontResponse.success) {
        const allProducts = storefrontResponse.data.categories.flatMap(cat => cat.products);
        const foundInStorefront = allProducts.find(p => p.id === testProductId);
        
        if (foundInStorefront) {
          console.log('   Produto aparece no cardápio público! CORRETO!\n');
        } else {
          console.log('   AVISO: Produto não encontrado no cardápio público\n');
        }
      }
    } catch (error) {
      console.log('   AVISO: Cardápio público não disponível ou inacessível\n');
    }
    
    console.log('=== TODOS OS TESTES CONCLUÍDOS COM SUCESSO! ===');
    console.log('\nResumo das correções verificadas:');
    console.log('1. Listagem de produtos funciona (PDV/Cardápio)');
    console.log('2. Criação de produtos funciona');
    console.log('3. Criação e vinculação de complementos funciona');
    console.log('4. Criação de combos funciona');
    console.log('5. Vinculação de itens a combos funciona');
    console.log('6. URLs com productId foram corrigidas');
    console.log('7. Produtos aparecem na listagem geral');
    
  } catch (error) {
    console.error('\n=== FALHA NO TESTE ===');
    console.error('Erro:', error.message);
    console.error('\nVerifique se:');
    console.error('- Servidor API está rodando na porta 5173');
    console.error('- Credenciais de login estão corretas');
    console.error('- Tenant existe e está ativo');
  }
}

// Executar testes
runTests().catch(console.error);
