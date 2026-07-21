import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMissingApplicationTables1753300000000
  implements MigrationInterface
{
  name = 'CreateMissingApplicationTables1753300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "seller_profiles" (
        "id"            uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"       integer NOT NULL,
        "company_name"  character varying(255),
        "about_company" text,
        "phones"        text[] NOT NULL DEFAULT '{}',
        "branches"      jsonb NOT NULL DEFAULT '[]',
        "gallery"       jsonb NOT NULL DEFAULT '[]',
        "createdAt"     TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_seller_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_seller_profiles_user_id" UNIQUE ("user_id"),
        CONSTRAINT "FK_seller_profiles_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
          ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_verification" (
        "id"        SERIAL NOT NULL,
        "token"     character varying NOT NULL,
        "userId"    integer NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_verification" PRIMARY KEY ("id"),
        CONSTRAINT "FK_email_verification_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "email_verification"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "seller_profiles"`);
  }
}
