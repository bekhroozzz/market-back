import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class ActivateBookingDto {
  @ApiProperty({ example: '483291', description: 'Секретный код клиента (6 цифр)' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'Код должен содержать ровно 6 символов' })
  code: string;
}
