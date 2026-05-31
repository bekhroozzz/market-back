import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Booking module complete refactor:
 * - Drop old bookings table and enums (status had only active/completed/cancelled,
 *   paymenttype had cash/online)
 * - Create new enums: status (pending/confirmed/active/completed/cancelled/expired),
 *   paymentmethod (cash/card), cancelledby (customer/seller)
 * - Create new bookings table with full booking lifecycle fields
 * - Add auto_confirm_booking column to offers
 * - Add booking notification types to notifications_type_enum
 *
 * Note: transaction = false is required because ALTER TYPE ADD VALUE
 * cannot run inside a transaction block in PostgreSQL.
 */
export class BookingRefactor1753200000000 implements MigrationInterface {
  name = 'BookingRefactor1753200000000';
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop old bookings table and dependent constraints
    await queryRunner.query(
      `ALTER TABLE IF EXISTS "bookings" DROP CONSTRAINT IF EXISTS "FK_02fcfcc118488d4e87990f9b7dd"`,
    );
    await queryRunner.query(
      `ALTER TABLE IF EXISTS "bookings" DROP CONSTRAINT IF EXISTS "FK_64cd97487c5c42806458ab5520c"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "bookings"`);

    // 2. Drop old enums
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."bookings_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."bookings_paymenttype_enum"`,
    );

    // 3. Create new enums
    await queryRunner.query(
      `CREATE TYPE "public"."bookings_status_enum" AS ENUM('pending', 'confirmed', 'active', 'completed', 'cancelled', 'expired')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bookings_paymentmethod_enum" AS ENUM('cash', 'card')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bookings_cancelledby_enum" AS ENUM('customer', 'seller')`,
    );

    // 4. Create new bookings table
    await queryRunner.query(`
      CREATE TABLE "bookings" (
        "id"             uuid NOT NULL DEFAULT uuid_generate_v4(),
        "offer_id"       uuid NOT NULL,
        "seller_id"      integer NOT NULL,
        "customer_id"    integer NOT NULL,
        "date"           character varying(12) NOT NULL,
        "time"           character varying(6) NOT NULL,
        "personsCount"   integer NOT NULL,
        "phone"          character varying(30) NOT NULL,
        "comment"        text,
        "paymentMethod"  "public"."bookings_paymentmethod_enum" NOT NULL,
        "status"         "public"."bookings_status_enum" NOT NULL DEFAULT 'pending',
        "secret_code"    character varying(10),
        "confirmed_at"   TIMESTAMP,
        "activated_at"   TIMESTAMP,
        "cancelled_at"   TIMESTAMP,
        "cancelled_by"   "public"."bookings_cancelledby_enum",
        "cancel_reason"  text,
        "createdAt"      TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"      TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bookings" PRIMARY KEY ("id")
      )
    `);

    // 5. Add foreign key constraints
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_bookings_offer_id" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_bookings_customer_id" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    // 6. Add indices for fast searching
    await queryRunner.query(
      `CREATE INDEX "idx_bookings_seller_id" ON "bookings" ("seller_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_bookings_customer_id" ON "bookings" ("customer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_bookings_offer_id" ON "bookings" ("offer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_bookings_status" ON "bookings" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_bookings_seller_status" ON "bookings" ("seller_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_bookings_customer_status" ON "bookings" ("customer_id", "status")`,
    );

    // 7. Add auto_confirm_booking to offers
    await queryRunner.query(
      `ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "auto_confirm_booking" boolean NOT NULL DEFAULT false`,
    );

    // 8. Add booking notification types to existing enum
    // These must run outside a transaction (transaction = false on class)
    await queryRunner.query(
      `ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS 'booking_new'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS 'booking_confirmed'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS 'booking_rejected'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS 'booking_cancelled'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS 'booking_activated'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS 'booking_completed'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove auto_confirm_booking from offers
    await queryRunner.query(
      `ALTER TABLE "offers" DROP COLUMN IF EXISTS "auto_confirm_booking"`,
    );

    // Drop indices
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bookings_customer_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bookings_seller_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bookings_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bookings_offer_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bookings_customer_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bookings_seller_id"`);

    // Drop bookings table and enums
    await queryRunner.query(`DROP TABLE IF EXISTS "bookings"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."bookings_cancelledby_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."bookings_paymentmethod_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."bookings_status_enum"`,
    );

    // Restore old enums and table (minimal rollback – no old data preserved)
    await queryRunner.query(
      `CREATE TYPE "public"."bookings_paymenttype_enum" AS ENUM('cash', 'online')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bookings_status_enum" AS ENUM('active', 'completed', 'cancelled')`,
    );
    await queryRunner.query(`
      CREATE TABLE "bookings" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "fullName"         character varying(120) NOT NULL,
        "phone"            character varying(20) NOT NULL,
        "bookingDate"      TIMESTAMP NOT NULL,
        "paymentType"      "public"."bookings_paymenttype_enum" NOT NULL,
        "isPaid"           boolean NOT NULL DEFAULT false,
        "status"           "public"."bookings_status_enum" NOT NULL DEFAULT 'active',
        "verificationCode" character varying(10) NOT NULL,
        "createdAt"        TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"        TIMESTAMP NOT NULL DEFAULT now(),
        "offer_id"         uuid NOT NULL,
        "user_id"          integer NOT NULL,
        CONSTRAINT "PK_bee6805982cc1e248e94ce94957" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_02fcfcc118488d4e87990f9b7dd" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_64cd97487c5c42806458ab5520c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
