import { Injectable, Logger, NotFoundException, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { IsString, IsOptional } from 'class-validator';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppInstanceStatus, WhatsAppProviderType } from '@prisma/client';
import { WhatsAppProviderRegistryService } from './whatsapp-provider-registry.service';
import type { IWhatsAppProvider } from '../interfaces/whatsapp-provider.interface';

export class CreateInstanceDto {
  @IsString()
  @IsOptional()
  webhookUrl?: string;

  @IsString()
  @IsOptional()
  token?: string;
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
   * Cria e registra uma instância WhatsApp para o tenant (Automático)
   */
  async createInstance(
    tenantId: string,
    dto: CreateInstanceDto,
  ): Promise<InstanceStatusDto> {
    try {
      // 1. Buscar Configuração Global
      const systemConfig = await this.prisma.systemConfig.findUnique({ where: { id: 'global' } });
      const providerType = systemConfig?.defaultWhatsAppProvider || 'evolution_go';
      const apiUrl = systemConfig?.evolutionUrl;
      const apiKey = systemConfig?.evolutionGlobalToken;

      if (providerType === 'evolution_go' && (!apiUrl || !apiKey)) {
        throw new BadRequestException('Infraestrutura WhatsApp não configurada no SaaS Admin.');
      }

      // 2. Gerar Nome Automático da Instância
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
      if (!tenant) throw new NotFoundException('Tenant não encontrado');
      
      // Sanitizar slug para evitar problemas com caracteres especiais
      const safeSlug = tenant.slug.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const instanceName = `gestor_${safeSlug}_${Math.random().toString(36).substring(7)}`;

      const provider = this.getProvider(providerType);

      // 3. Criar instância no provider externo
      let externalResult;
      try {
        externalResult = await provider.createInstance(
          apiUrl!,
          apiKey!,
          {
            instanceName,
            webhookUrl: dto.webhookUrl || '',
          },
        );
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Erro desconhecido';
        const errorStack = err instanceof Error ? err.stack : '';
        
        // Narrowing for Axios/Fetch style errors without using 'any'
        let errorResponseData: string | undefined;
        if (err && typeof err === 'object' && 'response' in err) {
          const resp = (err as { response: unknown }).response;
          if (resp && typeof resp === 'object' && 'data' in resp) {
            const data = (resp as { data: unknown }).data;
            if (data && typeof data === 'object' && 'error' in data) {
              errorResponseData = String((data as { error: unknown }).error);
            }
          }
        }

        this.logger.error(`Error creating instance in external provider: ${errorMsg}`, errorStack);
        throw new InternalServerErrorException(`Falha no provedor WhatsApp: ${errorResponseData || errorMsg}`);
      }

      // 4. Salvar no banco
      const instance = await this.prisma.whatsAppInstance.upsert({
        where: { tenantId },
        create: {
          tenantId,
          providerType,
          instanceName,
          apiUrl: apiUrl!,
          apiKey: externalResult.token || apiKey!,
          status: 'disconnected',
          evolutionInstanceId: externalResult.instanceId,
        },
        update: {
          providerType,
          instanceName,
          apiUrl: apiUrl!,
          apiKey: externalResult.token || apiKey!,
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
    } catch (error: unknown) {
      if (error instanceof BadRequestException || error instanceof NotFoundException || error instanceof InternalServerErrorException) {
        throw error;
      }
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      const errorStack = error instanceof Error ? error.stack : '';
      this.logger.error(`Unexpected error in createInstance: ${errorMsg}`, errorStack);
      throw new InternalServerErrorException(`Erro ao criar instância: ${errorMsg}`);
    }
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

    console.log(`[WhatsApp Service] Connecting to instance: ${instance.evolutionInstanceId || instance.instanceName}`);

    const connectionStatus = await provider.connect(
      instance.apiUrl,
      instance.apiKey,
      instance.evolutionInstanceId || instance.instanceName,
      { webhookUrl },
    );

    console.log(`[WhatsApp Service] Connection status received:`, connectionStatus);

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

    const result = {
      id: updated.id,
      instanceName: updated.instanceName,
      providerType: updated.providerType,
      status: updated.status,
      phoneNumber: connectionStatus.phoneNumber || updated.phoneNumber,
      qrCode: connectionStatus.qrCode,
    };

    console.log(`[WhatsApp Service] Final result:`, result);
    console.log(`[WhatsApp Service] QR Code in result:`, result.qrCode ? 'YES' : 'NO');

    return result;
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
   * Gera código de pareamento de 8 dígitos
   */
  async generatePairingCode(tenantId: string, phone?: string): Promise<{ pairingCode: string }> {
    const instance = await this.getInstanceOrFail(tenantId);
    const provider = this.getProvider(instance.providerType);

    return await provider.generatePairingCode(
      instance.apiUrl,
      instance.apiKey,
      instance.instanceName, // Usar o nome legível (slug) em vez do UUID para compatibilidade
      phone,
    );
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
