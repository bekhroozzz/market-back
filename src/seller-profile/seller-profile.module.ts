import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SellerProfileController } from './seller-profile.controller';
import { SellerProfileService } from './seller-profile.service';
import { SellerProfileEntity } from './entities/seller-profile.entity';
import { OfferEntity } from '../offer/entities/offer.entity';
import { User } from '../user/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SellerProfileEntity, OfferEntity, User])],
  controllers: [SellerProfileController],
  providers: [SellerProfileService],
  exports: [SellerProfileService],
})
export class SellerProfileModule {}
