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
import { OrderListItemDTO, OrderStatusUpdatedEvent, OrderStatus } from '@gestor/types';

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

  emitOrderStatusUpdated(token: string, orderNumber: string, status: OrderStatus, note?: string) {
    if (!this.server) {
      this.logger.warn('WebSocket server not initialized. Skipping emitOrderStatusUpdated.');
      return;
    }
    const event: OrderStatusUpdatedEvent = {
      orderId: '', // Não temos o ID aqui mas o token/number bastam para o front
      orderNumber,
      status,
      publicTrackingToken: token,
      note,
    };
    this.server.to(`order:${token}`).emit('statusUpdated', event);
  }

  emitNewOrder(tenantId: string, order: OrderListItemDTO) {
    if (!this.server) {
      this.logger.warn('WebSocket server not initialized. Skipping emitNewOrder.');
      return;
    }
    this.server.to(`tenant:${tenantId}`).emit('newOrder', {
      order,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emite evento de transferência de IA para agente humano
   */
  emitAiHandoff(tenantId: string, sessionId: string, sessionName?: string, customerName?: string) {
    if (!this.server) {
      this.logger.warn('WebSocket server not initialized. Skipping emitAiHandoff.');
      return;
    }
    this.logger.log(`[Handoff] AI transferring session ${sessionId} to human agent for tenant ${tenantId}`);
    this.server.to(`tenant:${tenantId}`).emit('aiHandoff', {
      sessionId,
      sessionName,
      customerName,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emite evento de pedido marcado como pronto
   */
  emitOrderReady(
    tenantId: string,
    orderNumber: string,
    customerName?: string,
    fulfillmentType?: string,
  ) {
    if (!this.server) {
      this.logger.warn('WebSocket server not initialized. Skipping emitOrderReady.');
      return;
    }
    this.logger.log(`[Ready] Order ${orderNumber} marked as ready for tenant ${tenantId}`);
    this.server.to(`tenant:${tenantId}`).emit('orderReady', {
      orderNumber,
      customerName,
      fulfillmentType,
      timestamp: new Date().toISOString(),
    });
  }
}
