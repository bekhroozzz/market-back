import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { OfferEntity } from '../../offer/entities/offer.entity';
import { ChatMessageEntity } from './chat-message.entity';

@Entity({ name: 'chats' })
@Index(['offerId', 'buyerId'], { unique: true })
export class ChatEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  offerId: string;

  @ManyToOne(() => OfferEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'offerId' })
  offer: OfferEntity;

  @Column({ type: 'int' })
  sellerId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'sellerId' })
  seller: User;

  @Column({ type: 'int' })
  buyerId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'buyerId' })
  buyer: User;

  @Column({ type: 'uuid', nullable: true })
  lastMessageId: string | null;

  @OneToOne(() => ChatMessageEntity, { nullable: true })
  @JoinColumn({ name: 'lastMessageId' })
  lastMessage: ChatMessageEntity | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastMessageAt: Date | null;

  @Column({ type: 'int', default: 0 })
  unreadForSeller: number;

  @Column({ type: 'int', default: 0 })
  unreadForBuyer: number;

  @OneToMany(() => ChatMessageEntity, (msg) => msg.chat)
  messages: ChatMessageEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
