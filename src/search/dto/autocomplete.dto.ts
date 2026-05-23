import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class AutocompleteDto {
  @ApiProperty({
    example: 'ipho',
    description: 'Частичный поисковый запрос (минимум 2 символа)',
  })
  @IsNotEmpty()
  @IsString()
  q: string;

  @ApiPropertyOptional({
    example: 8,
    default: 8,
    description: 'Максимальное количество suggestions',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  size?: number = 8;
}
