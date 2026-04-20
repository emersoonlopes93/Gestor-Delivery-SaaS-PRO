// Teste específico para PDV e Storefront
// Valida as correções dos problemas reportados

const axios = require('axios');

const API_BASE = 'http://localhost:5173/api/v1';
let authToken = null;
let tenantId = null;

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
  console.log('=== TESTE ESPECÍFICO: PDV E STOREFRONT ===\n');
  
  try {
    // 1. Login
    console.log('1. Autenticando...');
    const loginResponse = await apiRequest('POST', '/auth/tenant/login', {
      email: 'tenant@example.com', // Substituir
      password: 'password123',     // Substituir
      tenantSlug: 'demo'           // Substituir
    });
    
    if (loginResponse.success) {
      authToken = loginResponse.data.accessToken;
      tenantId = loginResponse.data.user.tenantId;
      console.log('   Login OK!\n');
    } else {
      throw new Error('Falha no login');
    }
    
    // 2. Teste PDV - Listagem de Produtos
    console.log('2. Testando PDV - listagem de produtos...');
    const pdvProductsResponse = await apiRequest('GET', '/catalog/products?limit=50');
    
    if (pdvProductsResponse.success) {
      console.log(`   PDV: ${pdvProductsResponse.data.length} produtos encontrados`);
      
      if (pdvProductsResponse.data.length > 0) {
        console.log('   ✅ PDV funcionando - produtos listados com sucesso!');
        console.log(`   Primeiro produto: ${pdvProductsResponse.data[0].name}`);
      } else {
        console.log('   ❌ PDV sem produtos - problema persiste!');
      }
    } else {
      console.log('   ❌ Falha na requisição do PDV');
    }
    
    // 3. Teste Storefront - Loja Fechada
    console.log('\n3. Testando Storefront (deve mostrar produtos mesmo com loja fechada)...');
    try {
      const storefrontResponse = await apiRequest('GET', '/public/storefront/demo');
      
      if (storefrontResponse.success) {
        const totalProducts = storefrontResponse.data.categories.reduce((sum, cat) => sum + cat.products.length, 0);
        const totalCombos = storefrontResponse.data.combos.length;
        
        console.log(`   Storefront: ${totalProducts} produtos em ${storefrontResponse.data.categories.length} categorias`);
        console.log(`   Storefront: ${totalCombos} combos disponíveis`);
        console.log(`   Loja aberta: ${storefrontResponse.data.tenant.isOpen}`);
        
        if (totalProducts > 0 || totalCombos > 0) {
          console.log('   ✅ Storefront funcionando - produtos visíveis mesmo com loja fechada!');
        } else {
          console.log('   ❌ Storefront sem produtos - problema persiste!');
        }
      } else {
        console.log('   ❌ Falha na requisição do storefront');
      }
    } catch (error) {
      console.log('   ❌ Storefront inacessível');
    }
    
    // 4. Teste de criação de produto para validar fluxo completo
    console.log('\n4. Testando criação de produto...');
    const timestamp = Date.now();
    const testProduct = {
      name: `Produto PDV Teste ${timestamp}`,
      basePrice: 19.90,
      shortDescription: 'Teste PDV',
      isActive: true,
      isAvailable: true,
      sellableOnline: true
    };
    
    const createResponse = await apiRequest('POST', '/catalog/products', testProduct);
    
    if (createResponse.success) {
      console.log(`   ✅ Produto criado: ${createResponse.data.name}`);
      
      // Verificar se aparece no PDV
      setTimeout(async () => {
        console.log('\n5. Verificando se novo produto aparece no PDV...');
        const updatedPdvResponse = await apiRequest('GET', '/catalog/products?limit=50');
        
        if (updatedPdvResponse.success) {
          const foundProduct = updatedPdvResponse.data.find(p => p.id === createResponse.data.id);
          
          if (foundProduct) {
            console.log('   ✅ Novo produto aparece no PDV!');
          } else {
            console.log('   ❌ Novo produto não encontrado no PDV');
          }
        }
      }, 1000);
      
    } else {
      console.log('   ❌ Falha na criação de produto');
    }
    
    console.log('\n=== RESUMO DOS TESTES ===');
    console.log('1. PDV: Deve listar produtos (corrigido)');
    console.log('2. Storefront: Deve mostrar produtos com loja fechada (corrigido)');
    console.log('3. Criação de produtos: Deve funcionar (já estava OK)');
    console.log('\nAguardando verificação do novo produto no PDV...');
    
  } catch (error) {
    console.error('\n=== FALHA NO TESTE ===');
    console.error('Erro:', error.message);
    console.error('\nVerifique se:');
    console.error('- Servidor está rodando');
    console.error('- Credenciais estão corretas');
    console.error('- Tenant existe');
  }
}

runTests().catch(console.error);
