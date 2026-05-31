import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingService } from './booking.service';
import { BookingController } from './booking.controller';
import { BookingEntity } from './entities/booking.entity';
import { OfferEntity } from '../offer/entities/offer.entity';
import { User } from '../user/entities/user.entity';
import { NotificationModule } from '../notification/notification.module';
import { ChatModule } from '../chat/chat.module';

export * from './entities/booking.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BookingEntity, OfferEntity, User]),
    NotificationModule,
    ChatModule,
  ],
  controllers: [BookingController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
