import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { OfferModule } from './offer/offer.module';
import { CategoryModule } from './category/category.module';
import { ReviewModule } from './review/review.module';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { BookingModule } from './booking/booking.module';
import { SearchModule } from './search/search.module';
import { dataSourceOptions } from '../db/data-source';
import { AccessTokenGuard } from './auth/guards/access-token.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot(dataSourceOptions),
    OfferModule,
    CategoryModule,
    ReviewModule,
    UserModule,
    AuthModule,
    BookingModule,
    // SearchModule is also imported by OfferModule, but NestJS deduplicates modules.
    // Registering here makes SearchController available at /api/search/*
    SearchModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AccessTokenGuard,
    },
  ],
})
export class AppModule {}
