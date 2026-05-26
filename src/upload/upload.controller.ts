import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';

function imageFileFilter(
  _req: ExpressRequest,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) {
  if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new BadRequestException('Only JPEG, PNG, WebP and GIF images are allowed'),
      false,
    );
  }
}

@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  @Post('image')
  @UseGuards(RolesGuard)
  @Roles(Role.Seller, Role.Admin)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads', 'images'),
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: imageFileFilter,
    }),
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Upload a single image file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({
    status: 201,
    schema: { example: { url: 'http://localhost:4000/uploads/images/abc.jpg' } },
  })
  @HttpCode(HttpStatus.CREATED)
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    const baseUrl = process.env.BASE_URL ?? 'http://localhost:4000';
    return { url: `${baseUrl}/uploads/images/${file.filename}` };
  }
}
