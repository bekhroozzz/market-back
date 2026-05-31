import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BookingEntity,
  BookingStatus,
  CancelledBy,
} from './entities/booking.entity';
import { OfferEntity, WorkScheduleDay } from '../offer/entities/offer.entity';
import { User } from '../user/entities/user.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { ActivateBookingDto } from './dto/activate-booking.dto';
import { Role } from '../user/enums/role.enum';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/entities/notification.entity';
import { ChatGateway } from '../chat/chat.gateway';

function generateSecretCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** Convert JS day (0=Sun…6=Sat) to offer schedule day (0=Mon…6=Sun) */
function toOfferDay(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

function parseMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function validateWorkSchedule(
  workSchedule: WorkScheduleDay[],
  date: string,
  time: string,
): void {
  if (!workSchedule?.length) return;

  const jsDay = new Date(date + 'T00:00:00').getDay();
  const offerDay = toOfferDay(jsDay);

  const daySchedule = workSchedule.find((s) => s.day === offerDay);
  if (!daySchedule || daySchedule.isClosed) {
    throw new BadRequestException('Выбранный день недоступен для бронирования');
  }

  if (!daySchedule.openTime || !daySchedule.closeTime) {
    throw new BadRequestException('График работы для этого дня не задан');
  }

  const bookingMinutes = parseMinutes(time);
  const openMinutes = parseMinutes(daySchedule.openTime);
  const closeMinutes = parseMinutes(daySchedule.closeTime);

  if (bookingMinutes < openMinutes || bookingMinutes >= closeMinutes) {
    throw new BadRequestException(
      `Бронирование доступно с ${daySchedule.openTime} до ${daySchedule.closeTime}`,
    );
  }
}

@Injectable()
export class BookingService {
  constructor(
    @InjectRepository(BookingEntity)
    private readonly bookingRepo: Repository<BookingEntity>,
    @InjectRepository(OfferEntity)
    private readonly offerRepo: Repository<OfferEntity>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notificationService: NotificationService,
    private readonly chatGateway: ChatGateway,
  ) {}

  private async sendNotification(
    userId: number,
    type: NotificationType,
    title: string,
    body: string,
    entityId: string,
  ): Promise<void> {
    const notification = await this.notificationService.create({
      userId,
      type,
      title,
      body,
      entityId,
    });
    this.chatGateway.emitNotification(notification, userId);
  }

  // ─── Customer endpoints ──────────────────────────────────────────────────

  async createBooking(
    dto: CreateBookingDto,
    customerId: number,
  ): Promise<BookingEntity> {
    const offer = await this.offerRepo.findOne({
      where: { id: dto.offerId },
      relations: ['author'],
    });
    if (!offer) throw new NotFoundException('Оффер не найден');
    if (!offer.inStock)
      throw new BadRequestException('Оффер недоступен для бронирования');
    if (offer.author.id === customerId)
      throw new ForbiddenException('Нельзя бронировать собственный оффер');

    validateWorkSchedule(offer.workSchedule ?? [], dto.date, dto.time);

    const customer = await this.userRepo.findOne({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Пользователь не найден');

    const autoConfirm = offer.autoConfirmBooking;
    const initialStatus = autoConfirm
      ? BookingStatus.CONFIRMED
      : BookingStatus.PENDING;
    const secretCode = autoConfirm ? generateSecretCode() : null;
    const confirmedAt = autoConfirm ? new Date() : null;

    const booking = this.bookingRepo.create({
      offerId: offer.id,
      sellerId: offer.author.id,
      customerId,
      date: dto.date,
      time: dto.time,
      personsCount: dto.personsCount,
      phone: dto.phone,
      comment: dto.comment ?? null,
      paymentMethod: dto.paymentMethod,
      status: initialStatus,
      secretCode,
      confirmedAt,
      offer,
      customer,
    });

    const saved = await this.bookingRepo.save(booking);

    // Notify seller about new booking
    await this.sendNotification(
      offer.author.id,
      NotificationType.BOOKING_NEW,
      'Новая бронь',
      `Новое бронирование на ${dto.date} ${dto.time} (${dto.personsCount} чел.)`,
      saved.id,
    );

    if (autoConfirm) {
      await this.sendNotification(
        customerId,
        NotificationType.BOOKING_CONFIRMED,
        'Бронь подтверждена',
        `Ваша бронь на ${dto.date} ${dto.time} автоматически подтверждена`,
        saved.id,
      );
    }

    return saved;
  }

  async getMyBookings(
    customerId: number,
    filter?: 'active' | 'history',
  ): Promise<BookingEntity[]> {
    const activeStatuses = [
      BookingStatus.PENDING,
      BookingStatus.CONFIRMED,
      BookingStatus.ACTIVE,
    ];
    const historyStatuses = [
      BookingStatus.COMPLETED,
      BookingStatus.CANCELLED,
      BookingStatus.EXPIRED,
    ];

    const statuses =
      filter === 'active'
        ? activeStatuses
        : filter === 'history'
          ? historyStatuses
          : [...activeStatuses, ...historyStatuses];

    return this.bookingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.offer', 'offer')
      .where('b.customerId = :customerId', { customerId })
      .andWhere('b.status IN (:...statuses)', { statuses })
      .orderBy('b.createdAt', 'DESC')
      .getMany();
  }

  async getBookingById(
    id: string,
    requesterId: number,
    role: Role,
  ): Promise<BookingEntity> {
    const booking = await this.bookingRepo.findOne({
      where: { id },
      relations: ['offer', 'customer'],
    });
    if (!booking) throw new NotFoundException('Бронь не найдена');

    const isOwner =
      booking.customerId === requesterId ||
      booking.sellerId === requesterId ||
      role === Role.Admin;

    if (!isOwner) throw new ForbiddenException('Нет доступа к этой брони');

    // Mask secret code for seller view
    if (
      role === Role.Seller &&
      booking.sellerId === requesterId &&
      booking.customerId !== requesterId
    ) {
      booking.secretCode = booking.secretCode
        ? '******' + booking.secretCode.slice(-2)
        : null;
    }

    return booking;
  }

  async cancelByCustomer(
    id: string,
    customerId: number,
    dto: CancelBookingDto,
  ): Promise<BookingEntity> {
    const booking = await this.bookingRepo.findOne({
      where: { id },
      relations: ['offer'],
    });
    if (!booking) throw new NotFoundException('Бронь не найдена');
    if (booking.customerId !== customerId)
      throw new ForbiddenException('Нет доступа');

    const cancellable = [BookingStatus.PENDING, BookingStatus.CONFIRMED];
    if (!cancellable.includes(booking.status)) {
      throw new BadRequestException(
        'Нельзя отменить бронь в текущем статусе',
      );
    }

    booking.status = BookingStatus.CANCELLED;
    booking.cancelledAt = new Date();
    booking.cancelledBy = CancelledBy.CUSTOMER;
    booking.cancelReason = dto.reason ?? null;

    const saved = await this.bookingRepo.save(booking);

    await this.sendNotification(
      booking.sellerId,
      NotificationType.BOOKING_CANCELLED,
      'Бронь отменена клиентом',
      `Клиент отменил бронь на ${booking.date} ${booking.time}`,
      saved.id,
    );

    return saved;
  }

  // ─── Seller endpoints ────────────────────────────────────────────────────

  async getSellerBookings(
    sellerId: number,
    status?: BookingStatus,
  ): Promise<BookingEntity[]> {
    const qb = this.bookingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.offer', 'offer')
      .leftJoinAndSelect('b.customer', 'customer')
      .where('b.sellerId = :sellerId', { sellerId })
      .orderBy('b.createdAt', 'DESC');

    if (status) {
      qb.andWhere('b.status = :status', { status });
    }

    const bookings = await qb.getMany();

    return bookings.map((b) => {
      b.secretCode = b.secretCode ? '******' + b.secretCode.slice(-2) : null;
      return b;
    });
  }

  async getSellerBookingById(
    id: string,
    sellerId: number,
  ): Promise<BookingEntity> {
    const booking = await this.bookingRepo.findOne({
      where: { id },
      relations: ['offer', 'customer'],
    });
    if (!booking) throw new NotFoundException('Бронь не найдена');
    if (booking.sellerId !== sellerId)
      throw new ForbiddenException('Нет доступа к этой брони');

    booking.secretCode = booking.secretCode
      ? '******' + booking.secretCode.slice(-2)
      : null;

    return booking;
  }

  async confirmBooking(id: string, sellerId: number): Promise<BookingEntity> {
    const booking = await this.bookingRepo.findOne({ where: { id } });
    if (!booking) throw new NotFoundException('Бронь не найдена');
    if (booking.sellerId !== sellerId)
      throw new ForbiddenException('Нет доступа');
    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException(
        'Подтвердить можно только бронь со статусом PENDING',
      );
    }

    booking.status = BookingStatus.CONFIRMED;
    booking.secretCode = generateSecretCode();
    booking.confirmedAt = new Date();

    const saved = await this.bookingRepo.save(booking);

    await this.sendNotification(
      booking.customerId,
      NotificationType.BOOKING_CONFIRMED,
      'Бронь подтверждена',
      `Ваша бронь на ${booking.date} ${booking.time} подтверждена. Ваш код: ${booking.secretCode}`,
      saved.id,
    );

    return saved;
  }

  async rejectBooking(id: string, sellerId: number): Promise<BookingEntity> {
    const booking = await this.bookingRepo.findOne({ where: { id } });
    if (!booking) throw new NotFoundException('Бронь не найдена');
    if (booking.sellerId !== sellerId)
      throw new ForbiddenException('Нет доступа');
    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException(
        'Отклонить можно только бронь со статусом PENDING',
      );
    }

    booking.status = BookingStatus.CANCELLED;
    booking.cancelledAt = new Date();
    booking.cancelledBy = CancelledBy.SELLER;

    const saved = await this.bookingRepo.save(booking);

    await this.sendNotification(
      booking.customerId,
      NotificationType.BOOKING_REJECTED,
      'Бронь отклонена',
      `Ваша бронь на ${booking.date} ${booking.time} была отклонена продавцом`,
      saved.id,
    );

    return saved;
  }

  async activateBooking(
    id: string,
    sellerId: number,
    dto: ActivateBookingDto,
  ): Promise<BookingEntity> {
    const booking = await this.bookingRepo.findOne({ where: { id } });
    if (!booking) throw new NotFoundException('Бронь не найдена');
    if (booking.sellerId !== sellerId)
      throw new ForbiddenException('Нет доступа');
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException(
        'Активировать можно только подтверждённую бронь',
      );
    }
    if (booking.secretCode !== dto.code) {
      throw new BadRequestException('Неверный секретный код');
    }

    booking.status = BookingStatus.ACTIVE;
    booking.activatedAt = new Date();

    const saved = await this.bookingRepo.save(booking);

    await this.sendNotification(
      booking.customerId,
      NotificationType.BOOKING_ACTIVATED,
      'Бронь активирована',
      `Ваша бронь на ${booking.date} ${booking.time} активирована — приятного времяпровождения!`,
      saved.id,
    );

    return saved;
  }

  async completeBooking(id: string, sellerId: number): Promise<BookingEntity> {
    const booking = await this.bookingRepo.findOne({ where: { id } });
    if (!booking) throw new NotFoundException('Бронь не найдена');
    if (booking.sellerId !== sellerId)
      throw new ForbiddenException('Нет доступа');
    if (booking.status !== BookingStatus.ACTIVE) {
      throw new BadRequestException(
        'Завершить можно только активную бронь',
      );
    }

    booking.status = BookingStatus.COMPLETED;
    const saved = await this.bookingRepo.save(booking);

    await this.sendNotification(
      booking.customerId,
      NotificationType.BOOKING_COMPLETED,
      'Бронь завершена',
      `Ваша бронь на ${booking.date} ${booking.time} завершена. Спасибо за визит!`,
      saved.id,
    );

    return saved;
  }

  async cancelBySeller(
    id: string,
    sellerId: number,
    dto: CancelBookingDto,
  ): Promise<BookingEntity> {
    const booking = await this.bookingRepo.findOne({ where: { id } });
    if (!booking) throw new NotFoundException('Бронь не найдена');
    if (booking.sellerId !== sellerId)
      throw new ForbiddenException('Нет доступа');

    const cancellable = [BookingStatus.PENDING, BookingStatus.CONFIRMED];
    if (!cancellable.includes(booking.status)) {
      throw new BadRequestException(
        'Нельзя отменить бронь в текущем статусе',
      );
    }

    booking.status = BookingStatus.CANCELLED;
    booking.cancelledAt = new Date();
    booking.cancelledBy = CancelledBy.SELLER;
    booking.cancelReason = dto.reason ?? null;

    const saved = await this.bookingRepo.save(booking);

    await this.sendNotification(
      booking.customerId,
      NotificationType.BOOKING_CANCELLED,
      'Бронь отменена',
      `Ваша бронь на ${booking.date} ${booking.time} была отменена продавцом`,
      saved.id,
    );

    return saved;
  }
}
