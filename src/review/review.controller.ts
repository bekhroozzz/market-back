import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ReviewService } from './review.service';
import { ReviewEntity } from './entities/review.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';
import { RolesGuard } from '../auth/guards/roles.guard';

@ApiTags('Отзывы')
@Controller('review')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Public()
  @Get('get-offer-reviews/:id')
  @ApiOperation({ summary: 'Получить отзывы оффера' })
  @ApiParam({ name: 'id', description: 'ID оффера' })
  @ApiResponse({ status: 200, type: ReviewEntity, isArray: true })
  async getOfferReviews(@Param('id') id: string): Promise<ReviewEntity[]> {
    return this.reviewService.getOfferReviews(id);
  }

  @Post('create')
  @Public()
  @ApiOperation({ summary: 'Создать отзыв (1–5 звёзд)' })
  @ApiBody({ type: CreateReviewDto })
  @ApiResponse({ status: 201, type: ReviewEntity })
  async create(@Body() review: CreateReviewDto): Promise<ReviewEntity> {
    return this.reviewService.create(review);
  }

  @Delete('delete/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Удалить отзыв (только Admin)' })
  @ApiParam({ name: 'id', description: 'ID отзыва' })
  @ApiResponse({ status: 200 })
  async deleteReview(@Param('id') id: string): Promise<void> {
    return this.reviewService.deleteReview(id);
  }
}
