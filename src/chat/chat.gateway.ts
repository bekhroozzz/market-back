import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUUID } from 'class-validator';
import { ChatEntity } from './entities/chat.entity';
import { Role } from '../user/enums/role.enum';
import { getAllowedOrigins } from '../config/cors-origins';

export type AuthSocket = Socket & {
  userId: number;
  userRole: string;
  data: { userId: number; userRole: string };
};

@WebSocketGateway({
  cors: {
    origin: getAllowedOrigins(),
    credentials: true,
  },
  namespace: '/ws',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(ChatEntity)
    private readonly chatRepo: Repository<ChatEntity>,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.query?.token as string | undefined);

      if (!token) throw new WsException('No token');

      const payload = this.jwtService.verify<{ sub: string; role: string }>(
        token,
        { secret: this.configService.get<string>('JWT_SECRET') },
      );

      const userId = Number(payload.sub);
      if (!Number.isSafeInteger(userId) || userId <= 0)
        throw new WsException('Invalid user');

      (client as AuthSocket).userId = userId;
      (client as AuthSocket).userRole = payload.role;
      client.data.userId = userId;
      client.data.userRole = payload.role;

      // Join personal room so we can push notifications
      await client.join(`user:${userId}`);
      this.logger.log(
        `Client connected: userId=${payload.sub} socketId=${client.id}`,
      );
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: socketId=${client.id}`);
  }

  /** Join a specific chat room to receive real-time messages */
  @SubscribeMessage('chat.join')
  async handleJoinChat(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { chatId: string },
  ) {
    if (!isUUID(data?.chatId)) throw new WsException('Invalid chatId');

    if (client.userRole !== Role.Admin) {
      const allowed = await this.chatRepo.exists({
        where: [
          { id: data.chatId, sellerId: client.userId },
          { id: data.chatId, buyerId: client.userId },
        ],
      });
      if (!allowed) throw new WsException('Chat access denied');
    }

    await client.join(`chat:${data.chatId}`);
    return { ok: true };
  }

  /** Leave a chat room */
  @SubscribeMessage('chat.leave')
  async handleLeaveChat(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { chatId: string },
  ) {
    if (!isUUID(data?.chatId)) throw new WsException('Invalid chatId');
    await client.leave(`chat:${data.chatId}`);
    return { ok: true };
  }

  // ─── Server-side emit helpers (called by ChatService) ─────────────────────

  emitChatCreated(chat: unknown, userIds: number[]) {
    for (const userId of new Set(userIds)) {
      this.server.to(`user:${userId}`).emit('chat.created', chat);
    }
  }

  emitChatUpdated(chat: unknown, userIds: number[]) {
    for (const userId of new Set(userIds)) {
      this.server.to(`user:${userId}`).emit('chat.updated', chat);
    }
  }

  emitMessageCreated(chatId: string, message: unknown) {
    // Emit only to the chat room. Both parties receive it if they're currently
    // viewing the chat. Recipients not on the page get the notification.created
    // event (personal room) as a toast/badge — no double-delivery.
    this.server.to(`chat:${chatId}`).emit('message.created', message);
  }

  emitMessageRead(chatId: string, readerId: number, readAt: Date) {
    const payload = { chatId, readerId, readAt };
    this.server.to(`chat:${chatId}`).emit('message.read', payload);
  }

  async isUserActiveInChat(userId: number, chatId: string): Promise<boolean> {
    if (!this.server || !isUUID(chatId)) return false;
    const sockets = await this.server.in(`chat:${chatId}`).fetchSockets();
    return sockets.some((socket) => Number(socket.data.userId) === userId);
  }

  emitNotification(notification: unknown, userId: number) {
    this.server.to(`user:${userId}`).emit('notification.created', notification);
  }
}
