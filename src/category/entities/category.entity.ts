import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Tree,
  TreeChildren,
  TreeParent,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OfferEntity } from '../../offer/entities/offer.entity';

@Entity({ name: 'categories' })
@Tree('materialized-path')
export class CategoryEntity {
  @ApiProperty({ example: '8e7f20c1-3fbd-4c19-a3d9-d88c8c5a5e1e' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'Смартфоны' })
  @Column({ type: 'varchar', length: 100, nullable: false })
  name: string;

  /**
   * URL segment for this category, unique among siblings.
   * Full storefront path is built from ancestor slugs, e.g.
   * woman/odezhda/tolstovky-i-svitshoty
   */
  @ApiProperty({ example: 'tolstovky-i-svitshoty' })
  @Column({ type: 'varchar', length: 160 })
  slug: string;

  /**
   * Full path from root (not a DB column). Populated on tree responses:
   * woman/odezhda/tolstovky-i-svitshoty
   */
  @ApiPropertyOptional({
    example: 'woman/odezhda/tolstovky-i-svitshoty',
    description: 'Полный path для URL /catalog/{path}/',
  })
  path?: string;

  @ApiPropertyOptional()
  @Column({ nullable: true })
  description?: string;

  @TreeParent()
  parent: CategoryEntity;

  @Column({ nullable: true })
  parentId?: string;

  @TreeChildren({ cascade: true })
  children: CategoryEntity[];

  @OneToMany(() => OfferEntity, (offer) => offer.category)
  offers: OfferEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
