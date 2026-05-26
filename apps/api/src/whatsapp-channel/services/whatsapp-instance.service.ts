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

  private async resolveApiKeyForProvider(input: {
    providerType: WhatsAppProviderType;
    instanceApiKey: string;
  }): Promise<string> {
    return input.instanceApiKey;
  }

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

      // Check if we already have an instance for this tenant
      const existing = await this.prisma.whatsAppInstance.findUnique({
        where: { tenantId },
      });

      if (existing) {
        this.logger.log(`Reusing existing instance for tenant ${tenantId}: ${existing.instanceName}`);
        return {
          id: existing.id,
          instanceName: existing.instanceName,
          providerType: existing.providerType,
          status: existing.status,
          phoneNumber: existing.phoneNumber,
        };
      }

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
      const webhookSecret = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      
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
          webhookSecret,
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

    const safeWebhookUrl = this.maskWebhookSecret(webhookUrl);
    console.log(`[WhatsApp Service] Webhook URL: ${safeWebhookUrl}`);

    const apiKeyForConnect = await this.resolveApiKeyForProvider({
      providerType: instance.providerType,
      instanceApiKey: instance.apiKey,
    });

    let connectionStatus: Awaited<ReturnType<typeof provider.connect>>;
    try {
      connectionStatus = await provider.connect(
        instance.apiUrl,
        apiKeyForConnect,
        instance.evolutionInstanceId || instance.instanceName,
        { webhookUrl, tenantId },
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Erro desconhecido';
      const errorStack = err instanceof Error ? err.stack : '';

      let errorResponseData: string | undefined;
      if (err && typeof err === 'object' && 'response' in err) {
        const resp = (err as { response: unknown }).response;
        if (resp && typeof resp === 'object' && 'data' in resp) {
          const data = (resp as { data: unknown }).data;
          errorResponseData = typeof data === 'string' ? data : JSON.stringify(data);
        }
      }

      this.logger.error(`Error connecting instance in external provider: ${errorMsg}`, errorStack);
      throw new InternalServerErrorException(
        `Falha ao conectar na Evolution-Go. webhookUrl=${safeWebhookUrl} detalhe=${errorResponseData || errorMsg}`,
      );
    }

    console.log(`[WhatsApp Service] Connection status received:`, connectionStatus);

    // Atualizar status no banco
    const statusMap: Record<string, WhatsAppInstanceStatus> = {
      connected: 'connected',
      disconnected: 'disconnected',
      connecting: 'connecting',
      qr_pending: 'qr_pending',
    };

    const updateData: any = {
      status: statusMap[connectionStatus.state] || 'disconnected',
      phoneNumber: connectionStatus.phoneNumber || instance.phoneNumber,
    };
    if (connectionStatus.qrCode) {
      updateData.qrCode = connectionStatus.qrCode;
    }
    const updated = await this.prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: updateData,
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

  private maskWebhookSecret(url: string): string {
    return url.replace(/secret=[^&]+/i, 'secret=***');
  }

  /**
   * Desconecta a instância WhatsApp do tenant
   */
  async disconnectInstance(tenantId: string): Promise<void> {
    const instance = await this.getInstanceOrFail(tenantId);
    const provider = this.getProvider(instance.providerType);

    const apiKeyForDisconnect = await this.resolveApiKeyForProvider({
      providerType: instance.providerType,
      instanceApiKey: instance.apiKey,
    });

    try {
      await provider.disconnect(
        instance.apiUrl,
        apiKeyForDisconnect,
        instance.evolutionInstanceId || instance.instanceName,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to disconnect from external provider for tenant ${tenantId} but proceeding with local disconnection: ${msg}`);
    }

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

    const apiKeyForPair = await this.resolveApiKeyForProvider({
      providerType: instance.providerType,
      instanceApiKey: instance.apiKey,
    });

    return await provider.generatePairingCode(
      instance.apiUrl,
      apiKeyForPair,
      instance.evolutionInstanceId || instance.instanceName,
      phone,
    );
  }

  /**
   * Obtém o status atual da instância
   */
  async getStatus(tenantId: string): Promise<InstanceStatusDto> {
    const instance = await this.getInstanceOrFail(tenantId);
    const provider = this.getProvider(instance.providerType);

    const apiKeyForStatus = await this.resolveApiKeyForProvider({
      providerType: instance.providerType,
      instanceApiKey: instance.apiKey,
    });

    const connectionStatus = await provider.getConnectionStatus(
      instance.apiUrl,
      apiKeyForStatus,
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

    const apiKeyForQr = await this.resolveApiKeyForProvider({
      providerType: instance.providerType,
      instanceApiKey: instance.apiKey,
    });

    return provider.getQrCode(
      instance.apiUrl,
      apiKeyForQr,
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
