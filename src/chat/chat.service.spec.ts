import { BadRequestException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { ChatService } from './chat.service';
import { ChatEntity } from './entities/chat.entity';
import { ChatMessageEntity } from './entities/chat-message.entity';
import { NotificationType } from '../notification/entities/notification.entity';

const CHAT_ID = 'c7c246d8-7372-4e1d-a0e7-dcb60cf30f55';

describe('ChatService', () => {
  const chatRepo = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(),
  };
  const messageRepo = {};
  const offerRepo = { findOne: jest.fn() };
  const notificationService = {
    create: jest.fn(),
    markByEntityAndType: jest.fn(),
  };
  const chatGateway = {
    isUserActiveInChat: jest.fn(),
    emitNotification: jest.fn(),
  };
  const dataSource = { transaction: jest.fn() };
  let service: ChatService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ChatService(
      chatRepo as never,
      messageRepo as never,
      offerRepo as never,
      notificationService as never,
      chatGateway as never,
      dataSource as never,
    );
  });

  it('rejects whitespace-only messages before writing', async () => {
    await expect(
      service.sendMessage(CHAT_ID, { message: '   ' }, 1),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('reloads the fully related chat after an openChat uniqueness race', async () => {
    const concurrentChat = {
      id: CHAT_ID,
      sellerId: 1,
      buyerId: 2,
      offer: {},
      seller: {},
      buyer: {},
      lastMessage: null,
    } as ChatEntity;
    offerRepo.findOne.mockResolvedValue({
      id: 'feef7252-e9a1-4110-84e7-8d25d43a3223',
      title: 'Offer',
      author: { id: 1 },
    });
    chatRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(concurrentChat);
    chatRepo.save.mockRejectedValue(
      new QueryFailedError('INSERT', [], { code: '23505' } as never),
    );

    await expect(
      service.openChat({ offerId: 'feef7252-e9a1-4110-84e7-8d25d43a3223' }, 2),
    ).resolves.toEqual({ chat: concurrentChat, created: false });
    expect(chatRepo.findOne).toHaveBeenLastCalledWith(
      expect.objectContaining({
        relations: ['offer', 'seller', 'buyer', 'lastMessage'],
      }),
    );
  });

  it('uses one transaction, trims text, and only increments the recipient', async () => {
    const chat = {
      id: CHAT_ID,
      sellerId: 1,
      buyerId: 2,
      unreadForSeller: 4,
      unreadForBuyer: 8,
    } as ChatEntity;
    const relatedChat = { ...chat, lastMessage: {} } as ChatEntity;
    const savedMessage = {
      id: '5b23398d-c12e-4579-b32e-722e2a5eef88',
      chatId: CHAT_ID,
      senderId: 1,
      message: 'hello',
      createdAt: new Date(),
    } as ChatMessageEntity;
    const messageRepository = {
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(savedMessage),
    };
    const execute = jest.fn().mockResolvedValue({ affected: 1 });
    const set = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({ execute }),
    });
    const chatRepository = {
      findOne: jest.fn().mockResolvedValue(chat),
      createQueryBuilder: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnValue({ set }),
      }),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === ChatMessageEntity ? messageRepository : chatRepository,
      ),
    };

    chatRepo.findOne
      .mockResolvedValueOnce(chat)
      .mockResolvedValueOnce(relatedChat);
    chatGateway.isUserActiveInChat.mockResolvedValue(true);
    notificationService.create.mockResolvedValue({ id: 'notification-id' });
    dataSource.transaction.mockImplementation((callback) => callback(manager));

    const result = await service.sendMessage(
      CHAT_ID,
      { message: '  hello  ' },
      1,
    );

    expect(messageRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'hello' }),
    );
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        lastMessageId: savedMessage.id,
        unreadForBuyer: expect.any(Function),
      }),
    );
    expect(set.mock.calls[0][0]).not.toHaveProperty('unreadForSeller');
    expect(notificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 2,
        type: NotificationType.NEW_MESSAGE,
        entityId: CHAT_ID,
      }),
      manager,
      true,
    );
    expect(chatGateway.emitNotification).not.toHaveBeenCalled();
    expect(result).toEqual({ message: savedMessage, chat: relatedChat });
  });

  it('locks the chat and marks messages, counters, and notifications read together', async () => {
    const chat = {
      id: CHAT_ID,
      sellerId: 1,
      buyerId: 2,
    } as ChatEntity;
    const relatedChat = { ...chat, unreadForBuyer: 0 } as ChatEntity;
    const messageExecute = jest.fn().mockResolvedValue({ affected: 2 });
    const counterExecute = jest.fn().mockResolvedValue({ affected: 1 });
    const messageRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({ execute: messageExecute }),
          }),
        }),
      }),
    };
    const chatRepository = {
      findOne: jest.fn().mockResolvedValue(chat),
      createQueryBuilder: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({ execute: counterExecute }),
          }),
        }),
      }),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === ChatMessageEntity ? messageRepository : chatRepository,
      ),
    };

    chatRepo.findOne.mockResolvedValue(relatedChat);
    dataSource.transaction.mockImplementation((callback) => callback(manager));

    const result = await service.markRead(CHAT_ID, 2);

    expect(chatRepository.findOne).toHaveBeenCalledWith({
      where: { id: CHAT_ID },
      lock: { mode: 'pessimistic_write' },
    });
    expect(messageExecute).toHaveBeenCalled();
    expect(counterExecute).toHaveBeenCalled();
    expect(notificationService.markByEntityAndType).toHaveBeenCalledWith(
      2,
      CHAT_ID,
      NotificationType.NEW_MESSAGE,
      manager,
    );
    expect(result.chat).toBe(relatedChat);
    expect(result.readAt).toBeInstanceOf(Date);
  });
});
