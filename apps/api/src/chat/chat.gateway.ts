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
import type { ChatMessage, ChatSession } from '@prisma/client';

interface ChatMessageCreatedEvent {
  sessionId: string;
  message: ChatMessage;
}

interface SessionUpdatedEvent {
  session: ChatSession;
}

@WebSocketGateway({
  cors: true,
  namespace: 'chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('ChatGateway');

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected to chat namespace: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected from chat namespace: ${client.id}`);
  }

  @SubscribeMessage('joinTenant')
  handleJoinTenant(
    @MessageBody() data: { tenantId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data.tenantId) return { event: 'error', data: 'TenantId missing' };
    client.join(`tenant:${data.tenantId}`);
    this.logger.log(`Client ${client.id} joined chat updates for tenant: ${data.tenantId}`);
    return { event: 'joinedTenant', data: { tenantId: data.tenantId } };
  }

  @SubscribeMessage('joinSession')
  handleJoinSession(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data.sessionId) return { event: 'error', data: 'SessionId missing' };
    client.join(`session:${data.sessionId}`);
    this.logger.log(`Client ${client.id} joined chat session: ${data.sessionId}`);
    return { event: 'joinedSession', data: { sessionId: data.sessionId } };
  }

  emitMessageCreated(tenantId: string, sessionId: string, message: ChatMessage) {
    const event: ChatMessageCreatedEvent = {
      sessionId,
      message,
    };
    this.server.to(`tenant:${tenantId}`).emit('messageCreated', event);
    this.server.to(`session:${sessionId}`).emit('messageCreated', event);
    this.logger.debug(`Emitted messageCreated for session ${sessionId} to tenant ${tenantId}`);
  }

  emitSessionUpdated(tenantId: string, session: ChatSession) {
    const event: SessionUpdatedEvent = {
      session,
    };
    this.server.to(`tenant:${tenantId}`).emit('sessionUpdated', event);
    this.logger.debug(`Emitted sessionUpdated for session ${session.id} to tenant ${tenantId}`);
  }
}
