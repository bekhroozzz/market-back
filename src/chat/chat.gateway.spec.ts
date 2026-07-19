import { WsException } from '@nestjs/websockets';
import { ChatGateway, AuthSocket } from './chat.gateway';
import { Role } from '../user/enums/role.enum';

const CHAT_ID = 'c7c246d8-7372-4e1d-a0e7-dcb60cf30f55';

describe('ChatGateway', () => {
  const chatRepo = { exists: jest.fn() };
  let gateway: ChatGateway;

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new ChatGateway({} as never, {} as never, chatRepo as never);
  });

  it('only lets a participant join a chat room', async () => {
    chatRepo.exists.mockResolvedValue(true);
    const client = {
      userId: 12,
      userRole: Role.User,
      join: jest.fn(),
    } as unknown as AuthSocket;

    await expect(
      gateway.handleJoinChat(client, { chatId: CHAT_ID }),
    ).resolves.toEqual({ ok: true });
    expect(chatRepo.exists).toHaveBeenCalledWith({
      where: [
        { id: CHAT_ID, sellerId: 12 },
        { id: CHAT_ID, buyerId: 12 },
      ],
    });
    expect(client.join).toHaveBeenCalledWith(`chat:${CHAT_ID}`);
  });

  it('rejects non-participants and malformed chat ids', async () => {
    chatRepo.exists.mockResolvedValue(false);
    const client = {
      userId: 12,
      userRole: Role.User,
      join: jest.fn(),
    } as unknown as AuthSocket;

    await expect(
      gateway.handleJoinChat(client, { chatId: CHAT_ID }),
    ).rejects.toBeInstanceOf(WsException);
    await expect(
      gateway.handleJoinChat(client, { chatId: 'not-a-uuid' }),
    ).rejects.toBeInstanceOf(WsException);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('detects any active socket belonging to the recipient', async () => {
    gateway.server = {
      in: jest.fn().mockReturnValue({
        fetchSockets: jest
          .fn()
          .mockResolvedValue([
            { data: { userId: 7 } },
            { data: { userId: 42 } },
          ]),
      }),
    } as never;

    await expect(gateway.isUserActiveInChat(42, CHAT_ID)).resolves.toBe(true);
    expect(gateway.server.in).toHaveBeenCalledWith(`chat:${CHAT_ID}`);
  });
});
