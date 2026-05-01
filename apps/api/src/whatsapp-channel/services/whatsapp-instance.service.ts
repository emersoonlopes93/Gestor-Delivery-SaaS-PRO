import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppInstanceStatus, WhatsAppProviderType } from '@prisma/client';
import { EvolutionGoProvider } from '../providers/evolution-go.provider';
import { MetaCloudProvider } from '../providers/meta-cloud.provider';
import { WhatsAppProviderRegistryService } from './whatsapp-provider-registry.service';
import type { IWhatsAppProvider } from '../interfaces/whatsapp-provider.interface';

export interface CreateInstanceDto {
  providerType?: WhatsAppProviderType;
  instanceName: string;
  apiUrl: string;
  apiKey: string;
  webhookUrl: string;
}

export interface InstanceStatusDto {
  id: string;
  instanceName: string;
  providerType: WhatsAppProviderType;
  status: WhatsAppInstanceStatus;
  phoneNumber: string | null;
  qrCode?: string | null;
}

@Injectable()
export class WhatsAppInstanceService {
  private readonly logger = new Logger('WhatsAppInstanceService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistryService,
  ) {}

  /**
   * Retorna o provider correto baseado no tipo
   */
  getProvider(providerType: WhatsAppProviderType): IWhatsAppProvider {
    return this.providerRegistry.getProvider(providerType);
  }

  /**
   * Cria e registra uma instância WhatsApp para o tenant
   */
  async createInstance(
    tenantId: string,
    dto: CreateInstanceDto,
  ): Promise<InstanceStatusDto> {
    const providerType = dto.providerType || 'evolution_go';
    const provider = this.getProvider(providerType);

    // Criar instância no provider externo
    const externalResult = await provider.createInstance(
      dto.apiUrl,
      dto.apiKey,
      {
        instanceName: dto.instanceName,
        webhookUrl: dto.webhookUrl,
      },
    );

    // Salvar no banco
    const instance = await this.prisma.whatsAppInstance.upsert({
      where: { tenantId },
      create: {
        tenantId,
        providerType,
        instanceName: dto.instanceName,
        apiUrl: dto.apiUrl,
        apiKey: dto.apiKey,
        status: 'disconnected',
        evolutionInstanceId: externalResult.instanceId,
      },
      update: {
        providerType,
        instanceName: dto.instanceName,
        apiUrl: dto.apiUrl,
        apiKey: dto.apiKey,
        evolutionInstanceId: externalResult.instanceId,
      },
    });

    this.logger.log(`Instance created for tenant ${tenantId}: ${instance.id}`);

    return {
      id: instance.id,
      instanceName: instance.instanceName,
      providerType: instance.providerType,
      status: instance.status,
      phoneNumber: instance.phoneNumber,
    };
  }

  /**
   * Conecta a instância WhatsApp do tenant
   */
  async connectInstance(
    tenantId: string,
    webhookUrl: string,
  ): Promise<InstanceStatusDto> {
    const instance = await this.getInstanceOrFail(tenantId);
    const provider = this.getProvider(instance.providerType);

    const connectionStatus = await provider.connect(
      instance.apiUrl,
      instance.apiKey,
      instance.evolutionInstanceId || instance.instanceName,
      { webhookUrl },
    );

    // Atualizar status no banco
    const statusMap: Record<string, WhatsAppInstanceStatus> = {
      connected: 'connected',
      disconnected: 'disconnected',
      connecting: 'connecting',
      qr_pending: 'qr_pending',
    };

    const updated = await this.prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: {
        status: statusMap[connectionStatus.state] || 'disconnected',
        phoneNumber: connectionStatus.phoneNumber || instance.phoneNumber,
      },
    });

    return {
      id: updated.id,
      instanceName: updated.instanceName,
      providerType: updated.providerType,
      status: updated.status,
      phoneNumber: updated.phoneNumber,
      qrCode: connectionStatus.qrCode,
    };
  }

  /**
   * Desconecta a instância WhatsApp do tenant
   */
  async disconnectInstance(tenantId: string): Promise<void> {
    const instance = await this.getInstanceOrFail(tenantId);
    const provider = this.getProvider(instance.providerType);

    await provider.disconnect(
      instance.apiUrl,
      instance.apiKey,
      instance.evolutionInstanceId || instance.instanceName,
    );

    await this.prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: { status: 'disconnected' },
    });
  }

  /**
   * Obtém o status atual da instância
   */
  async getStatus(tenantId: string): Promise<InstanceStatusDto> {
    const instance = await this.getInstanceOrFail(tenantId);
    const provider = this.getProvider(instance.providerType);

    const connectionStatus = await provider.getConnectionStatus(
      instance.apiUrl,
      instance.apiKey,
      instance.evolutionInstanceId || instance.instanceName,
    );

    // Sincronizar status com o banco
    const statusMap: Record<string, WhatsAppInstanceStatus> = {
      connected: 'connected',
      disconnected: 'disconnected',
      connecting: 'connecting',
      qr_pending: 'qr_pending',
    };

    if (statusMap[connectionStatus.state] !== instance.status) {
      await this.prisma.whatsAppInstance.update({
        where: { id: instance.id },
        data: {
          status: statusMap[connectionStatus.state] || 'disconnected',
          phoneNumber: connectionStatus.phoneNumber || instance.phoneNumber,
        },
      });
    }

    return {
      id: instance.id,
      instanceName: instance.instanceName,
      providerType: instance.providerType,
      status: statusMap[connectionStatus.state] || instance.status,
      phoneNumber: connectionStatus.phoneNumber || instance.phoneNumber,
      qrCode: connectionStatus.qrCode,
    };
  }

  /**
   * Obtém QR code para pareamento
   */
  async getQrCode(tenantId: string): Promise<string | null> {
    const instance = await this.getInstanceOrFail(tenantId);
    const provider = this.getProvider(instance.providerType);

    return provider.getQrCode(
      instance.apiUrl,
      instance.apiKey,
      instance.evolutionInstanceId || instance.instanceName,
    );
  }

  /**
   * Obtém a instância registrada do tenant
   */
  async getInstance(tenantId: string) {
    return this.prisma.whatsAppInstance.findUnique({
      where: { tenantId },
    });
  }

  private async getInstanceOrFail(tenantId: string) {
    const instance = await this.prisma.whatsAppInstance.findUnique({
      where: { tenantId },
    });
    if (!instance) {
      throw new NotFoundException(
        'Nenhuma instância WhatsApp configurada para este tenant.',
      );
    }
    return instance;
  }
}
