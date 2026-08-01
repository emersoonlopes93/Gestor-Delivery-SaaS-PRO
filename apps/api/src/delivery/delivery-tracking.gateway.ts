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
import { DriverLocationUpdatedEvent } from '@gestor/types';
import { DriversService } from './drivers.service';
import { DriverAuthService } from '../auth/driver-auth.service';

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
  ) {
    DeliveryTrackingGateway.instance = this;
  }

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    if (typeof token === 'string' && token.length > 0) {
      try {
        const payload = await this.driverAuthService.validateAccessToken(token);
        client.data.driver = { driverId: payload.sub, tenantId: payload.tenantId };
      } catch {
        client.disconnect(true);
        return;
      }
    }
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Customers join a room named by the order tracking token to receive updates.
   */
  @SubscribeMessage('joinTracking')
  handleJoinTracking(
    @MessageBody() data: { token: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`order:${data.token}`);
    this.logger.log(`Client ${client.id} joined tracking for order: ${data.token}`);
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
  handleJoinTenantTracking(
    @MessageBody() data: { tenantId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`tenant:${data.tenantId}`);
    this.logger.log(`Client ${client.id} joined tracking for tenant: ${data.tenantId}`);
    return { event: 'joinedTenant', data: { tenantId: data.tenantId } };
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
    const driver = client.data.driver as { driverId: string; tenantId: string } | undefined;
    if (!driver || !Number.isFinite(data.lat) || !Number.isFinite(data.lng)) {
      throw new WsException('Unauthorized driver location update');
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
