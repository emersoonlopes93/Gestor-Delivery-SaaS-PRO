import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { MarketplaceConnection, MarketplaceConnectionStatus, MarketplaceProvider } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { Food99ApiError } from '../providers/food99-api.error';
import { Food99HttpClientService } from './food99-http-client.service';
import { Food99TokenService } from './food99-token.service';
import { MarketplaceConnectionService } from './marketplace-connection.service';

type StartedAuthorization = {
  connection: MarketplaceConnection;
  authorizationUrl: string;
};

@Injectable()
export class Food99SelfServiceConnectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: MarketplaceConnectionService,
    private readonly food99Client: Food99HttpClientService,
    private readonly tokens: Food99TokenService,
  ) {}

  async start(tenantId: string, connectionId?: string): Promise<StartedAuthorization> {
    const connection = connectionId
      ? await this.getFood99Connection(tenantId, connectionId)
      : await this.createPendingConnection(tenantId);

    const authorizationUrl = await this.food99Client.getAuthorizationUrl(randomUUID(), this.appShopId(connection));
    return { connection, authorizationUrl };
  }

  async verify(tenantId: string, connectionId: string): Promise<{ authorized: true; connection: MarketplaceConnection }> {
    const connection = await this.getFood99Connection(tenantId, connectionId);
    try {
      // A new self-service connection deliberately has no locally persisted
      // shop token. 99Food documents refresh -> get only when no usable token
      // exists, so a verified connection is never refreshed just because the
      // user reopens this flow.
      // Food99TokenService coalesces concurrent attempts per connection.
      await this.tokens.getAccessToken(connection, this.needsTokenRefresh(connection));
    } catch (error) {
      if (error instanceof Food99ApiError) {
        if (error.retryable) {
          throw new ServiceUnavailableException({
            error: 'PROVIDER_UNAVAILABLE',
            message: 'A 99Food não pôde confirmar a autorização agora. Tente novamente em instantes.',
          });
        }
        throw new ConflictException({
          error: 'AUTHORIZATION_NOT_READY',
          message: 'A 99Food ainda não confirmou a autorização desta loja. Volte à 99Food e tente verificar novamente.',
        });
      }
      throw error;
    }
    const refreshed = await this.connections.getTenantConnection(tenantId, connection.id);
    return { authorized: true, connection: refreshed };
  }

  private async getFood99Connection(tenantId: string, connectionId: string): Promise<MarketplaceConnection> {
    const connection = await this.connections.getTenantConnection(tenantId, connectionId);
    if (connection.provider !== MarketplaceProvider.FOOD_99) {
      throw new BadRequestException('The selected connection is not a 99Food connection.');
    }
    return connection;
  }

  private async createPendingConnection(tenantId: string): Promise<MarketplaceConnection> {
    const connectionId = randomUUID();
    return this.prisma.marketplaceConnection.create({
      data: {
        id: connectionId,
        tenantId,
        provider: MarketplaceProvider.FOOD_99,
        status: MarketplaceConnectionStatus.DISCONNECTED,
        // 99Food calls this value app_shop_id. The immutable connection ID is
        // already tenant-owned, opaque and persisted, so it is safe to reuse.
        externalStoreId: connectionId,
        authType: 'food99_self_service_pending',
      },
    });
  }

  private appShopId(connection: MarketplaceConnection): string {
    const appShopId = connection.externalStoreId?.trim();
    if (!appShopId) {
      throw new BadRequestException('99Food connection does not have a stable authorization identity.');
    }
    return appShopId;
  }

  private needsTokenRefresh(connection: MarketplaceConnection): boolean {
    const usableUntil = Date.now() + 60_000;
    return !connection.accessTokenEnc
      || !connection.tokenExpiresAt
      || connection.tokenExpiresAt.getTime() <= usableUntil;
  }
}
