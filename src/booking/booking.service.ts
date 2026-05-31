import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BookingEntity } from './entities/booking.entity';
import { OfferEntity } from '../offer/entities/offer.entity';
import { User } from '../user/entities/user.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingStatus } from './entities/booking.entity';
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Role } from '../user/enums/role.enum';

function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

@Injectable()
export class BookingService {
  constructor(
    @InjectRepository(BookingEntity)
    private readonly bookingRepository: Repository<BookingEntity>,
    @InjectRepository(OfferEntity)
    private readonly offerRepository: Repository<OfferEntity>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  // Создать бронь (user)
  async createBooking(
    dto: CreateBookingDto,
    userId: number,
  ): Promise<BookingEntity> {
    const offer = await this.offerRepository.findOne({
      where: { id: dto.offerId },
      relations: ['author'],
    });
    if (!offer) throw new NotFoundException('Оффер не найден');

    if (offer.author.id === userId)
      throw new ForbiddenException('Нельзя бронировать свой оффер');

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Пользователь не найден');

    const verificationCode = generateVerificationCode();
    const booking = this.bookingRepository.create({
      fullName: dto.fullName,
      phone: dto.phone,
      bookingDate: new Date(dto.bookingDate),
      paymentType: dto.paymentType,
      offer,
      user,
      verificationCode,
      isPaid: false,
      status: BookingStatus.ACTIVE,
    });
    return this.bookingRepository.save(booking);
  }

  // Получить все брони по офферу (seller, admin)
  async getBookingsByOffer(
    offerId: string,
    userId: number,
    userRole: Role,
  ): Promise<BookingEntity[]> {
    const offer = await this.offerRepository.findOne({
      where: { id: offerId },
      relations: ['author'],
    });
    if (!offer) throw new NotFoundException('Оффер не найден');
    if (userRole !== Role.Admin && offer.author.id !== userId)
      throw new ForbiddenException('Нет доступа');
    return this.bookingRepository.find({
      where: { offer: { id: offerId } },
      relations: ['user', 'offer'],
    });
  }

  // Получить свои брони (user)
  async getBookingsByUser(userId: number): Promise<BookingEntity[]> {
    return this.bookingRepository.find({
      where: { user: { id: userId } },
      relations: ['offer'],
    });
  }

  // Подтвердить бронь (seller)
  async confirmBooking(
    bookingId: string,
    sellerId: number,
  ): Promise<BookingEntity> {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
      relations: ['offer', 'offer.author'],
    });
    if (!booking) throw new NotFoundException('Бронь не найдена');

    if (booking.offer.author.id !== sellerId)
      throw new ForbiddenException('Нет доступа');

    if (booking.status !== BookingStatus.ACTIVE)
      throw new BadRequestException('Бронь не активна');
    // Можно добавить поле confirmed, но по ТЗ достаточно статуса
    return this.bookingRepository.save({
      ...booking,
      status: BookingStatus.ACTIVE,
    });
  }

  // Отменить бронь (user, admin)
  async cancelBooking(
    bookingId: string,
    userId: number,
    userRole: Role,
  ): Promise<BookingEntity> {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
      relations: ['user'],
    });
    if (!booking) throw new NotFoundException('Бронь не найдена');

    if (userRole !== Role.Admin && booking.user.id !== userId)
      throw new ForbiddenException('Нет доступа');

    if (booking.status !== BookingStatus.ACTIVE)
      throw new BadRequestException('Бронь не активна');

    booking.status = BookingStatus.CANCELLED;
    return this.bookingRepository.save(booking);
  }

  // Завершить бронь по коду (seller)
  async completeBookingByCode(
    bookingId: string,
    code: string,
    sellerId: number,
  ): Promise<BookingEntity> {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
      relations: ['offer', 'offer.author'],
    });
    if (!booking) throw new NotFoundException('Бронь не найдена');

    if (booking.offer.author.id !== sellerId)
      throw new ForbiddenException('Нет доступа');

    if (booking.status !== BookingStatus.ACTIVE)
      throw new BadRequestException('Бронь не активна');

    if (booking.verificationCode !== code)
      throw new BadRequestException('Неверный проверочный код');

    booking.status = BookingStatus.COMPLETED;
    return this.bookingRepository.save(booking);
  }
}
