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
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: true,
  namespace: 'delivery',
})
export class DeliveryTrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('DeliveryTrackingGateway');

  @WebSocketServer()
  server!: Server;

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
    this.server.to(`order:${orderToken}`).emit('locationUpdate', location);
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
   * Driver sends location updates continuously.
   */
  @SubscribeMessage('updateDriverLocation')
  async handleUpdateDriverLocation(
    @MessageBody() data: { driverId: string; tenantId: string; lat: number; lng: number },
  ) {
    // Fire it to any tenant tracking UI open.
    this.server.to(`tenant:${data.tenantId}`).emit('driverLocationUpdated', {
      driverId: data.driverId,
      lat: data.lat,
      lng: data.lng,
      timestamp: new Date().toISOString()
    });
  }
}
