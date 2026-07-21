import { MigrationInterface, QueryRunner } from 'typeorm';

export class OffersRefactor1753000000001 implements MigrationInterface {
  name = 'OffersRefactor1753000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Older development databases got these columns from synchronize=true.
    // Production databases must receive them through explicit migrations.
    await queryRunner.query(
      `ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "slug" character varying(160)`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "price" numeric(12,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "oldPrice" numeric(12,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "inStock" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "brandId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "attributes" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "rating" numeric(3,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "salesCount" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "author_id" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "branchAddress" character varying(255)`,
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_attribute a
            ON a.attrelid = c.conrelid
           AND a.attnum = ANY(c.conkey)
          WHERE c.contype = 'f'
            AND c.conrelid = '"offers"'::regclass
            AND a.attname = 'author_id'
        ) THEN
          ALTER TABLE "offers"
            ADD CONSTRAINT "FK_offers_author_id"
            FOREIGN KEY ("author_id") REFERENCES "users"("id")
            ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `);

    // workSchedule — JSONB array of WorkScheduleDay objects
    await queryRunner.query(
      `ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "workSchedule" jsonb NOT NULL DEFAULT '[]'`,
    );

    // features — text[] for amenities (Wi-Fi, Parking, etc.)
    await queryRunner.query(
      `ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "features" text[] NOT NULL DEFAULT '{}'`,
    );

    // rules — text[] for rules/restrictions
    await queryRunner.query(
      `ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "rules" text[] NOT NULL DEFAULT '{}'`,
    );

    // prices — JSONB array of PriceTariff objects
    await queryRunner.query(
      `ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "prices" jsonb NOT NULL DEFAULT '[]'`,
    );

    // reviewCount — denormalized counter, kept in sync by ReviewService
    await queryRunner.query(
      `ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "reviewCount" integer NOT NULL DEFAULT 0`,
    );

    // Normalize existing rating column (was 0-10, now 0-5).
    // Existing rows with non-zero rating are scaled down proportionally.
    await queryRunner.query(
      `UPDATE "offers" SET "rating" = ROUND(("rating" / 10.0) * 5, 2) WHERE "rating" > 5`,
    );

    // Normalize existing review ratings to 1-5 scale
    await queryRunner.query(
      `UPDATE "reviews" SET "rating" = GREATEST(1, LEAST(5, ROUND("rating" / 2.0)))
       WHERE "rating" > 5`,
    );

    // Initialize denormalized offer statistics from existing review rows.
    await queryRunner.query(`
      UPDATE "offers" AS offer
      SET
        "reviewCount" = stats.review_count,
        "rating" = stats.average_rating
      FROM (
        SELECT
          "offer_id",
          COUNT(*)::integer AS review_count,
          ROUND(AVG("rating")::numeric, 2) AS average_rating
        FROM "reviews"
        GROUP BY "offer_id"
      ) AS stats
      WHERE offer."id" = stats."offer_id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "offers" DROP CONSTRAINT IF EXISTS "FK_offers_author_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP COLUMN IF EXISTS "reviewCount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP COLUMN IF EXISTS "prices"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP COLUMN IF EXISTS "rules"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP COLUMN IF EXISTS "features"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP COLUMN IF EXISTS "workSchedule"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP COLUMN IF EXISTS "branchAddress"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP COLUMN IF EXISTS "author_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP COLUMN IF EXISTS "salesCount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP COLUMN IF EXISTS "rating"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP COLUMN IF EXISTS "attributes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP COLUMN IF EXISTS "brandId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP COLUMN IF EXISTS "inStock"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP COLUMN IF EXISTS "oldPrice"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP COLUMN IF EXISTS "price"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP COLUMN IF EXISTS "slug"`,
    );
  }
}
