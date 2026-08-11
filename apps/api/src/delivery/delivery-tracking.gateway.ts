import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { DriverDeliveryEvent, DriverLocationUpdatedEvent } from '@gestor/types';
import { OnEvent } from '@nestjs/event-emitter';
import { DriversService } from './drivers.service';
import { DriverAuthService } from '../auth/driver-auth.service';
import { TenantWebSocketAuthService } from '../auth/tenant-websocket-auth.service';
import { PublicOrderTrackingAccessService } from '../orders/public-order-tracking-access.service';
import { AUTH_SESSION_REVOKED_EVENT, AuthSessionRevokedEvent } from '../auth/auth-session.events';

@WebSocketGateway({
  cors: true,
  namespace: 'delivery',
})
export class DeliveryTrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('DeliveryTrackingGateway');
  static instance: DeliveryTrackingGateway | null = null;

  @WebSocketServer()
  server!: Server;

  constructor(
    @Inject(forwardRef(() => DriversService))
    private readonly driversService: DriversService,
    private readonly driverAuthService: DriverAuthService,
    private readonly tenantSocketAuth: TenantWebSocketAuthService,
    private readonly publicTrackingAccess: PublicOrderTrackingAccessService,
  ) {
    DeliveryTrackingGateway.instance = this;
  }

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    if (typeof token === 'string' && token.length > 0) {
      try {
        const payload = await this.tenantSocketAuth.validateAccessToken(token);
        client.data.tenantAccess = { token, userId: payload.sub, tenantId: payload.tenantId };
      } catch {
        try {
          const payload = await this.driverAuthService.validateAccessToken(token);
          client.data.driverAccess = { token, driverId: payload.sub, tenantId: payload.tenantId };
          client.data.authSessionId = payload.sid;
          await client.join(this.driverRoom(payload.tenantId, payload.sub));
        } catch {
          client.disconnect(true);
          return;
        }
      }
    }
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @OnEvent(AUTH_SESSION_REVOKED_EVENT)
  handleSessionRevoked(event: AuthSessionRevokedEvent) {
    for (const socket of this.server?.sockets.sockets.values() ?? []) {
      if (socket.data.authSessionId === event.sessionId) {
        socket.disconnect(true);
      }
    }
  }

  emitDriverDeliveryEvent(tenantId: string, driverId: string, event: DriverDeliveryEvent) {
    this.server?.to(this.driverRoom(tenantId, driverId)).emit('driverDeliveryEvent', event);
  }

  private driverRoom(tenantId: string, driverId: string) {
    return `driver:${tenantId}:${driverId}`;
  }

  /**
   * Customers join a room named by the order tracking token to receive updates.
   */
  @SubscribeMessage('joinTracking')
  async handleJoinTracking(
    @MessageBody() data: { token: string },
    @ConnectedSocket() client: Socket,
  ) {
    const boundToken = client.data.publicOrderToken;
    if (
      typeof data.token !== 'string'
      || data.token.length === 0
      || (typeof boundToken === 'string' && boundToken !== data.token)
    ) {
      throw new WsException('Não autorizado para este canal.');
    }
    client.data.publicOrderToken = data.token;
    if (!(await this.publicTrackingAccess.isValidToken(data.token))) {
      if (client.data.publicOrderToken === data.token) {
        delete client.data.publicOrderToken;
      }
      throw new WsException('Não autorizado para este canal.');
    }
    client.join(`order:${data.token}`);
    this.logger.log(`Client ${client.id} joined authorized public delivery tracking`);
    return { event: 'joined', data: { token: data.token } };
  }

  /**
   * Emit driver location update to everyone tracking a specific order.
   */
  emitLocationUpdate(orderToken: string, location: { lat: number; lng: number; driverId: string }) {
    const event: DriverLocationUpdatedEvent = {
      driverId: location.driverId,
      tenantId: '',
      lat: location.lat,
      lng: location.lng,
      lastLocationAt: new Date().toISOString(),
    };
    this.server.to(`order:${orderToken}`).emit('locationUpdate', event);
  }

  /**
   * Tenant joining to track all its drivers.
   */
  @SubscribeMessage('joinTenantTracking')
  async handleJoinTenantTracking(
    @MessageBody() data: { tenantId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const tenantAccess = client.data.tenantAccess as {
      token: string;
      userId: string;
      tenantId: string;
    } | undefined;
    if (!tenantAccess) {
      throw new WsException('Não autorizado para este canal.');
    }

    try {
      const payload = await this.tenantSocketAuth.validateAccessToken(tenantAccess.token);
      if (
        payload.sub !== tenantAccess.userId
        || payload.tenantId !== tenantAccess.tenantId
        || (data.tenantId && data.tenantId !== payload.tenantId)
      ) {
        throw new Error('socket identity changed');
      }
      client.join(`tenant:${payload.tenantId}`);
      this.logger.log(`Client ${client.id} joined its authorized tenant tracking`);
      return { event: 'joinedTenant', data: { tenantId: payload.tenantId } };
    } catch {
      this.logger.warn(`Rejected unauthorized delivery tenant room join: ${client.id}`);
      throw new WsException('Não autorizado para este canal.');
    }
  }

  /**
   * Driver sends location updates — persists to DB AND broadcasts to tenant UI.
   * BUG 4 FIX: previously only emitted via WS without persisting to DB.
   * Now calls DriversService.updateDriverLocation() so the polling-based map
   * always has fresh coordinates.
   */
  @SubscribeMessage('updateDriverLocation')
  async handleUpdateDriverLocation(
    @MessageBody() data: { lat: number; lng: number },
    @ConnectedSocket() client: Socket,
  ) {
    const driverAccess = client.data.driverAccess as {
      token: string;
      driverId: string;
      tenantId: string;
    } | undefined;
    if (!driverAccess || !Number.isFinite(data.lat) || !Number.isFinite(data.lng)) {
      throw new WsException('Não autorizado para este canal.');
    }

    let driver: { driverId: string; tenantId: string };
    try {
      const payload = await this.driverAuthService.validateAccessToken(driverAccess.token);
      if (payload.sub !== driverAccess.driverId || payload.tenantId !== driverAccess.tenantId) {
        throw new Error('socket identity changed');
      }
      driver = { driverId: payload.sub, tenantId: payload.tenantId };
    } catch {
      throw new WsException('Não autorizado para este canal.');
    }

    // Persist to DB so polling-based map always has fresh coords
    try {
      await this.driversService.updateDriverLocation(driver.tenantId, driver.driverId, {
        lat: data.lat,
        lng: data.lng,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to persist authenticated driver location: ${(err as Error).message}`,
      );
    }

    const event: DriverLocationUpdatedEvent = {
      driverId: driver.driverId,
      tenantId: driver.tenantId,
      lat: data.lat,
      lng: data.lng,
      lastLocationAt: new Date().toISOString(),
    };

    // Fire to tenant tracking UI
    this.server.to(`tenant:${driver.tenantId}`).emit('driverLocationUpdated', event);
  }
}
