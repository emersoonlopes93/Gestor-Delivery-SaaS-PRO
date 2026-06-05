import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_URL = 'http://localhost:3333/api/v1';

async function runAudit() {
  console.log('--- INICIANDO AUDITORIA: ONBOARDING ---\n');
  const timestamp = Date.now();
  const validEmail = `onboarding-${timestamp}@test.com`;
  
  const results = [];
  let token = '';
  let tenantId = '';

  // 1. Criar usuário e obter token
  try {
    const res = await axios.post(`${API_URL}/auth/tenant/register`, {
      ownerName: 'Onboarding User',
      shopName: `Onboard Shop ${timestamp}`,
      phone: `551198888${timestamp.toString().slice(-4)}`,
      email: validEmail,
      password: 'Password123!'
    });
    token = res.data.data.accessToken;
    tenantId = res.data.data.user.tenantId;
  } catch (err) {
    console.error('Falha ao preparar tenant para onboarding:', err.message);
    process.exit(1);
  }

  const axiosInstance = axios.create({
    baseURL: API_URL,
    headers: { Authorization: `Bearer ${token}` }
  });

  // 2. Verificar Status Inicial
  try {
    const res = await axiosInstance.get('/tenant/onboarding');
    if (res.data && res.data.data && !res.data.data.completedAt) {
      results.push({ test: 'Status Inicial do Onboarding', status: 'PASSOU (Pendente)' });
    } else {
      results.push({ test: 'Status Inicial do Onboarding', status: 'FALHOU (Já completo ou nulo)' });
    }
  } catch (err) {
    results.push({ test: 'Status Inicial do Onboarding', status: `FALHOU (${err.message})` });
  }

  // 3. Atualizar Passos Parciais
  try {
    await axiosInstance.patch('/tenant/onboarding-step', { step: 'basicInfo', completed: true });
    await axiosInstance.patch('/tenant/onboarding-step', { step: 'operatingHours', completed: true });
    
    const dbRecord = await prisma.tenantOnboarding.findUnique({ where: { tenantId }});
    if (dbRecord.stepBasicInfo && dbRecord.stepOperatingHours && !dbRecord.completedAt) {
      results.push({ test: 'Persistência Parcial (Progresso)', status: 'PASSOU' });
    } else {
      results.push({ test: 'Persistência Parcial (Progresso)', status: 'FALHOU (Não salvou passos ou finalizou antes)' });
    }
  } catch (err) {
    results.push({ test: 'Persistência Parcial (Progresso)', status: `FALHOU (${err.message})` });
  }

  // 4. Conclusão Natural do Wizard (passos essenciais)
  try {
    await axiosInstance.patch('/tenant/onboarding-step', { step: 'logo', completed: true });
    await axiosInstance.patch('/tenant/onboarding-step', { step: 'address', completed: true });
    await axiosInstance.patch('/tenant/onboarding-step', { step: 'catalog', completed: true });
    await axiosInstance.patch('/tenant/onboarding-step', { step: 'menu', completed: true });

    const dbRecord = await prisma.tenantOnboarding.findUnique({ where: { tenantId }});
    if (dbRecord.completedAt) {
      results.push({ test: 'Conclusão Natural do Onboarding', status: 'PASSOU (completedAt definido)' });
    } else {
      results.push({ test: 'Conclusão Natural do Onboarding', status: 'FALHOU (Essenciais cumpridos mas completedAt não definido)' });
    }
  } catch (err) {
    results.push({ test: 'Conclusão Natural do Onboarding', status: `FALHOU (${err.message})` });
  }

  // 5. Rota de Conclusão Forçada (Skip)
  try {
    await axiosInstance.post('/tenant/onboarding-complete');
    const dbRecord = await prisma.tenantOnboarding.findUnique({ where: { tenantId }});
    if (dbRecord.stepWhatsapp && dbRecord.stepPayments && dbRecord.completedAt) {
      results.push({ test: 'Conclusão Forçada (onboarding-complete)', status: 'PASSOU (Forçou todos os flags)' });
    } else {
      results.push({ test: 'Conclusão Forçada (onboarding-complete)', status: 'FALHOU (Não forçou os flags restantes)' });
    }
  } catch (err) {
    results.push({ test: 'Conclusão Forçada (onboarding-complete)', status: `FALHOU (${err.message})` });
  }

  console.table(results);
  process.exit(0);
}

runAudit();
