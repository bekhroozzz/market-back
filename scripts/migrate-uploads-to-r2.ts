/**
 * One-off migration: move locally stored images to Cloudflare R2 and rewrite
 * the URLs stored in the database.
 *
 * What it does:
 *   1. Uploads every file under uploads/images and uploads/gallery to R2,
 *      preserving the "images/<name>" / "gallery/<name>" key layout.
 *   2. Rewrites offer.images[] and seller_profiles.gallery[].url entries that
 *      point at the old  <BASE_URL>/uploads/...  location to the new
 *      <R2_PUBLIC_URL>/...  location.
 *
 * Idempotent: re-uploading the same key just overwrites it, and URLs already
 * pointing at R2 are left untouched.
 *
 * Usage:
 *   pnpm migrate:uploads            # upload files AND rewrite DB
 *   pnpm migrate:uploads --dry-run  # report only, no writes
 *   pnpm migrate:uploads --files-only
 *   pnpm migrate:uploads --db-only
 */

import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { readdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname } from 'path';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { dataSourceOptions } from '../db/data-source';
import { OfferEntity } from '../src/offer/entities/offer.entity';
import {
  SellerProfileEntity,
  GalleryImage,
} from '../src/seller-profile/entities/seller-profile.entity';

dotenv.config();

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const FILES_ONLY = args.has('--files-only');
const DB_ONLY = args.has('--db-only');

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const R2_PUBLIC_URL = requireEnv('R2_PUBLIC_URL').replace(/\/+$/, '');
const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:4000').replace(
  /\/+$/,
  '',
);
const OLD_PREFIX = `${BASE_URL}/uploads/`;

function buildClient(): { client: S3Client; bucket: string } {
  const client = new S3Client({
    region: 'auto',
    endpoint: requireEnv('R2_ENDPOINT'),
    credentials: {
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
  });
  return { client, bucket: requireEnv('R2_BUCKET') };
}

async function objectExists(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function uploadFolder(
  client: S3Client,
  bucket: string,
  folder: 'images' | 'gallery',
): Promise<number> {
  const dir = join(process.cwd(), 'uploads', folder);
  if (!existsSync(dir)) {
    console.log(`  • uploads/${folder} does not exist, skipping`);
    return 0;
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  let uploaded = 0;

  for (const name of files) {
    const key = `${folder}/${name}`;
    const contentType =
      MIME_BY_EXT[extname(name).toLowerCase()] ?? 'application/octet-stream';

    if (DRY_RUN) {
      console.log(`  • would upload ${key}`);
      uploaded += 1;
      continue;
    }

    if (await objectExists(client, bucket, key)) {
      console.log(`  • ${key} already in R2, skipping`);
      continue;
    }

    const body = await readFile(join(dir, name));
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    console.log(`  • uploaded ${key}`);
    uploaded += 1;
  }

  return uploaded;
}

/** Rewrite a single URL if it points at the old local uploads location. */
function rewriteUrl(url: string): string {
  if (typeof url === 'string' && url.startsWith(OLD_PREFIX)) {
    return `${R2_PUBLIC_URL}/${url.slice(OLD_PREFIX.length)}`;
  }
  return url;
}

async function rewriteDatabase(): Promise<void> {
  const dataSource = new DataSource({
    ...dataSourceOptions,
    entities: [OfferEntity, SellerProfileEntity],
    migrationsRun: false,
    synchronize: false,
  });
  await dataSource.initialize();
  console.log('🔗 Database connected');

  try {
    // ── Offers ────────────────────────────────────────────────────────────
    const offerRepo = dataSource.getRepository(OfferEntity);
    const offers = await offerRepo.find();
    let offersChanged = 0;

    for (const offer of offers) {
      if (!offer.images?.length) continue;
      const next = offer.images.map(rewriteUrl);
      if (next.some((u, i) => u !== offer.images![i])) {
        offer.images = next;
        offersChanged += 1;
        if (!DRY_RUN) await offerRepo.save(offer);
      }
    }
    console.log(
      `  • offers: ${offersChanged} row(s) ${DRY_RUN ? 'would be ' : ''}updated`,
    );

    // ── Seller galleries ──────────────────────────────────────────────────
    const profileRepo = dataSource.getRepository(SellerProfileEntity);
    const profiles = await profileRepo.find();
    let profilesChanged = 0;

    for (const profile of profiles) {
      if (!profile.gallery?.length) continue;
      const next: GalleryImage[] = profile.gallery.map((img) => ({
        ...img,
        url: rewriteUrl(img.url),
      }));
      if (next.some((img, i) => img.url !== profile.gallery[i].url)) {
        profile.gallery = next;
        profilesChanged += 1;
        if (!DRY_RUN) await profileRepo.save(profile);
      }
    }
    console.log(
      `  • seller galleries: ${profilesChanged} row(s) ${
        DRY_RUN ? 'would be ' : ''
      }updated`,
    );
  } finally {
    await dataSource.destroy();
  }
}

async function main(): Promise<void> {
  console.log(
    `\n🚚 Migrating uploads → R2${DRY_RUN ? ' (dry run)' : ''}\n` +
      `   old: ${OLD_PREFIX}\n   new: ${R2_PUBLIC_URL}/\n`,
  );

  if (!DB_ONLY) {
    const { client, bucket } = buildClient();
    console.log('📤 Uploading files:');
    const images = await uploadFolder(client, bucket, 'images');
    const gallery = await uploadFolder(client, bucket, 'gallery');
    console.log(`   ${images + gallery} file(s) processed\n`);
  }

  if (!FILES_ONLY) {
    console.log('📝 Rewriting database URLs:');
    await rewriteDatabase();
  }

  console.log('\n✅ Migration finished.');
}

main().catch((error) => {
  console.error('\n❌ Migration failed:', error);
  process.exit(1);
});
