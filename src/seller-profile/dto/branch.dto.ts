import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class BranchDto {
  @ApiProperty({ example: 'f3d87fc5-9dcf-489f-aaf7-1ddf9c1e28b1' })
  @IsUUID('4')
  @IsNotEmpty()
  id: string;

  @ApiProperty({ example: 'Главный офис' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'г. Москва, ул. Ленина, 1' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiPropertyOptional({ example: 55.7558 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: 37.6173 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180)
  @Max(180)
  longitude?: number;
}
