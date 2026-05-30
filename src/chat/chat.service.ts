import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatEntity } from './entities/chat.entity';
import { ChatMessageEntity } from './entities/chat-message.entity';
import { OfferEntity } from '../offer/entities/offer.entity';
import { User } from '../user/entities/user.entity';
import { Role } from '../user/enums/role.enum';
import { OpenChatDto } from './dto/open-chat.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/entities/notification.entity';
import { ChatGateway } from './chat.gateway';

const MESSAGES_PAGE_SIZE = 40;

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatEntity)
    private readonly chatRepo: Repository<ChatEntity>,
    @InjectRepository(ChatMessageEntity)
    private readonly messageRepo: Repository<ChatMessageEntity>,
    @InjectRepository(OfferEntity)
    private readonly offerRepo: Repository<OfferEntity>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notificationService: NotificationService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  /**
   * Open or return existing chat (buyer → seller per offer).
   */
  async openChat(dto: OpenChatDto, buyerId: number): Promise<ChatEntity> {
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
      relations: ['offer', 'seller', 'buyer', 'lastMessage'],
    });
    if (existing) return existing;

    const chat = this.chatRepo.create({
      offerId: dto.offerId,
      sellerId,
      buyerId,
      lastMessageAt: null,
      lastMessageId: null,
    });
    return this.chatRepo.save(chat);
  }

  /**
   * List chats for the current user (buyer or seller).
   * Admin sees all chats.
   */
  async listChats(
    userId: number,
    role: Role,
  ): Promise<ChatEntity[]> {
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
    await this.assertChatAccess(chatId, userId, role);

    const [data, total] = await this.messageRepo
      .createQueryBuilder('msg')
      .where('msg.chatId = :chatId', { chatId })
      .select(['msg.id', 'msg.chatId', 'msg.senderId', 'msg.message', 'msg.isRead', 'msg.readAt', 'msg.createdAt'])
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
  ): Promise<ChatMessageEntity> {
    const chat = await this.chatRepo.findOne({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Чат не найден');

    if (chat.sellerId !== senderId && chat.buyerId !== senderId)
      throw new ForbiddenException('Нет доступа к чату');

    const msg = this.messageRepo.create({
      chatId,
      senderId,
      message: dto.message,
      isRead: false,
      readAt: null,
    });
    const saved = await this.messageRepo.save(msg);

    const isSeller = chat.sellerId === senderId;
    await this.chatRepo.update(chatId, {
      lastMessageId: saved.id,
      lastMessageAt: saved.createdAt,
      unreadForSeller: isSeller ? 0 : chat.unreadForSeller + 1,
      unreadForBuyer: isSeller ? chat.unreadForBuyer + 1 : 0,
    });

    const recipientId = isSeller ? chat.buyerId : chat.sellerId;
    const notification = await this.notificationService.create({
      userId: recipientId,
      type: NotificationType.NEW_MESSAGE,
      title: 'Новое сообщение',
      body: dto.message.length > 100 ? dto.message.slice(0, 97) + '...' : dto.message,
      entityId: chatId,
    });

    // Emit real-time notification to recipient's personal room
    this.chatGateway.emitNotification(notification, recipientId);

    return saved;
  }

  /**
   * Mark all unread messages in a chat as read for the current user.
   */
  async markRead(chatId: string, userId: number): Promise<void> {
    const chat = await this.chatRepo.findOne({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Чат не найден');

    if (chat.sellerId !== userId && chat.buyerId !== userId)
      throw new ForbiddenException('Нет доступа к чату');

    const now = new Date();
    await this.messageRepo
      .createQueryBuilder()
      .update()
      .set({ isRead: true, readAt: now })
      .where('chatId = :chatId AND senderId != :userId AND isRead = false', { chatId, userId })
      .execute();

    const isSeller = chat.sellerId === userId;
    await this.chatRepo.update(chatId, {
      unreadForSeller: isSeller ? 0 : chat.unreadForSeller,
      unreadForBuyer: isSeller ? chat.unreadForBuyer : 0,
    });
  }

  /**
   * Get a single chat by id (admin or participant).
   */
  async getChatById(chatId: string, userId: number, role: Role): Promise<ChatEntity> {
    await this.assertChatAccess(chatId, userId, role);
    const chat = await this.chatRepo.findOne({
      where: { id: chatId },
      relations: ['offer', 'seller', 'buyer', 'lastMessage'],
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

    if (filters.sellerId) qb.andWhere('chat.sellerId = :sellerId', { sellerId: filters.sellerId });
    if (filters.buyerId) qb.andWhere('chat.buyerId = :buyerId', { buyerId: filters.buyerId });
    if (filters.offerId) qb.andWhere('chat.offerId = :offerId', { offerId: filters.offerId });
    if (filters.dateFrom) qb.andWhere('chat.createdAt >= :dateFrom', { dateFrom: filters.dateFrom });
    if (filters.dateTo) qb.andWhere('chat.createdAt <= :dateTo', { dateTo: filters.dateTo });

    return qb.getMany();
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async assertChatAccess(chatId: string, userId: number, role: Role): Promise<void> {
    if (role === Role.Admin) return;
    const chat = await this.chatRepo.findOne({
      where: { id: chatId },
      select: ['id', 'sellerId', 'buyerId'],
    });
    if (!chat) throw new NotFoundException('Чат не найден');
    if (chat.sellerId !== userId && chat.buyerId !== userId)
      throw new ForbiddenException('Нет доступа к чату');
  }
}
