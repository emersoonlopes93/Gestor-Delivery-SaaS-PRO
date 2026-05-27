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
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service';
import type { ChatMessage, ChatSession } from '@prisma/client';
import type { TenantJwtPayload } from '@gestor/types';

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

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  private async validateToken(token: string): Promise<TenantJwtPayload | null> {
    try {
      const payload = await this.jwtService.verifyAsync(token);
      return payload as TenantJwtPayload;
    } catch {
      return null;
    }
  }

  private async validateSessionOwnership(sessionId: string, tenantId: string): Promise<boolean> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { tenantId: true },
    });
    return session?.tenantId === tenantId;
  }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token || client.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const payload = await this.validateToken(token);
      if (!payload || !payload.tenantId) {
        this.logger.warn(`Client ${client.id} connected with invalid token`);
        client.disconnect();
        return;
      }

      client.data.tenantId = payload.tenantId;
      client.data.userId = payload.sub;
      this.logger.log(`[CHAT_WS] Client ${client.id} connected for tenant: ${payload.tenantId}`);
    } catch (error) {
      this.logger.error(`Error handling connection for client ${client.id}:`, error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`[CHAT_WS] Client ${client.id} disconnected from chat namespace`);
  }

  @SubscribeMessage('joinTenant')
  handleJoinTenant(
    @MessageBody() data: { tenantId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const clientTenantId = client.data.tenantId;
    
    if (!data.tenantId) {
      this.logger.warn(`[CHAT_WS] Client ${client.id} tried to join without tenantId`);
      return { event: 'error', data: 'TenantId missing' };
    }

    if (data.tenantId !== clientTenantId) {
      this.logger.warn(`[CHAT_WS] Client ${client.id} tried to join tenant ${data.tenantId} but belongs to ${clientTenantId}`);
      return { event: 'error', data: 'Unauthorized tenant' };
    }

    client.join(`tenant:${data.tenantId}`);
    this.logger.log(`[CHAT_WS] Client ${client.id} joined chat updates for tenant: ${data.tenantId}`);
    return { event: 'joinedTenant', data: { tenantId: data.tenantId } };
  }

  @SubscribeMessage('joinSession')
  async handleJoinSession(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const clientTenantId = client.data.tenantId;
    
    if (!data.sessionId) {
      this.logger.warn(`[CHAT_WS] Client ${client.id} tried to join without sessionId`);
      return { event: 'error', data: 'SessionId missing' };
    }

    const ownsSession = await this.validateSessionOwnership(data.sessionId, clientTenantId);
    if (!ownsSession) {
      this.logger.warn(`[CHAT_WS] Client ${client.id} tried to join session ${data.sessionId} but does not own it`);
      return { event: 'error', data: 'Unauthorized session' };
    }

    client.join(`session:${data.sessionId}`);
    this.logger.log(`[CHAT_WS] Client ${client.id} joined chat session: ${data.sessionId}`);
    return { event: 'joinedSession', data: { sessionId: data.sessionId } };
  }

  emitMessageCreated(tenantId: string, sessionId: string, message: ChatMessage) {
    const event: ChatMessageCreatedEvent = {
      sessionId,
      message,
    };
    this.server.to(`tenant:${tenantId}`).emit('messageCreated', event);
    this.server.to(`session:${sessionId}`).emit('messageCreated', event);
    this.logger.log(`[CHAT_WS] message_emitted for session ${sessionId} to tenant ${tenantId}`);
  }

  emitSessionUpdated(tenantId: string, session: ChatSession) {
    const event: SessionUpdatedEvent = {
      session,
    };
    this.server.to(`tenant:${tenantId}`).emit('sessionUpdated', event);
    this.logger.log(`[CHAT_WS] session_updated for session ${session.id} to tenant ${tenantId}`);
  }
}
