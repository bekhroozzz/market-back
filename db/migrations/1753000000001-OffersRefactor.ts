import { MigrationInterface, QueryRunner } from 'typeorm';

export class OffersRefactor1753000000001 implements MigrationInterface {
  name = 'OffersRefactor1753000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "offers" DROP COLUMN IF EXISTS "reviewCount"`);
    await queryRunner.query(`ALTER TABLE "offers" DROP COLUMN IF EXISTS "prices"`);
    await queryRunner.query(`ALTER TABLE "offers" DROP COLUMN IF EXISTS "rules"`);
    await queryRunner.query(`ALTER TABLE "offers" DROP COLUMN IF EXISTS "features"`);
    await queryRunner.query(`ALTER TABLE "offers" DROP COLUMN IF EXISTS "workSchedule"`);
  }
}
