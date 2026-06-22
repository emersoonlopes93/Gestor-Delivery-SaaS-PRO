import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { DriverLocationUpdatedEvent } from '@gestor/types';
import { DriversService } from './drivers.service';

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
  ) {
    DeliveryTrackingGateway.instance = this;
  }

  handleConnection(client: Socket) {
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
    @MessageBody() data: { driverId: string; tenantId: string; lat: number; lng: number },
  ) {
    // Persist to DB so polling-based map always has fresh coords
    try {
      await this.driversService.updateDriverLocation(data.tenantId, data.driverId, {
        lat: data.lat,
        lng: data.lng,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to persist location for driver ${data.driverId}: ${(err as Error).message}`,
      );
    }

    const event: DriverLocationUpdatedEvent = {
      driverId: data.driverId,
      tenantId: data.tenantId,
      lat: data.lat,
      lng: data.lng,
      lastLocationAt: new Date().toISOString(),
    };

    // Fire to tenant tracking UI
    this.server.to(`tenant:${data.tenantId}`).emit('driverLocationUpdated', event);
  }
}
