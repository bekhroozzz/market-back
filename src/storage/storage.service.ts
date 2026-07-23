import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import sharp from 'sharp';

// Downscale huge uploads and re-encode everything to WebP: much smaller files,
// broad browser support, and animation is preserved for animated sources.
const MAX_DIMENSION = 1920;
const WEBP_QUALITY = 80;

export interface UploadedObject {
  /** Public URL served by the CDN (R2 public bucket / custom domain). */
  url: string;
  /** Object key inside the bucket, e.g. "images/uuid.jpg". */
  key: string;
}

/**
 * Cloudflare R2 (S3-compatible) object storage.
 *
 * R2 speaks the S3 API, so we use the standard AWS SDK v3 client pointed at the
 * account endpoint. Files are served publicly through R2_PUBLIC_URL
 * (a public bucket URL like https://pub-xxx.r2.dev or a custom CDN domain).
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: S3Client;
  private bucket!: string;
  private publicUrl!: string;

  onModuleInit(): void {
    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET;
    const publicUrl = process.env.R2_PUBLIC_URL;

    if (
      !endpoint ||
      !accessKeyId ||
      !secretAccessKey ||
      !bucket ||
      !publicUrl
    ) {
      throw new Error(
        'R2 storage is not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, ' +
          'R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_URL.',
      );
    }

    this.bucket = bucket;
    this.publicUrl = publicUrl.replace(/\/+$/, '');
    this.client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  /**
   * Optimize an image, upload it under the given folder and return its public
   * URL. The image is downscaled to fit within MAX_DIMENSION and re-encoded to
   * WebP; a random UUID filename is generated to avoid collisions.
   */
  async upload(
    file: Express.Multer.File,
    folder: 'images' | 'gallery',
  ): Promise<UploadedObject> {
    const body = await this.optimize(file);
    const key = `${folder}/${randomUUID()}.webp`;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: 'image/webp',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    } catch (err) {
      this.logger.error(
        `Failed to upload "${key}" to R2: ${(err as Error).message}`,
      );
      throw new InternalServerErrorException('Failed to upload file');
    }

    return { url: `${this.publicUrl}/${key}`, key };
  }

  private async optimize(file: Express.Multer.File): Promise<Buffer> {
    try {
      return await sharp(file.buffer, { animated: true })
        .rotate()
        .resize({
          width: MAX_DIMENSION,
          height: MAX_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
    } catch (err) {
      this.logger.error(
        `Failed to process image "${file.originalname}": ${
          (err as Error).message
        }`,
      );
      throw new InternalServerErrorException('Failed to process image');
    }
  }

  /**
   * Delete an object by its public URL (best-effort; missing objects are
   * ignored). Returns true when a delete request was issued.
   */
  async deleteByUrl(url: string): Promise<boolean> {
    if (!url.startsWith(this.publicUrl)) {
      return false;
    }
    const key = url.slice(this.publicUrl.length + 1);
    if (!key) {
      return false;
    }

    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (err) {
      this.logger.warn(
        `Failed to delete "${key}" from R2: ${(err as Error).message}`,
      );
      return false;
    }
  }
}
