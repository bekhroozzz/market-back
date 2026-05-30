import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChatSystem1753100000000 implements MigrationInterface {
  name = 'ChatSystem1753100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "chats" (
        "id"              uuid                NOT NULL DEFAULT uuid_generate_v4(),
        "offerId"         uuid                NOT NULL,
        "sellerId"        integer             NOT NULL,
        "buyerId"         integer             NOT NULL,
        "lastMessageId"   uuid,
        "lastMessageAt"   TIMESTAMP WITH TIME ZONE,
        "unreadForSeller" integer             NOT NULL DEFAULT 0,
        "unreadForBuyer"  integer             NOT NULL DEFAULT 0,
        "createdAt"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chats" PRIMARY KEY ("id"),
        CONSTRAINT "FK_chats_offer"  FOREIGN KEY ("offerId")  REFERENCES "offers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_chats_seller" FOREIGN KEY ("sellerId") REFERENCES "users"("id")  ON DELETE CASCADE,
        CONSTRAINT "FK_chats_buyer"  FOREIGN KEY ("buyerId")  REFERENCES "users"("id")  ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_chats_offer_buyer" ON "chats" ("offerId", "buyerId")
    `);

    await queryRunner.query(`
      CREATE TABLE "chat_messages" (
        "id"        uuid                NOT NULL DEFAULT uuid_generate_v4(),
        "chatId"    uuid                NOT NULL,
        "senderId"  integer             NOT NULL,
        "message"   text                NOT NULL,
        "isRead"    boolean             NOT NULL DEFAULT false,
        "readAt"    TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_chat_messages_chat"   FOREIGN KEY ("chatId")   REFERENCES "chats"("id")  ON DELETE CASCADE,
        CONSTRAINT "FK_chat_messages_sender" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_chat_messages_chatId_createdAt" ON "chat_messages" ("chatId", "createdAt")
    `);

    await queryRunner.query(`
      ALTER TABLE "chats"
        ADD CONSTRAINT "FK_chats_lastMessage"
          FOREIGN KEY ("lastMessageId") REFERENCES "chat_messages"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE TYPE "notifications_type_enum" AS ENUM (
        'new_message',
        'offer_created',
        'offer_updated',
        'offer_approved',
        'offer_rejected'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id"        uuid                NOT NULL DEFAULT uuid_generate_v4(),
        "userId"    integer             NOT NULL,
        "type"      "notifications_type_enum" NOT NULL,
        "title"     varchar(255)        NOT NULL,
        "body"      text                NOT NULL,
        "entityId"  varchar(255),
        "isRead"    boolean             NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notifications_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notifications_userId_isRead"    ON "notifications" ("userId", "isRead")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_notifications_userId_createdAt" ON "notifications" ("userId", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notifications_userId_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notifications_userId_isRead"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "notifications_type_enum"`);
    await queryRunner.query(`ALTER TABLE "chats" DROP CONSTRAINT IF EXISTS "FK_chats_lastMessage"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_messages_chatId_createdAt"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_messages"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_chats_offer_buyer"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chats"`);
  }
}
