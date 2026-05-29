import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { Request as ExpressRequest } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { SellerProfileService } from './seller-profile.service';
import { UpdateSellerProfileDto } from './dto/update-seller-profile.dto';
import { SellerPublicResponseDto } from './dto/seller-public-response.dto';
import { SellerProfileEntity } from './entities/seller-profile.entity';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../user/enums/role.enum';
import { JwtPayload } from '../auth/strategies/access-token.strategy';

interface AuthenticatedRequest extends ExpressRequest {
  user: JwtPayload;
}

const galleryStorage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'gallery'),
  filename: (_req, file, cb) => {
    cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
  },
});

function imageFileFilter(
  _req: ExpressRequest,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) {
  const allowed = /^image\/(jpeg|png|webp|gif)$/;
  if (allowed.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, WebP and GIF images are allowed'), false);
  }
}

@ApiTags('Seller Profile')
@Controller('seller')
export class SellerProfileController {
  constructor(private readonly sellerProfileService: SellerProfileService) {}

  // ─── Public ────────────────────────────────────────────────────────────────

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get public seller profile with offers' })
  @ApiParam({ name: 'id', type: 'number', description: 'Seller (user) ID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, type: SellerPublicResponseDto })
  @ApiResponse({ status: 404, description: 'Seller not found' })
  async getPublicProfile(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page = 1,
    @Query('limit') limit = 12,
  ): Promise<SellerPublicResponseDto> {
    return this.sellerProfileService.getPublicProfile(
      id,
      Number(page),
      Number(limit),
    );
  }

  // ─── Private (Seller only) ──────────────────────────────────────────────────

  @Get('me/profile')
  @UseGuards(RolesGuard)
  @Roles(Role.Seller, Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get my seller profile' })
  @ApiResponse({ status: 200, type: SellerProfileEntity })
  async getMyProfile(
    @Req() req: AuthenticatedRequest,
  ): Promise<SellerProfileEntity> {
    return this.sellerProfileService.getOrCreateProfile(Number(req.user.sub));
  }

  @Patch('me/profile')
  @UseGuards(RolesGuard)
  @Roles(Role.Seller, Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update my seller profile' })
  @ApiBody({ type: UpdateSellerProfileDto })
  @ApiResponse({ status: 200, type: SellerProfileEntity })
  async updateMyProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateSellerProfileDto,
  ): Promise<SellerProfileEntity> {
    return this.sellerProfileService.updateProfile(Number(req.user.sub), dto);
  }

  @Post('me/gallery')
  @UseGuards(RolesGuard)
  @Roles(Role.Seller, Role.Admin)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: galleryStorage,
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: imageFileFilter,
    }),
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Upload a gallery image (max 10)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, type: SellerProfileEntity })
  @HttpCode(HttpStatus.CREATED)
  async uploadGalleryImage(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<SellerProfileEntity> {
    const baseUrl = process.env.BASE_URL ?? 'http://localhost:4000';
    const imageUrl = `${baseUrl}/uploads/gallery/${file.filename}`;
    return this.sellerProfileService.addGalleryImage(
      Number(req.user.sub),
      imageUrl,
    );
  }

  @Delete('me/gallery/:imageId')
  @UseGuards(RolesGuard)
  @Roles(Role.Seller, Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Remove an image from gallery' })
  @ApiParam({ name: 'imageId', type: 'string' })
  @ApiResponse({ status: 200, type: SellerProfileEntity })
  async removeGalleryImage(
    @Req() req: AuthenticatedRequest,
    @Param('imageId') imageId: string,
  ): Promise<SellerProfileEntity> {
    return this.sellerProfileService.removeGalleryImage(
      Number(req.user.sub),
      imageId,
    );
  }
}
