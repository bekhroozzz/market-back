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

/** Single attribute entry stored in the JSONB array */
export interface AttributeEntry {
  key: string;
  value: string;
}

@Entity({ name: 'offers' })
export class OfferEntity {
  @ApiProperty({ example: 'f3d87fc5-9dcf-489f-aaf7-1ddf9c1e28b1' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'iPhone 14 Pro' })
  @Column({ nullable: false, type: 'varchar', length: 120 })
  title: string;

  /**
   * URL-friendly slug. Generated from title on creation if not provided.
   * Unique across the offers table.
   */
  @ApiPropertyOptional({ example: 'iphone-14-pro' })
  @Column({ type: 'varchar', length: 160, nullable: true, unique: false })
  slug?: string;

  @ApiProperty({ example: 'Новый, оригинал, в упаковке.' })
  @Column({ type: 'text' })
  description: string;

  @ApiPropertyOptional({
    example: ['https://example.com/img1.jpg'],
    type: [String],
  })
  @Column('text', { array: true, nullable: true })
  images?: string[];

  /** Selling price in local currency */
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

  /** Original price before discount */
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

  /** Whether the item is currently available */
  @ApiProperty({ example: true, default: true })
  @Column({ type: 'boolean', default: true })
  inStock: boolean;

  /**
   * Reference to the brand entity UUID.
   * Denormalized here for fast filtering without joins.
   */
  @ApiPropertyOptional({ example: 'd290f1ee-6c54-4b01-90e6-d701748f0851' })
  @Column({ type: 'uuid', nullable: true })
  brandId?: string;

  /**
   * Flexible key-value attributes (color, size, material, etc.).
   * Stored as JSONB for schema flexibility.
   *
   * Example: [{ key: "color", value: "Space Gray" }, { key: "storage", value: "256GB" }]
   */
  @ApiPropertyOptional({
    example: [{ key: 'color', value: 'Space Gray' }],
    type: 'array',
  })
  @Column({ type: 'jsonb', nullable: true, default: [] })
  attributes: AttributeEntry[];

  /** Weighted average of review ratings (0–5). Updated by ReviewService. */
  @ApiProperty({ example: 4.8, default: 0 })
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

  /** Total number of completed sales. Used for popularity ranking. */
  @ApiProperty({ example: 142, default: 0 })
  @Column({ type: 'int', default: 0 })
  salesCount: number;

  @ApiPropertyOptional({ type: () => [ReviewEntity] })
  @OneToMany(() => ReviewEntity, (review) => review.offer)
  reviews: ReviewEntity[];

  @ApiPropertyOptional({
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
    description: 'ID категории',
  })
  @Column({ type: 'uuid', nullable: true })
  category_id: string;

  @ApiPropertyOptional({ type: () => CategoryEntity })
  @ManyToOne(() => CategoryEntity, (category) => category.offers, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'category_id' })
  category: CategoryEntity;

  @ApiPropertyOptional({
    type: () => User,
    description: 'Автор/создатель оффера',
  })
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'author_id' })
  author: User;

  @ApiPropertyOptional({
    example: 'г. Москва, ул. Ленина, 1',
    description: 'Адрес филиала/точки',
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
