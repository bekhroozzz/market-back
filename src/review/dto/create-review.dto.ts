import { IsInt, IsString, IsUUID, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReviewDto {
  @ApiProperty({
    example: 'Отличное место, обязательно вернёмся!',
    description: 'Текст отзыва',
  })
  @IsString()
  text: string;

  @ApiProperty({
    example: 5,
    description: 'Оценка от 1 до 5 звёзд',
    minimum: 1,
    maximum: 5,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({
    example: 'd2a1a340-63e2-4d92-bf24-0d8c12bde0b4',
    description: 'ID оффера',
  })
  @IsUUID('4')
  offerId: string;
}
