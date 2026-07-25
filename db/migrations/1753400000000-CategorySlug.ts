import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds unique URL slug to categories and backfills existing rows
 * from transliterated names.
 */
export class CategorySlug1753400000000 implements MigrationInterface {
  name = 'CategorySlug1753400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "categories"
      ADD COLUMN IF NOT EXISTS "slug" character varying(160)
    `);

    const rows: Array<{ id: string; name: string }> = await queryRunner.query(
      `SELECT "id", "name" FROM "categories" WHERE "slug" IS NULL OR "slug" = ''`,
    );

    const used = new Set<string>(
      (
        await queryRunner.query(
          `SELECT "slug" FROM "categories" WHERE "slug" IS NOT NULL AND "slug" <> ''`,
        )
      ).map((r: { slug: string }) => r.slug),
    );

    for (const row of rows) {
      let slug = this.toSlug(row.name) || `category-${row.id.slice(0, 8)}`;
      let candidate = slug;
      let suffix = 2;
      while (used.has(candidate)) {
        candidate = `${slug}-${suffix++}`;
      }
      used.add(candidate);
      await queryRunner.query(
        `UPDATE "categories" SET "slug" = $1 WHERE "id" = $2`,
        [candidate, row.id],
      );
    }

    await queryRunner.query(`
      ALTER TABLE "categories"
      ALTER COLUMN "slug" SET NOT NULL
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "categories"
        ADD CONSTRAINT "UQ_categories_slug" UNIQUE ("slug");
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "UQ_categories_slug"
    `);
    await queryRunner.query(`
      ALTER TABLE "categories" DROP COLUMN IF EXISTS "slug"
    `);
  }

  private toSlug(value: string): string {
    const map: Record<string, string> = {
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

    return value
      .toLowerCase()
      .split('')
      .map((char) => map[char] ?? char)
      .join('')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 160);
  }
}
