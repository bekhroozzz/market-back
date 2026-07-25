import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Category slugs are unique among siblings (same parent), not globally.
 * Enables nested catalog URLs like /catalog/woman/odezhda/tolstovky-i-svitshoty
 * where the same leaf slug could theoretically exist under another branch.
 */
export class CategorySlugPerParent1753400000001 implements MigrationInterface {
  name = 'CategorySlugPerParent1753400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "UQ_categories_slug"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_categories_slug"
    `);

    // Roots (parentId IS NULL): slug unique among roots
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_categories_root_slug"
      ON "categories" ("slug")
      WHERE "parentId" IS NULL
    `);

    // Nested: slug unique among children of the same parent
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_categories_parent_slug"
      ON "categories" ("parentId", "slug")
      WHERE "parentId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_categories_parent_slug"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_categories_root_slug"
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "categories"
        ADD CONSTRAINT "UQ_categories_slug" UNIQUE ("slug");
      EXCEPTION
        WHEN duplicate_object THEN NULL;
        WHEN unique_violation THEN NULL;
      END $$
    `);
  }
}
