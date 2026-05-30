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
      // Normalize token coming from either auth or headers. Support both raw and "Bearer <token>" formats.
      let rawToken = client.handshake.auth?.token;
      if (!rawToken) rawToken = client.handshake.headers.authorization;
      if (typeof rawToken === 'string' && rawToken.startsWith('Bearer ')) rawToken = rawToken.replace('Bearer ', '').trim();

      const token = typeof rawToken === 'string' ? rawToken : undefined;

      if (!token) {
        this.logger.warn(`[CHAT_WS] Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const payload = await this.validateToken(token);
      if (!payload || !payload.tenantId) {
        this.logger.warn(`[CHAT_WS] Client ${client.id} connected with invalid token`);
        client.disconnect();
        return;
      }

      client.data.tenantId = payload.tenantId;
      client.data.userId = payload.sub;
      this.logger.log(`[CHAT_WS] client_authenticated tenantId=${payload.tenantId} clientId=${client.id}`);
    } catch (error) {
      this.logger.error(`Error handling connection for client ${client.id}:`, error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`[CHAT_WS] client_disconnected clientId=${client.id}`);
  }

  @SubscribeMessage('joinTenant')
  handleJoinTenant(
    @MessageBody() data: { tenantId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const clientTenantId = client.data.tenantId;
    
    if (!data.tenantId) {
      this.logger.warn(`[CHAT_WS] client_join_tenant_missing tenantClient=${client.id}`);
      return { event: 'error', data: 'TenantId missing' };
    }

    if (data.tenantId !== clientTenantId) {
      this.logger.warn(`[CHAT_WS] client_join_unauthorized clientId=${client.id} tried=${data.tenantId} actual=${clientTenantId}`);
      return { event: 'error', data: 'Unauthorized tenant' };
    }

    client.join(`tenant:${data.tenantId}`);
    this.logger.log(`[CHAT_WS] joined_tenant_room tenantId=${data.tenantId} clientId=${client.id}`);
    return { event: 'joinedTenant', data: { tenantId: data.tenantId } };
  }

  @SubscribeMessage('joinSession')
  async handleJoinSession(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const clientTenantId = client.data.tenantId;
    
    if (!data.sessionId) {
      this.logger.warn(`[CHAT_WS] client_join_session_missing clientId=${client.id}`);
      return { event: 'error', data: 'SessionId missing' };
    }

    const ownsSession = await this.validateSessionOwnership(data.sessionId, clientTenantId);
    if (!ownsSession) {
      this.logger.warn(`[CHAT_WS] client_join_session_unauthorized clientId=${client.id} sessionId=${data.sessionId}`);
      return { event: 'error', data: 'Unauthorized session' };
    }

    client.join(`session:${data.sessionId}`);
    this.logger.log(`[CHAT_WS] joined_session_room sessionId=${data.sessionId} clientId=${client.id}`);
    return { event: 'joinedSession', data: { sessionId: data.sessionId } };
  }

  emitMessageCreated(tenantId: string, sessionId: string, message: ChatMessage) {
    if (!this.server) {
      this.logger.warn(`[CHAT_WS] server_not_initialized skipping emitMessageCreated sessionId=${sessionId}`);
      return;
    }
    const event: ChatMessageCreatedEvent = {
      sessionId,
      message,
    };
    this.server.to(`tenant:${tenantId}`).emit('messageCreated', event);
    this.server.to(`session:${sessionId}`).emit('messageCreated', event);
    this.logger.log(`[CHAT_WS] message_emitted for session ${sessionId} to tenant ${tenantId}`);
  }

  emitSessionUpdated(tenantId: string, session: ChatSession) {
    if (!this.server) {
      this.logger.warn(`[CHAT_WS] server_not_initialized skipping emitSessionUpdated sessionId=${session.id}`);
      return;
    }
    const event: SessionUpdatedEvent = {
      session,
    };
    this.server.to(`tenant:${tenantId}`).emit('sessionUpdated', event);
    this.logger.log(`[CHAT_WS] session_updated for session ${session.id} to tenant ${tenantId}`);
  }
}
