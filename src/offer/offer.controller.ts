import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { OfferService } from './offer.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { OfferEntity } from './entities/offer.entity';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtPayload } from '../auth/strategies/access-token.strategy';

interface AuthenticatedRequest extends ExpressRequest {
  user: JwtPayload;
}

@Controller('offer')
export class OfferController {
  constructor(private readonly offerService: OfferService) {}

  @Public()
  @ApiOperation({ summary: 'Получить все офферы' })
  @ApiResponse({ status: 200, type: OfferEntity, isArray: true })
  @Get('all')
  async findAll() {
    return this.offerService.findAll();
  }

  @Public()
  @ApiParam({ name: 'id', type: 'string' })
  @ApiOperation({ summary: 'Получить оффер по ID' })
  @ApiResponse({ status: 200, type: OfferEntity })
  @Get('find-by-id/:id')
  async findById(@Param('id') id: string) {
    return this.offerService.findById(id);
  }

  @Post('create')
  @UseGuards(RolesGuard)
  @Roles(Role.Seller, Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Создать оффер' })
  @ApiBody({ type: CreateOfferDto })
  @ApiResponse({ status: 201, type: OfferEntity })
  async create(
    @Body() offer: CreateOfferDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.offerService.create({ ...offer, authorId: req.user.sub });
  }

  @Put('update/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.Seller, Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Обновить оффер' })
  @ApiBody({ type: UpdateOfferDto })
  @ApiResponse({ status: 200, type: OfferEntity })
  async update(
    @Param('id') id: string,
    @Body() offer: UpdateOfferDto,
  ): Promise<OfferEntity> {
    return this.offerService.update(id, offer);
  }

  @Delete('delete/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.Seller, Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Удалить оффер' })
  async delete(@Param('id') id: string): Promise<OfferEntity> {
    return this.offerService.delete(id);
  }
}
