import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_URL = 'http://localhost:3333/api/v1';

async function runAudit() {
  console.log('--- INICIANDO AUDITORIA: CADASTRO SELF-SERVICE ---\n');
  
  const timestamp = Date.now();
  const validEmail = `audit-${timestamp}@test.com`;
  const validPassword = 'Password123!';
  const shopName = `Audit Shop ${timestamp}`;
  const phone = `551199999${timestamp.toString().slice(-4)}`;
  
  const results = [];

  // 1. Falha: Campos obrigatórios
  try {
    await axios.post(`${API_URL}/auth/tenant/register`, {
      email: validEmail,
      // faltando campos
    });
    results.push({ test: 'Campos Obrigatórios', status: 'FALHOU (Aceitou payload inválido)' });
  } catch (err) {
    if (err.response && err.response.status === 400) {
      results.push({ test: 'Campos Obrigatórios', status: 'PASSOU (400 Bad Request)' });
    } else {
      results.push({ test: 'Campos Obrigatórios', status: `FALHOU (${err.response?.status})` });
    }
  }

  // 2. Cadastro Válido
  let slug = '';
  try {
    const res = await axios.post(`${API_URL}/auth/tenant/register`, {
      ownerName: 'Audit User',
      shopName,
      phone,
      email: validEmail,
      password: validPassword
    });
    
    if (res.status === 201 && res.data.success && res.data.data.accessToken) {
      slug = res.data.data.user.tenant.slug;
      results.push({ test: 'Cadastro Válido', status: 'PASSOU (201 Created com Token)' });
    } else {
      results.push({ test: 'Cadastro Válido', status: `FALHOU (201 mas sem payload esperado)` });
    }
  } catch (err) {
    results.push({ test: 'Cadastro Válido', status: `FALHOU (${err.response?.status} - ${JSON.stringify(err.response?.data)})` });
  }

  // 3. E-mail duplicado
  try {
    await axios.post(`${API_URL}/auth/tenant/register`, {
      ownerName: 'Audit User 2',
      shopName: shopName + ' 2',
      phone: phone + '2',
      email: validEmail,
      password: validPassword
    });
    results.push({ test: 'E-mail Duplicado', status: 'FALHOU (Aceitou e-mail duplicado)' });
  } catch (err) {
    if (err.response && err.response.status === 401) {
      results.push({ test: 'E-mail Duplicado', status: 'PASSOU (401 Unauthorized - E-mail já está em uso)' });
    } else {
      results.push({ test: 'E-mail Duplicado', status: `FALHOU (${err.response?.status})` });
    }
  }

  // 4. Validação no Banco (Tenant, Owner, Configs)
  try {
    if (slug) {
      const tenant = await prisma.tenant.findUnique({
        where: { slug },
        include: {
          settings: true,
          aiAgentConfig: true,
          schedulingSettings: true,
          users: { include: { userRoles: { include: { role: { include: { rolePermissions: true } } } } } }
        }
      });

      if (tenant && tenant.settings && tenant.aiAgentConfig && tenant.schedulingSettings && tenant.users.length > 0) {
        const isOwner = tenant.users[0].userRoles.some(ur => ur.role.slug === 'owner');
        if (isOwner) {
          results.push({ test: 'Criação Completa no BD (Tenant, Configs, Owner, Permissões)', status: 'PASSOU' });
        } else {
          results.push({ test: 'Criação Completa no BD (Tenant, Configs, Owner, Permissões)', status: 'FALHOU (Usuário não recebeu cargo de Owner)' });
        }
      } else {
        results.push({ test: 'Criação Completa no BD (Tenant, Configs, Owner, Permissões)', status: 'FALHOU (Faltam relacionamentos)' });
      }
    } else {
      results.push({ test: 'Criação Completa no BD', status: 'FALHOU (Sem slug para buscar)' });
    }
  } catch (err) {
    results.push({ test: 'Criação Completa no BD', status: `FALHOU (${err.message})` });
  }

  console.table(results);
  
  process.exit(0);
}

runAudit();
