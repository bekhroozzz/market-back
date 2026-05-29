import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OfferEntity } from '../../offer/entities/offer.entity';
import { ApiProperty } from '@nestjs/swagger';

@Entity({ name: 'reviews' })
export class ReviewEntity {
  @ApiProperty({ example: 'b59b1df2-e14a-4c8b-b5b1-8f5eabea0f83' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'Отличное место, обязательно вернёмся!' })
  @Column({ type: 'text' })
  text: string;

  @ApiProperty({ example: 5, description: 'Оценка от 1 до 5 звёзд' })
  @Column({
    type: 'decimal',
    precision: 3,
    scale: 1,
    default: '1.0',
    transformer: {
      from: (v: string | null) =>
        v !== null && v !== undefined ? parseFloat(v) : 1,
      to: (v: number) => v,
    },
  })
  rating: number;

  @ApiProperty({ example: 'a3f6d510-9230-4c62-b5f6-8ccf962feacf' })
  @Column({ name: 'offer_id', type: 'uuid' })
  offerId: string;

  @ManyToOne(() => OfferEntity, (offer) => offer.reviews, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'offer_id' })
  offer: OfferEntity;

  @ApiProperty({ example: '2024-06-13T12:00:00Z' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ example: '2024-06-13T12:10:00Z' })
  @UpdateDateColumn()
  updatedAt: Date;
}
