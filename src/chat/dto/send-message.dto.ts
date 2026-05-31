import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ example: 'Привет, есть ли свободное время в пятницу?' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;
}
