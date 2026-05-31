import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { OfferEntity } from '../../offer/entities/offer.entity';
import { User } from '../../user/entities/user.entity';

export enum BookingStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum PaymentType {
  CASH = 'cash',
  ONLINE = 'online',
}

@Entity('bookings')
export class BookingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  fullName: string;

  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'timestamp' })
  bookingDate: Date;

  @Column({ type: 'enum', enum: PaymentType })
  paymentType: PaymentType;

  @Column({ default: false })
  isPaid: boolean;

  @Column({ type: 'enum', enum: BookingStatus, default: BookingStatus.ACTIVE })
  status: BookingStatus;

  @Column({ type: 'varchar', length: 10 })
  verificationCode: string;

  @ManyToOne(() => OfferEntity, { nullable: false })
  @JoinColumn({ name: 'offer_id' })
  offer: OfferEntity;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
