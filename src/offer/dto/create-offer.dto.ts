import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { AttributeEntry, WorkScheduleDay, PriceTariff } from '../entities/offer.entity';

export class AttributeEntryDto implements AttributeEntry {
  @IsString()
  key: string;

  @IsString()
  value: string;
}

export class WorkScheduleDayDto implements WorkScheduleDay {
  @ApiProperty({ example: 0, description: '0=Пн, 1=Вт, ..., 6=Вс' })
  @IsInt()
  @Min(0)
  @Max(6)
  day: number;

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @IsString()
  openTime: string | null;

  @ApiPropertyOptional({ example: '22:00' })
  @IsOptional()
  @IsString()
  closeTime: string | null;

  @ApiProperty({ example: false })
  @IsBoolean()
  isClosed: boolean;
}

export class PriceTariffDto implements PriceTariff {
  @ApiProperty({ example: 300 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiProperty({ example: 'by_hour' })
  @IsString()
  @IsNotEmpty()
  priceType: string;
}

export class CreateOfferDto {
  @ApiProperty({ example: 'Brooklyn Bowling' })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: 'brooklyn-bowling' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiProperty({ example: 'Лучший боулинг в городе.' })
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional({ example: 89900 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ example: 99900 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  oldPrice?: number;

  @ApiPropertyOptional({
    example: [{ price: 300, priceType: 'by_hour' }],
    type: [PriceTariffDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceTariffDto)
  prices?: PriceTariffDto[];

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  inStock?: boolean;

  @ApiPropertyOptional({ example: 'd290f1ee-6c54-4b01-90e6-d701748f0851' })
  @IsOptional()
  @IsUUID('4')
  brandId?: string;

  @ApiPropertyOptional({ type: [AttributeEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeEntryDto)
  attributes?: AttributeEntryDto[];

  @ApiPropertyOptional({
    example: [{ day: 0, openTime: '09:00', closeTime: '22:00', isClosed: false }],
    type: [WorkScheduleDayDto],
    description: 'График работы (0=Пн … 6=Вс)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkScheduleDayDto)
  workSchedule?: WorkScheduleDayDto[];

  @ApiPropertyOptional({
    example: ['Wi-Fi', 'Парковка', 'Терраса'],
    type: [String],
    description: 'Ключевые особенности заведения',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({
    example: ['Дресс-код обязателен'],
    type: [String],
    description: 'Правила поведения и ограничения',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rules?: string[];

  @ApiPropertyOptional({ example: 'd290f1ee-6c54-4b01-90e6-d701748f0851' })
  @IsUUID('4')
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'г. Москва, ул. Ленина, 1' })
  @IsOptional()
  @IsString()
  branchAddress?: string;

  @ApiPropertyOptional({ description: 'ID автора (берётся из JWT, не нужно передавать явно)' })
  @IsOptional()
  @IsString()
  authorId?: string;
}
