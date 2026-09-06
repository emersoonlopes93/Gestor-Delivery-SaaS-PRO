import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import {
  OrderListItemDTO,
  type OrderChangedEvent,
  type OrderChangedReason,
  OrderStatusUpdatedEvent,
  OrderStatus,
  type NotificationDomainEvent,
  type TenantNotificationEventPayload,
} from '@gestor/types';
import { TenantWebSocketAuthService } from '../auth/tenant-websocket-auth.service';
import { PublicOrderTrackingAccessService } from './public-order-tracking-access.service';

@WebSocketGateway({
  cors: true,
  namespace: 'orders',
})
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('OrdersGateway');
  static instance: OrdersGateway | null = null;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly tenantSocketAuth: TenantWebSocketAuthService,
    private readonly publicTrackingAccess: PublicOrderTrackingAccessService,
  ) {
    OrdersGateway.instance = this;
  }

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    if (typeof token === 'string' && token.length > 0) {
      try {
        const payload = await this.tenantSocketAuth.validateAccessToken(token);
        client.data.tenantAccess = {
          token,
          userId: payload.sub,
          tenantId: payload.tenantId,
        };
      } catch {
        this.logger.warn(`Rejected invalid orders socket credential: ${client.id}`);
        client.disconnect(true);
        return;
      }
    }
    this.logger.debug(`Client connected to orders namespace: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected from orders namespace: ${client.id}`);
  }

  @SubscribeMessage('joinOrder')
  async handleJoinOrder(
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
    this.logger.log(`Client ${client.id} joined authorized public order tracking`);
    return { event: 'joined', data: { token: data.token } };
  }

  @SubscribeMessage('joinTenant')
  async handleJoinTenant(
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
      this.logger.log(`Client ${client.id} joined its authorized tenant updates`);
      return { event: 'joinedTenant', data: { tenantId: payload.tenantId } };
    } catch {
      this.logger.warn(`Rejected unauthorized orders tenant room join: ${client.id}`);
      throw new WsException('Não autorizado para este canal.');
    }
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
    const timestamp = new Date().toISOString();
    this.server.to(`tenant:${tenantId}`).emit('order.created', {
      type: 'order.created',
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      total: order.total,
      timestamp,
    } satisfies TenantNotificationEventPayload);
    this.server.to(`tenant:${tenantId}`).emit('newOrder', {
      order,
      timestamp,
    });
  }

  emitOrderChanged(tenantId: string, orderId: string, reason: OrderChangedReason) {
    if (!this.server) {
      this.logger.warn('WebSocket server not initialized. Skipping emitOrderChanged.');
      return;
    }
    const occurredAt = new Date().toISOString();
    const event: OrderChangedEvent = {
      eventId: `order.changed:${orderId}:${reason}:${occurredAt}`,
      orderId,
      reason,
      occurredAt,
    };
    this.server.to(`tenant:${tenantId}`).emit('order.changed', event);
  }

  emitOrderAutoAccepted(
    tenantId: string,
    input: { orderId: string; orderNumber: string; customerName?: string; total?: number | string },
  ) {
    if (!this.server) {
      this.logger.warn('WebSocket server not initialized. Skipping emitOrderAutoAccepted.');
      return;
    }
    const timestamp = new Date().toISOString();
    this.server.to(`tenant:${tenantId}`).emit('order.auto_accepted', {
      type: 'order.auto_accepted',
      ...input,
      timestamp,
    } satisfies TenantNotificationEventPayload);
    this.server.to(`tenant:${tenantId}`).emit('orderAutoAccepted', {
      ...input,
      timestamp,
    });
  }

  emitOrderCancelled(tenantId: string, input: { orderId: string; orderNumber: string }) {
    if (!this.server) {
      this.logger.warn('WebSocket server not initialized. Skipping emitOrderCancelled.');
      return;
    }
    const timestamp = new Date().toISOString();
    this.server.to(`tenant:${tenantId}`).emit('order.cancelled', {
      type: 'order.cancelled',
      ...input,
      timestamp,
    } satisfies TenantNotificationEventPayload);
    this.server.to(`tenant:${tenantId}`).emit('orderCancelled', {
      ...input,
      timestamp,
    });
  }

  /**
   * Emite evento de pedido marcado como pronto
   * @param orderId ID do pedido (incluso no payload canônico para deduplicação determinística)
   */
  emitOrderReady(
    tenantId: string,
    orderNumber: string,
    customerName?: string,
    fulfillmentType?: string,
    orderId?: string,
  ) {
    if (!this.server) {
      this.logger.warn('WebSocket server not initialized. Skipping emitOrderReady.');
      return;
    }
    const timestamp = new Date().toISOString();
    this.logger.log(`[Ready] Order ${orderNumber} marked as ready for tenant ${tenantId}`);
    this.server.to(`tenant:${tenantId}`).emit('order.ready', {
      type: 'order.ready',
      orderId,
      orderNumber,
      customerName,
      fulfillmentType,
      timestamp,
    } satisfies TenantNotificationEventPayload);
    this.server.to(`tenant:${tenantId}`).emit('orderReady', {
      orderId,
      orderNumber,
      customerName,
      fulfillmentType,
      timestamp,
    });
  }

  emitOrderDomainEvent(
    tenantId: string,
    type: NotificationDomainEvent,
    input: Omit<TenantNotificationEventPayload, 'type' | 'timestamp'>,
  ) {
    if (!this.server) {
      this.logger.warn(`WebSocket server not initialized. Skipping ${type}.`);
      return;
    }
    this.server.to(`tenant:${tenantId}`).emit(type, {
      type,
      ...input,
      timestamp: new Date().toISOString(),
    } satisfies TenantNotificationEventPayload);
  }
}
