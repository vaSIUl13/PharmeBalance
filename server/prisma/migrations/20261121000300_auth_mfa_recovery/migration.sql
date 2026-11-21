ALTER TABLE "auth_mfa"
ADD COLUMN "recovery_hashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
