import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OfferService } from './offer.service';
import { OfferController } from './offer.controller';
import { OfferEntity } from './entities/offer.entity';
import { SearchModule } from '../search/search.module';
import { SellerProfileModule } from '../seller-profile/seller-profile.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OfferEntity]),
    SearchModule,
    SellerProfileModule,
  ],
  controllers: [OfferController],
  providers: [OfferService],
  exports: [OfferService],
})
export class OfferModule {}
