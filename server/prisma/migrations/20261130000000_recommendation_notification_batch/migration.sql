ALTER TABLE "system_notification"
ADD COLUMN "recommendation_ids" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
