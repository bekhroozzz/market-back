import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OpenChatDto {
  @ApiProperty({ example: 'f3d87fc5-9dcf-489f-aaf7-1ddf9c1e28b1' })
  @IsUUID()
  offerId: string;
}
