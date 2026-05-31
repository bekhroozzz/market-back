import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PaymentMethod } from '../entities/booking.entity';

export class CreateBookingDto {
  @ApiProperty({ example: 'f3d87fc5-9dcf-489f-aaf7-1ddf9c1e28b1' })
  @IsUUID('4')
  offerId: string;

  @ApiProperty({ example: '2024-07-15', description: 'Дата бронирования (YYYY-MM-DD)' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Дата должна быть в формате YYYY-MM-DD' })
  date: string;

  @ApiProperty({ example: '14:00', description: 'Время бронирования (HH:mm)' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Время должно быть в формате HH:mm' })
  time: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  @Max(100)
  personsCount: number;

  @ApiProperty({ example: '+79991234567' })
  @IsNotEmpty()
  @IsString()
  phone: string;

  @ApiPropertyOptional({ example: 'Стол у окна, без орехов' })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;
}
