#!/usr/bin/env ts-node

/**
 * Teste direto do engine híbrido sem depender de endpoints HTTP
 */

import { PrismaClient } from '@prisma/client';
import { DeliveryRateService, DELIVERY_COVERAGE_REPO, DELIVERY_RATE_RULE_REPO } from '../src/delivery/delivery-rate.service';
import { PrismaService } from '../src/database/prisma.service';

const prisma = new PrismaClient();

// Criar o PrismaService mock
class MockPrismaService extends PrismaService {
  get deliveryRateRule() {
    return prisma.deliveryRateRule;
  }
  
  get deliveryCoverageConfig() {
    return prisma.deliveryCoverageConfig;
  }
}

// Criar serviço com injeção manual
const mockPrismaService = new MockPrismaService();
const deliveryRateService = new DeliveryRateService(
  mockPrismaService.deliveryRateRule,
  mockPrismaService.deliveryCoverageConfig
);

async function testHybridEngine() {
  console.log('🚀 Testando engine híbrido diretamente...\n');

  const tenantId = '2ff50f29-acef-49dc-82a4-dec146931d1f';
  
  try {
    // Teste 1: Endereço em zona bloqueada
    console.log('Teste 1: Zona bloqueada');
    const blockedResult = await deliveryRateService.calculateDeliveryDecision({
      tenantId,
      address: {
        neighborhood: 'Centro',
        lat: -23.545,
        lng: -46.635
      }
    });
    console.log('Resultado:', blockedResult);

    // Teste 2: Endereço em zona grátis
    console.log('\nTeste 2: Zona grátis');
    const freeResult = await deliveryRateService.calculateDeliveryDecision({
      tenantId,
      address: {
        neighborhood: 'Norte',
        lat: -23.535,
        lng: -46.615
      }
    });
    console.log('Resultado:', freeResult);

    // Teste 3: Endereço dentro do raio base
    console.log('\nTeste 3: Raio base');
    const radiusResult = await deliveryRateService.calculateDeliveryDecision({
      tenantId,
      address: {
        neighborhood: 'Centro',
        lat: -23.5,
        lng: -46.6
      }
    });
    console.log('Resultado:', radiusResult);

    // Teste 4: Endereço fora de cobertura
    console.log('\nTeste 4: Fora de cobertura');
    const outResult = await deliveryRateService.calculateDeliveryDecision({
      tenantId,
      address: {
        neighborhood: 'Fora',
        lat: -23.4,
        lng: -46.5
      }
    });
    console.log('Resultado:', outResult);

  } catch (error: any) {
    console.error('Erro no teste:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testHybridEngine();
