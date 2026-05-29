import { Injectable, NotFoundException } from '@nestjs/common';
import { ReviewEntity } from './entities/review.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateReviewDto } from './dto/create-review.dto';
import { OfferService } from '../offer/offer.service';

@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(ReviewEntity)
    private readonly reviewRepository: Repository<ReviewEntity>,
    private readonly offerService: OfferService,
  ) {}

  async create(dto: CreateReviewDto): Promise<ReviewEntity> {
    const offer = await this.offerService.findById(dto.offerId);

    const review = this.reviewRepository.create({
      text: dto.text,
      rating: dto.rating,
      offer,
    });

    const saved = await this.reviewRepository.save(review);

    // Recalculate average rating and review count for the offer
    await this.recalculateOfferRating(dto.offerId);

    return saved;
  }

  async getOfferReviews(offerId: string): Promise<ReviewEntity[]> {
    // Validate offer exists
    await this.offerService.findById(offerId);

    return this.reviewRepository.find({
      where: { offerId },
      order: { createdAt: 'DESC' },
    });
  }

  async deleteReview(reviewId: string): Promise<void> {
    const review = await this.reviewRepository.findOne({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Отзыв не найден');

    const offerId = review.offerId;
    await this.reviewRepository.remove(review);
    await this.recalculateOfferRating(offerId);
  }

  private async recalculateOfferRating(offerId: string): Promise<void> {
    const result = await this.reviewRepository
      .createQueryBuilder('review')
      .select('AVG(review.rating)', 'avg')
      .addSelect('COUNT(review.id)', 'count')
      .where('review.offerId = :offerId', { offerId })
      .getRawOne<{ avg: string | null; count: string }>();

    const avgRating = result?.avg ? Math.round(parseFloat(result.avg) * 100) / 100 : 0;
    const count = parseInt(result?.count ?? '0', 10);

    await this.offerService.updateRatingStats(offerId, avgRating, count);
  }
}
