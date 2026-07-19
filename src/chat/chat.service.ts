import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { ChatEntity } from './entities/chat.entity';
import { ChatMessageEntity } from './entities/chat-message.entity';
import { OfferEntity } from '../offer/entities/offer.entity';
import { Role } from '../user/enums/role.enum';
import { OpenChatDto } from './dto/open-chat.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/entities/notification.entity';
import { ChatGateway } from './chat.gateway';

const MESSAGES_PAGE_SIZE = 40;
const CHAT_RELATIONS = ['offer', 'seller', 'buyer', 'lastMessage'];

export interface OpenChatResult {
  chat: ChatEntity;
  created: boolean;
}

export interface SendMessageResult {
  message: ChatMessageEntity;
  chat: ChatEntity;
}

export interface MarkReadResult {
  chat: ChatEntity;
  readAt: Date;
}

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatEntity)
    private readonly chatRepo: Repository<ChatEntity>,
    @InjectRepository(ChatMessageEntity)
    private readonly messageRepo: Repository<ChatMessageEntity>,
    @InjectRepository(OfferEntity)
    private readonly offerRepo: Repository<OfferEntity>,
    private readonly notificationService: NotificationService,
    private readonly chatGateway: ChatGateway,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Open or return existing chat (buyer → seller per offer).
   */
  async openChat(dto: OpenChatDto, buyerId: number): Promise<OpenChatResult> {
    const offer = await this.offerRepo.findOne({
      where: { id: dto.offerId },
      select: ['id', 'title'],
      relations: ['author'],
    });
    if (!offer) throw new NotFoundException('Оффер не найден');

    const sellerId = offer.author.id;
    if (sellerId === buyerId)
      throw new BadRequestException('Нельзя создать чат с самим собой');

    const existing = await this.chatRepo.findOne({
      where: { offerId: dto.offerId, buyerId },
      relations: CHAT_RELATIONS,
    });
    if (existing) return { chat: existing, created: false };

    const chat = this.chatRepo.create({
      offerId: dto.offerId,
      sellerId,
      buyerId,
      lastMessageAt: null,
      lastMessageId: null,
    });
    try {
      const saved = await this.chatRepo.save(chat);
      return {
        chat: await this.loadRelatedChat(saved.id),
        created: true,
      };
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;

      const concurrent = await this.chatRepo.findOne({
        where: { offerId: dto.offerId, buyerId },
        relations: CHAT_RELATIONS,
      });
      if (!concurrent) throw error;
      return { chat: concurrent, created: false };
    }
  }

  /**
   * List chats for the current user (buyer or seller).
   * Admin sees all chats.
   */
  async listChats(userId: number, role: Role): Promise<ChatEntity[]> {
    const qb = this.chatRepo
      .createQueryBuilder('chat')
      .leftJoinAndSelect('chat.offer', 'offer')
      .leftJoinAndSelect('chat.seller', 'seller')
      .leftJoinAndSelect('chat.buyer', 'buyer')
      .leftJoinAndSelect('chat.lastMessage', 'lastMessage')
      .select([
        'chat.id',
        'chat.offerId',
        'chat.sellerId',
        'chat.buyerId',
        'chat.lastMessageAt',
        'chat.unreadForSeller',
        'chat.unreadForBuyer',
        'chat.createdAt',
        'offer.id',
        'offer.title',
        'offer.images',
        'offer.price',
        'offer.slug',
        'seller.id',
        'seller.email',
        'buyer.id',
        'buyer.email',
        'lastMessage.id',
        'lastMessage.message',
        'lastMessage.senderId',
        'lastMessage.createdAt',
      ])
      .orderBy('chat.lastMessageAt', 'DESC', 'NULLS LAST');

    if (role !== Role.Admin) {
      qb.where('chat.sellerId = :userId OR chat.buyerId = :userId', { userId });
    }

    return qb.getMany();
  }

  /**
   * Get paginated messages for a chat.
   */
  async getMessages(
    chatId: string,
    userId: number,
    role: Role,
    page: number,
  ): Promise<{ data: ChatMessageEntity[]; total: number }> {
    if (!Number.isInteger(page) || page < 1)
      throw new BadRequestException('Страница должна быть не меньше 1');
    await this.assertChatAccess(chatId, userId, role);

    const [data, total] = await this.messageRepo
      .createQueryBuilder('msg')
      .where('msg.chatId = :chatId', { chatId })
      .select([
        'msg.id',
        'msg.chatId',
        'msg.senderId',
        'msg.message',
        'msg.isRead',
        'msg.readAt',
        'msg.createdAt',
      ])
      .orderBy('msg.createdAt', 'DESC')
      .skip((page - 1) * MESSAGES_PAGE_SIZE)
      .take(MESSAGES_PAGE_SIZE)
      .getManyAndCount();

    return { data: data.reverse(), total };
  }

  /**
   * Send a message to a chat.
   */
  async sendMessage(
    chatId: string,
    dto: SendMessageDto,
    senderId: number,
  ): Promise<SendMessageResult> {
    const messageText = dto.message?.trim();
    if (!messageText)
      throw new BadRequestException('Сообщение не может быть пустым');

    const chat = await this.chatRepo.findOne({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Чат не найден');

    if (chat.sellerId !== senderId && chat.buyerId !== senderId)
      throw new ForbiddenException('Нет доступа к чату');

    const isSeller = chat.sellerId === senderId;
    const recipientId = isSeller ? chat.buyerId : chat.sellerId;
    const recipientIsActive = await this.chatGateway.isUserActiveInChat(
      recipientId,
      chatId,
    );

    const { saved, notification } = await this.dataSource.transaction(
      async (manager) => {
        const lockedChat = await manager.getRepository(ChatEntity).findOne({
          where: { id: chatId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!lockedChat) throw new NotFoundException('Чат не найден');
        if (
          lockedChat.sellerId !== senderId &&
          lockedChat.buyerId !== senderId
        )
          throw new ForbiddenException('Нет доступа к чату');

        const messageRepo = manager.getRepository(ChatMessageEntity);
        const msg = messageRepo.create({
          chatId,
          senderId,
          message: messageText,
          isRead: false,
          readAt: null,
        });
        const savedMessage = await messageRepo.save(msg);

        const counter = isSeller ? 'unreadForBuyer' : 'unreadForSeller';
        await manager
          .getRepository(ChatEntity)
          .createQueryBuilder()
          .update()
          .set({
            lastMessageId: savedMessage.id,
            lastMessageAt: savedMessage.createdAt,
            [counter]: () => `"${counter}" + 1`,
          })
          .where('id = :chatId', { chatId })
          .execute();

        const savedNotification = await this.notificationService.create(
          {
            userId: recipientId,
            type: NotificationType.NEW_MESSAGE,
            title: 'Новое сообщение',
            body:
              messageText.length > 100
                ? messageText.slice(0, 97) + '...'
                : messageText,
            entityId: chatId,
          },
          manager,
          recipientIsActive,
        );

        return {
          saved: savedMessage,
          notification: savedNotification,
        };
      },
    );

    if (!recipientIsActive) {
      this.chatGateway.emitNotification(notification, recipientId);
    }

    return {
      message: saved,
      chat: await this.loadRelatedChat(chatId),
    };
  }

  /**
   * Mark all unread messages in a chat as read for the current user.
   */
  async markRead(chatId: string, userId: number): Promise<MarkReadResult> {
    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      const chat = await manager.getRepository(ChatEntity).findOne({
        where: { id: chatId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!chat) throw new NotFoundException('Чат не найден');
      if (chat.sellerId !== userId && chat.buyerId !== userId)
        throw new ForbiddenException('Нет доступа к чату');

      await manager
        .getRepository(ChatMessageEntity)
        .createQueryBuilder()
        .update()
        .set({ isRead: true, readAt: now })
        .where('chatId = :chatId AND senderId != :userId AND isRead = false', {
          chatId,
          userId,
        })
        .execute();

      const counter =
        chat.sellerId === userId ? 'unreadForSeller' : 'unreadForBuyer';
      await manager
        .getRepository(ChatEntity)
        .createQueryBuilder()
        .update()
        .set({ [counter]: 0 })
        .where('id = :chatId', { chatId })
        .execute();

      await this.notificationService.markByEntityAndType(
        userId,
        chatId,
        NotificationType.NEW_MESSAGE,
        manager,
      );
    });

    return {
      chat: await this.loadRelatedChat(chatId),
      readAt: now,
    };
  }

  /**
   * Get a single chat by id (admin or participant).
   */
  async getChatById(
    chatId: string,
    userId: number,
    role: Role,
  ): Promise<ChatEntity> {
    await this.assertChatAccess(chatId, userId, role);
    const chat = await this.chatRepo.findOne({
      where: { id: chatId },
      relations: CHAT_RELATIONS,
    });
    if (!chat) throw new NotFoundException('Чат не найден');
    return chat;
  }

  // ─── Admin helpers ────────────────────────────────────────────────────────

  async adminListChats(filters: {
    sellerId?: number;
    buyerId?: number;
    offerId?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<ChatEntity[]> {
    const qb = this.chatRepo
      .createQueryBuilder('chat')
      .leftJoinAndSelect('chat.offer', 'offer')
      .leftJoinAndSelect('chat.seller', 'seller')
      .leftJoinAndSelect('chat.buyer', 'buyer')
      .leftJoinAndSelect('chat.lastMessage', 'lastMessage')
      .loadRelationCountAndMap('chat.messageCount', 'chat.messages')
      .orderBy('chat.lastMessageAt', 'DESC', 'NULLS LAST');

    if (filters.sellerId)
      qb.andWhere('chat.sellerId = :sellerId', { sellerId: filters.sellerId });
    if (filters.buyerId)
      qb.andWhere('chat.buyerId = :buyerId', { buyerId: filters.buyerId });
    if (filters.offerId)
      qb.andWhere('chat.offerId = :offerId', { offerId: filters.offerId });
    if (filters.dateFrom)
      qb.andWhere('chat.createdAt >= :dateFrom', {
        dateFrom: filters.dateFrom,
      });
    if (filters.dateTo)
      qb.andWhere('chat.createdAt <= :dateTo', { dateTo: filters.dateTo });

    return qb.getMany();
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async assertChatAccess(
    chatId: string,
    userId: number,
    role: Role,
  ): Promise<void> {
    if (role === Role.Admin) return;
    const chat = await this.chatRepo.findOne({
      where: { id: chatId },
      select: ['id', 'sellerId', 'buyerId'],
    });
    if (!chat) throw new NotFoundException('Чат не найден');
    if (chat.sellerId !== userId && chat.buyerId !== userId)
      throw new ForbiddenException('Нет доступа к чату');
  }

  private async loadRelatedChat(chatId: string): Promise<ChatEntity> {
    const chat = await this.chatRepo.findOne({
      where: { id: chatId },
      relations: CHAT_RELATIONS,
    });
    if (!chat) throw new NotFoundException('Чат не найден');
    return chat;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error as QueryFailedError & { driverError?: { code?: string } })
        .driverError?.code === '23505'
    );
  }
}
