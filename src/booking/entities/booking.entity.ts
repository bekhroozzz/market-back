import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OfferEntity } from '../../offer/entities/offer.entity';
import { User } from '../../user/entities/user.entity';

export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export enum PaymentMethod {
  CASH = 'cash',
  CARD = 'card',
}

export enum CancelledBy {
  CUSTOMER = 'customer',
  SELLER = 'seller',
}

@Entity('bookings')
@Index('idx_bookings_seller_id', ['sellerId'])
@Index('idx_bookings_customer_id', ['customerId'])
@Index('idx_bookings_offer_id', ['offerId'])
@Index('idx_bookings_status', ['status'])
@Index('idx_bookings_seller_status', ['sellerId', 'status'])
@Index('idx_bookings_customer_status', ['customerId', 'status'])
export class BookingEntity {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'offer_id', type: 'uuid' })
  offerId: string;

  @ApiProperty()
  @Column({ name: 'seller_id', type: 'int' })
  sellerId: number;

  @ApiProperty()
  @Column({ name: 'customer_id', type: 'int' })
  customerId: number;

  /** Booking date in YYYY-MM-DD format */
  @ApiProperty({ example: '2024-07-15' })
  @Column({ type: 'varchar', length: 12 })
  date: string;

  /** Booking time in HH:mm format */
  @ApiProperty({ example: '14:00' })
  @Column({ type: 'varchar', length: 6 })
  time: string;

  @ApiProperty({ example: 2 })
  @Column({ type: 'int' })
  personsCount: number;

  @ApiProperty({ example: '+79991234567' })
  @Column({ type: 'varchar', length: 30 })
  phone: string;

  @ApiPropertyOptional({ example: 'Аллергия на орехи' })
  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @ApiProperty({ enum: PaymentMethod })
  @Column({ type: 'enum', enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @ApiProperty({ enum: BookingStatus })
  @Column({ type: 'enum', enum: BookingStatus, default: BookingStatus.PENDING })
  status: BookingStatus;

  /** Secret code shown only to customer after confirmation */
  @ApiPropertyOptional()
  @Column({ name: 'secret_code', type: 'varchar', length: 10, nullable: true })
  secretCode: string | null;

  @ApiPropertyOptional()
  @Column({ name: 'confirmed_at', type: 'timestamp', nullable: true })
  confirmedAt: Date | null;

  @ApiPropertyOptional()
  @Column({ name: 'activated_at', type: 'timestamp', nullable: true })
  activatedAt: Date | null;

  @ApiPropertyOptional()
  @Column({ name: 'cancelled_at', type: 'timestamp', nullable: true })
  cancelledAt: Date | null;

  @ApiPropertyOptional({ enum: CancelledBy })
  @Column({ name: 'cancelled_by', type: 'enum', enum: CancelledBy, nullable: true })
  cancelledBy: CancelledBy | null;

  @ApiPropertyOptional()
  @Column({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason: string | null;

  @ManyToOne(() => OfferEntity, { nullable: false })
  @JoinColumn({ name: 'offer_id' })
  offer: OfferEntity;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'customer_id' })
  customer: User;

  @ApiProperty()
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn()
  updatedAt: Date;
}
