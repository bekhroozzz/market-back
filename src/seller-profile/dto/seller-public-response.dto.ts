import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Branch, GalleryImage } from '../entities/seller-profile.entity';
import { OfferEntity } from '../../offer/entities/offer.entity';

export class SellerPublicResponseDto {
  @ApiProperty({ example: 1 })
  sellerId: number;

  @ApiPropertyOptional({ example: 'ООО «ТехноМир»' })
  companyName: string | null;

  @ApiPropertyOptional({ example: 'Мы продаём лучшую технику с 2010 года.' })
  aboutCompany: string | null;

  @ApiPropertyOptional({ type: [String] })
  phones: string[];

  @ApiPropertyOptional()
  branches: Branch[];

  @ApiPropertyOptional()
  gallery: GalleryImage[];

  @ApiPropertyOptional({ type: [OfferEntity] })
  offers: OfferEntity[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  pages: number;
}
