/**
 * One-shot fix for local DBs that were created via TypeORM synchronize
 * (migrations table empty / out of sync).
 *
 * 1) Adds categories.slug, backfills from name, sets NOT NULL
 * 2) Applies per-parent unique indexes
 * 3) Marks all migration files as executed (fake) so migration:run works later
 *
 * Usage: pnpm fix:category-slugs
 */
process.env.TYPEORM_DISABLE_SYNC = 'true';

import { readdirSync } from 'fs';
import { join } from 'path';

const CYRILLIC_MAP: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .split('')
    .map((char) => CYRILLIC_MAP[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 160);
}

const EXACT_MIGRATION_NAMES: Record<string, string> = {
  '1748978449974': 'EnableUuidExtension1748978449974',
  '1748978449975': 'Init1748978449975',
  '1748978449976': 'CreateUsersTable1748978449976',
  '1752256199727': 'EmailVerification1752256199727',
  '1752343622380': 'Booking1752343622380',
  '1753000000001': 'OffersRefactor1753000000001',
  '1753100000000': 'ChatSystem1753100000000',
  '1753200000000': 'BookingRefactor1753200000000',
  '1753300000000': 'CreateMissingApplicationTables1753300000000',
  '1753400000000': 'CategorySlug1753400000000',
  '1753400000001': 'CategorySlugPerParent1753400000001',
};

async function main() {
  // Dynamic import AFTER disabling synchronize
  const { default: dataSource } = await import('../data-source');

  await dataSource.initialize();
  const qr = dataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  try {
    await qr.query(`
      ALTER TABLE "categories"
      ADD COLUMN IF NOT EXISTS "slug" character varying(160)
    `);

    const rows: Array<{ id: string; name: string; parentId: string | null }> =
      await qr.query(
        `SELECT "id", "name", "parentId" FROM "categories" WHERE "slug" IS NULL OR "slug" = ''`,
      );

    const usedByParent = new Map<string, Set<string>>();
    const existing: Array<{
      slug: string;
      parentId: string | null;
    }> = await qr.query(
      `SELECT "slug", "parentId" FROM "categories" WHERE "slug" IS NOT NULL AND "slug" <> ''`,
    );
    for (const row of existing) {
      const key = row.parentId ?? '__root__';
      if (!usedByParent.has(key)) usedByParent.set(key, new Set());
      usedByParent.get(key)!.add(row.slug);
    }

    for (const row of rows) {
      const parentKey = row.parentId ?? '__root__';
      if (!usedByParent.has(parentKey)) usedByParent.set(parentKey, new Set());
      const used = usedByParent.get(parentKey)!;

      let slug = toSlug(row.name) || `category-${row.id.slice(0, 8)}`;
      let candidate = slug;
      let suffix = 2;
      while (used.has(candidate)) {
        candidate = `${slug}-${suffix++}`;
      }
      used.add(candidate);

      await qr.query(`UPDATE "categories" SET "slug" = $1 WHERE "id" = $2`, [
        candidate,
        row.id,
      ]);
      console.log(`slug: ${row.name} → ${candidate}`);
    }

    await qr.query(`
      ALTER TABLE "categories"
      ALTER COLUMN "slug" SET NOT NULL
    `);

    await qr.query(`
      ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "UQ_categories_slug"
    `);
    await qr.query(`DROP INDEX IF EXISTS "UQ_categories_slug"`);
    await qr.query(`DROP INDEX IF EXISTS "UQ_categories_root_slug"`);
    await qr.query(`DROP INDEX IF EXISTS "UQ_categories_parent_slug"`);

    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_categories_root_slug"
      ON "categories" ("slug")
      WHERE "parentId" IS NULL
    `);
    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_categories_parent_slug"
      ON "categories" ("parentId", "slug")
      WHERE "parentId" IS NOT NULL
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS "migrations" (
        "id" SERIAL NOT NULL,
        "timestamp" bigint NOT NULL,
        "name" character varying NOT NULL,
        CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY ("id")
      )
    `);

    const migrationsDir = join(__dirname, '..', 'migrations');
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
      .sort();

    for (const file of files) {
      const match = file.match(/^(\d+)-(.+)\.(ts|js)$/);
      if (!match) continue;

      const timestamp = Number(match[1]);
      const name = EXACT_MIGRATION_NAMES[match[1]];
      if (!name) {
        console.warn(`Unknown migration file, skip marking: ${file}`);
        continue;
      }

      const existingMig = await qr.query(
        `SELECT 1 FROM "migrations" WHERE "timestamp" = $1 OR "name" = $2 LIMIT 1`,
        [timestamp, name],
      );
      if (existingMig.length > 0) continue;

      await qr.query(
        `INSERT INTO "migrations"("timestamp", "name") VALUES ($1, $2)`,
        [timestamp, name],
      );
      console.log(`Marked migration as applied: ${name}`);
    }

    await qr.commitTransaction();
    console.log('Category slugs backfilled successfully.');
  } catch (err) {
    await qr.rollbackTransaction();
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  } finally {
    await qr.release();
    await dataSource.destroy();
  }
}

main();
