import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

export interface Branch {
  title: string;
  address: string;
  latitude?: number;
  longitude?: number;
}

export interface GalleryImage {
  id: string;
  url: string;
}

@Entity('seller_profiles')
export class SellerProfileEntity {
  @ApiProperty({ example: 'f3d87fc5-9dcf-489f-aaf7-1ddf9c1e28b1' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', unique: true })
  userId: number;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ApiPropertyOptional({ example: 'ООО «ТехноМир»' })
  @Column({
    name: 'company_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  companyName: string | null;

  @ApiPropertyOptional({ example: 'Мы продаём лучшую технику с 2010 года.' })
  @Column({ name: 'about_company', type: 'text', nullable: true })
  aboutCompany: string | null;

  @ApiPropertyOptional({ example: ['+7 (999) 123-45-67'], type: [String] })
  @Column('text', { array: true, default: [] })
  phones: string[];

  @ApiPropertyOptional({
    example: [{ title: 'Главный офис', address: 'г. Москва, ул. Ленина, 1' }],
  })
  @Column({ type: 'jsonb', default: [] })
  branches: Branch[];

  @ApiPropertyOptional({
    example: [{ id: 'uuid', url: 'https://example.com/photo.jpg' }],
  })
  @Column({ type: 'jsonb', default: [] })
  gallery: GalleryImage[];

  @ApiProperty({ example: '2025-06-13T15:30:00.000Z' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ example: '2025-06-13T15:30:00.000Z' })
  @UpdateDateColumn()
  updatedAt: Date;
}
