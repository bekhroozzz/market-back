import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export enum SortOption {
  RELEVANCE = 'relevance',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  NEWEST = 'newest',
  POPULARITY = 'popularity',
}

export class SearchProductsDto {
  @ApiPropertyOptional({
    example: 'iphone 15 pro',
    description: 'Поисковый запрос. Если не указан – возвращает все товары.',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    enum: SortOption,
    default: SortOption.RELEVANCE,
    description: 'Сортировка результатов',
  })
  @IsOptional()
  @IsEnum(SortOption)
  sort?: SortOption = SortOption.RELEVANCE;

  @ApiPropertyOptional({
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
    description: 'Фильтр по категории (UUID). Включает дочерние категории.',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
    description: 'Фильтр по бренду (UUID)',
  })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ example: 1000, description: 'Минимальная цена' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ example: 100000, description: 'Максимальная цена' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Показывать только товары в наличии',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  inStock?: boolean;

  /**
   * Attribute filters as a plain object.
   * Query string format: attributes[color]=red&attributes[size]=XL
   * Multiple values for one key: attributes[color]=red&attributes[color]=blue
   *
   * Example parsed value: { color: 'red', size: ['XL', 'XXL'] }
   */
  @ApiPropertyOptional({
    example: { color: 'red', size: 'XL' },
    description: 'Фильтры по атрибутам товара. Формат: attributes[key]=value',
  })
  @IsOptional()
  @IsObject()
  attributes?: Record<string, string | string[]>;
}
