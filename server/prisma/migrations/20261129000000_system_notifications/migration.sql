ALTER TYPE "EventType" ADD VALUE 'зміна дозволу ролі';

CREATE TABLE "system_notification" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "recommendation_id" INTEGER,
  "title" VARCHAR(120) NOT NULL,
  "message" VARCHAR(500) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "read_at" TIMESTAMPTZ(3),
  CONSTRAINT "system_notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "system_notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account" ("user_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "system_notification_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "recommendation" ("recommendation_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "system_notification_user_id_id_idx" ON "system_notification" ("user_id", "id");
CREATE INDEX "system_notification_user_id_read_at_idx" ON "system_notification" ("user_id", "read_at");
CREATE INDEX "system_notification_recommendation_id_idx" ON "system_notification" ("recommendation_id");
