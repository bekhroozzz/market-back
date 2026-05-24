import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { AttributeEntry } from '../entities/offer.entity';

export class AttributeEntryDto implements AttributeEntry {
  @IsString()
  key: string;

  @IsString()
  value: string;
}

export class CreateOfferDto {
  @ApiProperty({
    example: 'iPhone 14 Pro',
    description: 'Название предложения',
  })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiPropertyOptional({
    example: 'iphone-14-pro',
    description: 'URL-slug (генерируется автоматически если не указан)',
  })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiProperty({
    example: 'Состояние нового, полный комплект. Пользовались 2 дня.',
    description: 'Описание предложения',
  })
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiPropertyOptional({
    example: [
      'https://example.com/image1.jpg',
      'https://example.com/image2.jpg',
    ],
    description: 'Массив URL-адресов изображений',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional({
    example: 89900,
    description: 'Цена продажи',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @ApiPropertyOptional({
    example: 99900,
    description: 'Цена до скидки',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  oldPrice?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Товар в наличии',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  inStock?: boolean;

  @ApiPropertyOptional({
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
    description: 'UUID бренда',
  })
  @IsOptional()
  @IsUUID('4')
  brandId?: string;

  @ApiPropertyOptional({
    example: [{ key: 'color', value: 'Space Gray' }],
    description: 'Атрибуты товара (цвет, размер, материал и т.д.)',
    type: [AttributeEntryDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeEntryDto)
  attributes?: AttributeEntryDto[];

  @ApiPropertyOptional({
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
    description: 'ID категории в формате UUID v4',
    format: 'uuid',
  })
  @IsUUID('4')
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({
    example: 'г. Москва, ул. Ленина, 1',
    description: 'Адрес филиала/точки',
  })
  @IsOptional()
  @IsString()
  branchAddress?: string;

  @ApiPropertyOptional({
    example: 'a1b2c3d4-e5f6-7890-1234-56789abcdef0',
    description: 'ID автора/создателя оффера',
    format: 'uuid',
  })
  @IsUUID('4')
  @IsOptional()
  authorId?: string;
}
