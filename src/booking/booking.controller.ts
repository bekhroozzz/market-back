import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { BookingService } from './booking.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';
import { GetCurrentUserId } from '../auth/decorators/get-current-user-id.decorator';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { ActivateBookingDto } from './dto/activate-booking.dto';
import { BookingStatus } from './entities/booking.entity';

// ─────────────────────────────────────────────────────────────────────────────
// All booking routes live in ONE controller under @Controller('bookings').
// NestJS sorts routes WITHIN a single controller by path specificity:
//   static paths  > partially-parameterised > fully-parameterised
// This guarantees that GET /api/bookings/seller matches @Get('seller') and
// NOT @Get(':id'), without any cross-module ordering dependency.
// ─────────────────────────────────────────────────────────────────────────────
@ApiTags('Bookings')
@ApiBearerAuth('access-token')
@UseGuards(RolesGuard)
@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  // ── Customer: create ───────────────────────────────────────────────────────
  @Post()
  @Roles(Role.User, Role.Admin)
  @ApiOperation({ summary: 'Создать бронь (клиент)' })
  createBooking(
    @Body() dto: CreateBookingDto,
    @GetCurrentUserId() userId: number,
  ) {
    return this.bookingService.createBooking(dto, userId);
  }

  // ── Customer: my bookings (static path – sorted BEFORE :id) ───────────────
  @Get('my')
  @Roles(Role.User, Role.Admin)
  @ApiOperation({ summary: 'Мои брони (клиент)' })
  @ApiQuery({ name: 'filter', enum: ['active', 'history'], required: false })
  getMyBookings(
    @GetCurrentUserId() userId: number,
    @Query('filter') filter?: 'active' | 'history',
  ) {
    return this.bookingService.getMyBookings(userId, filter);
  }

  // ── Seller: list (static path "seller" – sorted BEFORE :id) ───────────────
  @Get('seller')
  @Roles(Role.Seller, Role.Admin)
  @ApiOperation({ summary: 'Список броней продавца' })
  @ApiQuery({ name: 'status', enum: BookingStatus, required: false })
  getSellerBookings(
    @GetCurrentUserId() sellerId: number,
    @Query('status') status?: BookingStatus,
  ) {
    return this.bookingService.getSellerBookings(sellerId, status);
  }

  // ── Seller: detail (seller/:id – partially static, before :id) ────────────
  @Get('seller/:id')
  @Roles(Role.Seller, Role.Admin)
  @ApiOperation({ summary: 'Бронь продавца по ID' })
  getSellerBookingById(
    @Param('id') id: string,
    @GetCurrentUserId() sellerId: number,
  ) {
    return this.bookingService.getSellerBookingById(id, sellerId);
  }

  @Patch('seller/:id/confirm')
  @Roles(Role.Seller, Role.Admin)
  @ApiOperation({ summary: 'Подтвердить бронь (продавец)' })
  confirmBooking(
    @Param('id') id: string,
    @GetCurrentUserId() sellerId: number,
  ) {
    return this.bookingService.confirmBooking(id, sellerId);
  }

  @Patch('seller/:id/reject')
  @Roles(Role.Seller, Role.Admin)
  @ApiOperation({ summary: 'Отклонить бронь (продавец)' })
  rejectBooking(
    @Param('id') id: string,
    @GetCurrentUserId() sellerId: number,
  ) {
    return this.bookingService.rejectBooking(id, sellerId);
  }

  @Patch('seller/:id/activate')
  @Roles(Role.Seller, Role.Admin)
  @ApiOperation({ summary: 'Активировать бронь по коду (продавец)' })
  activateBooking(
    @Param('id') id: string,
    @GetCurrentUserId() sellerId: number,
    @Body() dto: ActivateBookingDto,
  ) {
    return this.bookingService.activateBooking(id, sellerId, dto);
  }

  @Patch('seller/:id/complete')
  @Roles(Role.Seller, Role.Admin)
  @ApiOperation({ summary: 'Завершить бронь (продавец)' })
  completeBooking(
    @Param('id') id: string,
    @GetCurrentUserId() sellerId: number,
  ) {
    return this.bookingService.completeBooking(id, sellerId);
  }

  @Patch('seller/:id/cancel')
  @Roles(Role.Seller, Role.Admin)
  @ApiOperation({ summary: 'Отменить бронь (продавец)' })
  cancelBySeller(
    @Param('id') id: string,
    @GetCurrentUserId() sellerId: number,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookingService.cancelBySeller(id, sellerId, dto);
  }

  // ── Customer: detail by id (parameterised – sorted LAST) ──────────────────
  @Get(':id')
  @Roles(Role.User, Role.Seller, Role.Admin)
  @ApiOperation({ summary: 'Получить бронь по ID' })
  getBookingById(
    @Param('id') id: string,
    @GetCurrentUserId() userId: number,
    @GetCurrentUser('role') role: Role,
  ) {
    return this.bookingService.getBookingById(id, userId, role);
  }

  // ── Customer: cancel (parameterised – sorted LAST) ────────────────────────
  @Patch(':id/cancel')
  @Roles(Role.User, Role.Admin)
  @ApiOperation({ summary: 'Отменить бронь (клиент)' })
  cancelByCustomer(
    @Param('id') id: string,
    @GetCurrentUserId() userId: number,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookingService.cancelByCustomer(id, userId, dto);
  }
}
