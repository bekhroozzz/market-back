import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsPhoneNumber,
  IsDateString,
  IsEnum,
  IsUUID,
} from 'class-validator';
import { PaymentType } from '../entities/booking.entity';

export class CreateBookingDto {
  @ApiProperty({ example: 'Иванов Иван Иванович' })
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @ApiProperty({ example: '+79991234567' })
  @IsNotEmpty()
  @IsPhoneNumber('RU')
  phone: string;

  @ApiProperty({ example: '2024-07-15T14:00:00.000Z' })
  @IsNotEmpty()
  @IsDateString()
  bookingDate: string;

  @ApiProperty({ example: 'cash', enum: PaymentType })
  @IsEnum(PaymentType)
  paymentType: PaymentType;

  @ApiProperty({ example: 'offer-uuid', description: 'ID оффера' })
  @IsUUID('4')
  offerId: string;
}
