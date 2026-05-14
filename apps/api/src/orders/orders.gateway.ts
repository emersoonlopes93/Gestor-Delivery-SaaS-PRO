import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: true,
  namespace: 'orders',
})
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('OrdersGateway');

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected to orders namespace: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected from orders namespace: ${client.id}`);
  }

  @SubscribeMessage('joinOrder')
  handleJoinOrder(
    @MessageBody() data: { token: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data.token) return { event: 'error', data: 'Token missing' };
    client.join(`order:${data.token}`);
    this.logger.log(`Client ${client.id} joined tracking for order token: ${data.token}`);
    return { event: 'joined', data: { token: data.token } };
  }

  @SubscribeMessage('joinTenant')
  handleJoinTenant(
    @MessageBody() data: { tenantId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data.tenantId) return { event: 'error', data: 'TenantId missing' };
    client.join(`tenant:${data.tenantId}`);
    this.logger.log(`Client ${client.id} joined updates for tenant: ${data.tenantId}`);
    return { event: 'joinedTenant', data: { tenantId: data.tenantId } };
  }

  emitOrderStatusUpdated(token: string, status: string, note?: string) {
    this.server.to(`order:${token}`).emit('statusUpdated', { 
      status, 
      note, 
      timestamp: new Date().toISOString() 
    });
  }

  emitNewOrder(tenantId: string, order: any) {
    this.server.to(`tenant:${tenantId}`).emit('newOrder', {
      order,
      timestamp: new Date().toISOString()
    });
  }
}
