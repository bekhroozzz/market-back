import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotificationEntity,
  NotificationType,
} from './entities/notification.entity';

export interface CreateNotificationDto {
  userId: number;
  type: NotificationType;
  title: string;
  body: string;
  entityId?: string | null;
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly repo: Repository<NotificationEntity>,
  ) {}

  async create(dto: CreateNotificationDto): Promise<NotificationEntity> {
    const notification = this.repo.create({
      userId: dto.userId,
      type: dto.type,
      title: dto.title,
      body: dto.body,
      entityId: dto.entityId ?? null,
      isRead: false,
    });
    return this.repo.save(notification);
  }

  async getUnreadForUser(userId: number): Promise<NotificationEntity[]> {
    return this.repo.find({
      where: { userId, isRead: false },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async getForUser(userId: number, page = 1, limit = 20): Promise<{ data: NotificationEntity[]; total: number }> {
    const [data, total] = await this.repo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async markRead(notificationId: string, userId: number): Promise<void> {
    await this.repo.update({ id: notificationId, userId }, { isRead: true });
  }

  async markAllRead(userId: number): Promise<void> {
    await this.repo.update({ userId, isRead: false }, { isRead: true });
  }

  async getUnreadCount(userId: number): Promise<number> {
    return this.repo.count({ where: { userId, isRead: false } });
  }
}
