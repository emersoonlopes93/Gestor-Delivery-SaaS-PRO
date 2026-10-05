import { BadGatewayException, BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { MarketplaceConnection, MarketplaceConnectionStatus, MarketplaceProvider } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { Food99ApiError } from '../providers/food99-api.error';
import { Food99HttpClientService } from './food99-http-client.service';
import { Food99TokenService } from './food99-token.service';
import { MarketplaceConnectionService } from './marketplace-connection.service';
import { Food99AuthorizationClient } from './food99-authorization-client.service';

type StartedAuthorization = {
  connection: MarketplaceConnection;
  authorizationUrl: string;
};

type AuthorizedShopCandidate = { shopId: string; shopName: string };
export type Food99SelfServiceVerification =
  | { authorized: true; connection: MarketplaceConnection }
  | { authorized: false; connection: MarketplaceConnection; state: 'AUTHORIZED_SHOP_SELECTION_REQUIRED'; candidates: AuthorizedShopCandidate[] };

@Injectable()
export class Food99SelfServiceConnectionService {
  private readonly bindingAttempts = new Map<string, Promise<Food99SelfServiceVerification>>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: MarketplaceConnectionService,
    private readonly food99Client: Food99HttpClientService,
    private readonly tokens: Food99TokenService,
    private readonly authorization: Food99AuthorizationClient,
  ) {}

  async start(tenantId: string, connectionId?: string): Promise<StartedAuthorization> {
    const connection = connectionId
      ? await this.getFood99Connection(tenantId, connectionId)
      : await this.createPendingConnection(tenantId);

    const authorizationUrl = await this.food99Client.getAuthorizationUrl(randomUUID(), this.appShopId(connection));
    return { connection, authorizationUrl };
  }

  async verify(tenantId: string, connectionId: string): Promise<Food99SelfServiceVerification> {
    const connection = await this.getFood99Connection(tenantId, connectionId);
    return this.runExclusive(connection, () => this.verifyConnection(connection));
  }

  /** Validates a support-configured app_shop_id without discovering or binding a shop. */
  async verifyExistingToken(tenantId: string, connectionId: string): Promise<MarketplaceConnection> {
    const connection = await this.getFood99Connection(tenantId, connectionId);
    try {
      await this.tokens.getAccessToken(connection);
    } catch (error) {
      if (error instanceof Food99ApiError) throw this.toVerificationException(error);
      throw error;
    }
    return this.connections.getTenantConnection(tenantId, connectionId);
  }

  async bind(tenantId: string, connectionId: string, shopId: string): Promise<Food99SelfServiceVerification> {
    const connection = await this.getFood99Connection(tenantId, connectionId);
    return this.runExclusive(connection, () => this.bindSelectedShop(connection, shopId));
  }

  private async verifyConnection(connection: MarketplaceConnection): Promise<Food99SelfServiceVerification> {
    try {
      // The documented auth-token API distinguishes no token (10101) from an
      // expired token (10102). Food99TokenService performs the safe sequence
      // and coalesces concurrent attempts per connection.
      await this.tokens.getAccessToken(connection);
    } catch (error) {
      if (error instanceof Food99ApiError) {
        if (error.providerCode === 'AUTH_TOKEN_NOT_AVAILABLE') {
          try {
            return await this.discoverAndBind(connection);
          } catch (discoveryError) {
            if (discoveryError instanceof Food99ApiError) throw this.toVerificationException(discoveryError);
            throw discoveryError;
          }
        }
        throw this.toVerificationException(error);
      }
      throw error;
    }
    const refreshed = await this.connections.getTenantConnection(connection.tenantId, connection.id);
    return { authorized: true, connection: refreshed };
  }

  private async discoverAndBind(connection: MarketplaceConnection): Promise<Food99SelfServiceVerification> {
    const shops = await this.authorization.getAuthorizedShops();
    const ownBound = shops.find((shop) => shop.boundFlag === 1 && shop.appShopId === this.appShopId(connection));
    if (ownBound) throw new ConflictException({ error: 'SHOP_BIND_NOT_CONFIRMED', message: 'A 99Food confirmou o estabelecimento, mas ainda não disponibilizou o token. Tente novamente em instantes.' });
    const unbound = shops.filter((shop) => shop.boundFlag === 0);
    if (unbound.length === 1) return this.bindSelectedShop(connection, unbound[0].shopId, true);
    if (unbound.length > 1) return { authorized: false, connection, state: 'AUTHORIZED_SHOP_SELECTION_REQUIRED', candidates: unbound.map(({ shopId, shopName }) => ({ shopId, shopName })) };
    if (shops.some((shop) => shop.boundFlag === 1 && shop.appShopId !== this.appShopId(connection))) {
      throw new ConflictException({ error: 'SHOP_ALREADY_BOUND', message: 'Este estabelecimento já está vinculado a outra identificação. Peça ajuda ao suporte da 99Food antes de continuar.' });
    }
    throw new ConflictException({ error: 'AUTHORIZED_SHOP_NOT_FOUND', message: 'Nenhum estabelecimento autorizado está disponível para concluir a conexão.' });
  }

  private async bindSelectedShop(connection: MarketplaceConnection, requestedShopId: string, automatic = false): Promise<Food99SelfServiceVerification> {
    const shops = await this.authorization.getAuthorizedShops();
    const selected = shops.find((shop) => shop.shopId === requestedShopId);
    if (!selected) throw new ConflictException({ error: 'AUTHORIZED_SHOP_NOT_FOUND', message: 'O estabelecimento selecionado não está mais autorizado. Atualize e tente novamente.' });
    const unbound = shops.filter((shop) => shop.boundFlag === 0);
    if (automatic && (unbound.length !== 1 || unbound[0].shopId !== selected.shopId)) {
      return { authorized: false, connection, state: 'AUTHORIZED_SHOP_SELECTION_REQUIRED', candidates: unbound.map(({ shopId, shopName }) => ({ shopId, shopName })) };
    }
    if (selected.boundFlag === 1) {
      if (selected.appShopId === this.appShopId(connection)) throw new ConflictException({ error: 'SHOP_BIND_NOT_CONFIRMED', message: 'A 99Food confirmou o estabelecimento, mas ainda não disponibilizou o token. Tente novamente em instantes.' });
      throw new ConflictException({ error: 'SHOP_ALREADY_BOUND', message: 'Este estabelecimento já está vinculado a outra identificação. Peça ajuda ao suporte da 99Food antes de continuar.' });
    }
    try {
      const bound = await this.authorization.bindShop(this.appShopId(connection), selected.shopId);
      if (bound.shopId !== selected.shopId) throw new Food99ApiError('99Food shop bind returned a different shop.', false, 502, 'INVALID_SHOP_BIND_RESPONSE');
      await this.tokens.persistBoundShopToken(connection, bound.authToken, bound.tokenExpiresAt, {
        externalMerchantId: bound.shopId,
        displayName: bound.shopName ?? selected.shopName,
      });
    } catch (error) {
      if (error instanceof Food99ApiError) throw this.toVerificationException(error);
      throw error;
    }
    return { authorized: true, connection: await this.connections.getTenantConnection(connection.tenantId, connection.id) };
  }

  private runExclusive(connection: MarketplaceConnection, action: () => Promise<Food99SelfServiceVerification>): Promise<Food99SelfServiceVerification> {
    const running = this.bindingAttempts.get(connection.id);
    if (running) return running;
    const next = action().finally(() => this.bindingAttempts.delete(connection.id));
    this.bindingAttempts.set(connection.id, next);
    return next;
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

  private toVerificationException(error: Food99ApiError): Error {
    switch (error.providerCode) {
      case 'AUTH_TOKEN_NOT_AVAILABLE':
        return new ConflictException({
          error: 'AUTH_TOKEN_NOT_AVAILABLE',
          message: 'A 99Food ainda não disponibilizou o token desta loja. Conclua a autorização na 99Food e verifique novamente.',
        });
      case 'AUTH_TOKEN_REFRESHED_WAIT_RETRY':
        return new ConflictException({
          error: 'AUTH_TOKEN_REFRESHED_WAIT_RETRY',
          message: 'A 99Food atualizou o token da loja. Aguarde 30 segundos e verifique novamente.',
        });
      case 'APP_ID_INVALID':
      case 'APP_SECRET_INVALID':
        return new ServiceUnavailableException({
          error: error.providerCode,
          message: 'A configuração da integração 99Food requer atenção do suporte. Nenhum pedido ou repasse foi alterado.',
        });
      case 'TOKEN_REFRESH_FAILED':
      case 'AUTH_TOKEN_GET_FAILED':
      case 'PROVIDER_SYSTEM_ERROR':
        return new ServiceUnavailableException({
          error: error.providerCode,
          message: 'A 99Food não pôde confirmar a autorização agora. Tente novamente em instantes.',
        });
      case 'PROVIDER_PARAMETER_ERROR':
        return new BadGatewayException({
          error: error.providerCode,
          message: 'A 99Food recusou os dados enviados para verificar a loja. Confira a conexão e fale com o suporte se persistir.',
        });
      case 'SHOP_BIND_FAILED':
      case 'INVALID_SHOP_BIND_RESPONSE':
      case 'INVALID_AUTHORIZED_SHOP_RESPONSE':
      case 'PROVIDER_AUTHORIZATION_UNAVAILABLE':
        return new BadGatewayException({
          error: error.providerCode,
          message: 'A 99Food não confirmou o vínculo desta loja. Nenhum pedido ou repasse foi alterado.',
        });
      default:
        if (error.retryable) {
          return new ServiceUnavailableException({
            error: 'PROVIDER_UNAVAILABLE',
            message: 'A 99Food não pôde confirmar a autorização agora. Tente novamente em instantes.',
          });
        }
        return new ConflictException({
          error: 'AUTHORIZATION_NOT_READY',
          message: 'A 99Food ainda não confirmou a autorização desta loja. Volte à 99Food e tente verificar novamente.',
        });
    }
  }
}
