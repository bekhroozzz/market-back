import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnableUuidExtension1748978449974 implements MigrationInterface {
  name = 'EnableUuidExtension1748978449974';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  }

  public async down(): Promise<void> {
    // Do not remove a shared database extension during application rollback.
  }
}
