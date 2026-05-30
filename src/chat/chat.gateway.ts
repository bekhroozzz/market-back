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

export type AuthSocket = Socket & { userId: number; userRole: string };

@WebSocketGateway({
  cors: {
    origin: '*',
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

      (client as AuthSocket).userId = Number(payload.sub);
      (client as AuthSocket).userRole = payload.role;

      // Join personal room so we can push notifications
      await client.join(`user:${payload.sub}`);
      this.logger.log(`Client connected: userId=${payload.sub} socketId=${client.id}`);
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
    if (!data?.chatId) return;
    await client.join(`chat:${data.chatId}`);
  }

  /** Leave a chat room */
  @SubscribeMessage('chat.leave')
  async handleLeaveChat(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { chatId: string },
  ) {
    if (!data?.chatId) return;
    await client.leave(`chat:${data.chatId}`);
  }

  // ─── Server-side emit helpers (called by ChatService) ─────────────────────

  emitChatCreated(chat: unknown, userId: number) {
    this.server.to(`user:${userId}`).emit('chat.created', chat);
  }

  emitMessageCreated(chatId: string, message: unknown) {
    // Emit only to the chat room. Both parties receive it if they're currently
    // viewing the chat. Recipients not on the page get the notification.created
    // event (personal room) as a toast/badge — no double-delivery.
    this.server.to(`chat:${chatId}`).emit('message.created', message);
  }

  emitMessageRead(chatId: string, userId: number) {
    this.server.to(`chat:${chatId}`).emit('message.read', { chatId });
    this.server.to(`user:${userId}`).emit('message.read', { chatId });
  }

  emitNotification(notification: unknown, userId: number) {
    this.server.to(`user:${userId}`).emit('notification.created', notification);
  }
}
