import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum NotificationType {
  NEW_MESSAGE = 'new_message',
  OFFER_CREATED = 'offer_created',
  OFFER_UPDATED = 'offer_updated',
  OFFER_APPROVED = 'offer_approved',
  OFFER_REJECTED = 'offer_rejected',
  BOOKING_NEW = 'booking_new',
  BOOKING_CONFIRMED = 'booking_confirmed',
  BOOKING_REJECTED = 'booking_rejected',
  BOOKING_CANCELLED = 'booking_cancelled',
  BOOKING_ACTIVATED = 'booking_activated',
  BOOKING_COMPLETED = 'booking_completed',
}

@Entity({ name: 'notifications' })
@Index(['userId', 'isRead'])
@Index(['userId', 'createdAt'])
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  /** Related entity id (chatId, offerId, etc.) */
  @Column({ type: 'varchar', length: 255, nullable: true })
  entityId: string | null;

  @Column({ type: 'boolean', default: false })
  isRead: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
