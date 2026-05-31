import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelBookingDto {
  @ApiPropertyOptional({ example: 'Планы изменились' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
