import { NotFoundException } from '@nestjs/common';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  const repo = {
    update: jest.fn(),
    exists: jest.fn(),
  };
  let service: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationService(repo as never);
  });

  it('marks an unread owned notification as read', async () => {
    repo.update.mockResolvedValue({ affected: 1 });

    await expect(
      service.markRead('notification-id', 10),
    ).resolves.toBeUndefined();
    expect(repo.exists).not.toHaveBeenCalled();
  });

  it('treats an already-read owned notification as success', async () => {
    repo.update.mockResolvedValue({ affected: 0 });
    repo.exists.mockResolvedValue(true);

    await expect(
      service.markRead('notification-id', 10),
    ).resolves.toBeUndefined();
  });

  it('rejects missing or non-owned notifications', async () => {
    repo.update.mockResolvedValue({ affected: 0 });
    repo.exists.mockResolvedValue(false);

    await expect(
      service.markRead('notification-id', 10),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
