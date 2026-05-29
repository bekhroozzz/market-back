import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ReviewEntity } from '../../review/entities/review.entity';
import { CategoryEntity } from '../../category/entities/category.entity';
import { User } from '../../user/entities/user.entity';

export interface AttributeEntry {
  key: string;
  value: string;
}

export interface WorkScheduleDay {
  /** 0 = Monday, 6 = Sunday */
  day: number;
  openTime: string | null;
  closeTime: string | null;
  isClosed: boolean;
}

export interface PriceTariff {
  price: number;
  priceType: string;
}

@Entity({ name: 'offers' })
export class OfferEntity {
  @ApiProperty({ example: 'f3d87fc5-9dcf-489f-aaf7-1ddf9c1e28b1' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'Brooklyn Bowling' })
  @Column({ nullable: false, type: 'varchar', length: 120 })
  title: string;

  @ApiPropertyOptional({ example: 'brooklyn-bowling' })
  @Column({ type: 'varchar', length: 160, nullable: true, unique: false })
  slug?: string;

  @ApiProperty({ example: 'Лучший боулинг в городе.' })
  @Column({ type: 'text' })
  description: string;

  @ApiPropertyOptional({ type: [String] })
  @Column('text', { array: true, nullable: true, default: [] })
  images?: string[];

  @ApiPropertyOptional({ example: 89900 })
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: {
      from: (v: string | null) =>
        v !== null && v !== undefined ? parseFloat(v) : null,
      to: (v: number | null | undefined) => v,
    },
  })
  price?: number;

  @ApiPropertyOptional({ example: 99900 })
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: {
      from: (v: string | null) =>
        v !== null && v !== undefined ? parseFloat(v) : null,
      to: (v: number | null | undefined) => v,
    },
  })
  oldPrice?: number;

  /**
   * Structured price tariffs (e.g. per hour, per entry).
   * Stored as JSONB for flexible UI rendering.
   */
  @ApiPropertyOptional({
    example: [{ price: 300, priceType: 'by_hour' }],
    type: 'array',
  })
  @Column({ type: 'jsonb', nullable: true, default: [] })
  prices: PriceTariff[];

  @ApiProperty({ example: true, default: true })
  @Column({ type: 'boolean', default: true })
  inStock: boolean;

  @ApiPropertyOptional({ example: 'd290f1ee-6c54-4b01-90e6-d701748f0851' })
  @Column({ type: 'uuid', nullable: true })
  brandId?: string;

  @ApiPropertyOptional({
    example: [{ key: 'color', value: 'Space Gray' }],
    type: 'array',
  })
  @Column({ type: 'jsonb', nullable: true, default: [] })
  attributes: AttributeEntry[];

  /**
   * Work schedule for the venue.
   * day: 0=Monday … 6=Sunday
   */
  @ApiPropertyOptional({
    example: [{ day: 0, openTime: '09:00', closeTime: '22:00', isClosed: false }],
    type: 'array',
  })
  @Column({ type: 'jsonb', nullable: true, default: [] })
  workSchedule: WorkScheduleDay[];

  /**
   * Key features / amenities of the venue (Wi-Fi, Parking, Terrace, etc.)
   */
  @ApiPropertyOptional({ example: ['Wi-Fi', 'Парковка', 'Терраса'], type: [String] })
  @Column('text', { array: true, nullable: true, default: [] })
  features: string[];

  /**
   * Rules, notes, and restrictions for visitors.
   */
  @ApiPropertyOptional({
    example: ['Дресс-код обязателен', 'Детям до 18 лет вход запрещён'],
    type: [String],
  })
  @Column('text', { array: true, nullable: true, default: [] })
  rules: string[];

  /** Average star rating (1–5). Recalculated after each review. */
  @ApiProperty({ example: 4.5, default: 0 })
  @Column({
    type: 'decimal',
    precision: 3,
    scale: 2,
    default: 0,
    transformer: {
      from: (v: string) => parseFloat(v),
      to: (v: number) => v,
    },
  })
  rating: number;

  /** Total number of reviews. Incremented/decremented by ReviewService. */
  @ApiProperty({ example: 12, default: 0 })
  @Column({ type: 'int', default: 0 })
  reviewCount: number;

  @ApiProperty({ example: 142, default: 0 })
  @Column({ type: 'int', default: 0 })
  salesCount: number;

  @ApiPropertyOptional({ type: () => [ReviewEntity] })
  @OneToMany(() => ReviewEntity, (review) => review.offer)
  reviews: ReviewEntity[];

  @ApiPropertyOptional({ example: 'd290f1ee-6c54-4b01-90e6-d701748f0851' })
  @Column({ type: 'uuid', nullable: true })
  category_id: string;

  @ApiPropertyOptional({ type: () => CategoryEntity })
  @ManyToOne(() => CategoryEntity, (category) => category.offers, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'category_id' })
  category: CategoryEntity;

  @ApiPropertyOptional({ type: () => User })
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'author_id' })
  author: User;

  @ApiPropertyOptional({
    example: 'г. Москва, ул. Ленина, 1',
    description: 'Адрес филиала (снапшот из профиля продавца)',
  })
  @Column({ type: 'varchar', length: 255, nullable: true })
  branchAddress?: string;

  @ApiProperty({ example: '2025-06-13T15:30:00.000Z' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ example: '2025-06-13T15:30:00.000Z' })
  @UpdateDateColumn()
  updatedAt: Date;
}
