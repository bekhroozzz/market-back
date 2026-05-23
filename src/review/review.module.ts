import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReviewService } from './review.service';
import { ReviewController } from './review.controller';
import { ReviewEntity } from './entities/review.entity';
import { OfferModule } from '../offer/offer.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReviewEntity]),
    // OfferModule exports OfferService (with all its dependencies including
    // OfferIndexerService from SearchModule). Importing the module — not
    // declaring the service manually — is the correct NestJS pattern.
    OfferModule,
  ],
  controllers: [ReviewController],
  providers: [ReviewService],
})
export class ReviewModule {}
