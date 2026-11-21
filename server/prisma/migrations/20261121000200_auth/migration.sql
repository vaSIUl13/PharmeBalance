-- CreateTable
CREATE TABLE "auth_session" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "mfa_verified" BOOLEAN NOT NULL DEFAULT false,
    "device" VARCHAR(255) NOT NULL,

    CONSTRAINT "auth_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_challenge" (
    "token_hash" CHAR(64) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "purpose" VARCHAR(16) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_challenge_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "auth_mfa" (
    "user_id" INTEGER NOT NULL,
    "encrypted_secret" TEXT NOT NULL,
    "last_step" BIGINT NOT NULL DEFAULT -1,

    CONSTRAINT "auth_mfa_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "auth_audit_event" (
    "id" BIGSERIAL NOT NULL,
    "user_id" INTEGER,
    "event" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_session_token_hash_key" ON "auth_session"("token_hash");

-- CreateIndex
CREATE INDEX "auth_session_user_id_revoked_at_idx" ON "auth_session"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "auth_session_expires_at_idx" ON "auth_session"("expires_at");

-- CreateIndex
CREATE INDEX "auth_challenge_user_id_purpose_idx" ON "auth_challenge"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "auth_challenge_expires_at_idx" ON "auth_challenge"("expires_at");

-- CreateIndex
CREATE INDEX "auth_audit_event_user_id_created_at_idx" ON "auth_audit_event"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_challenge" ADD CONSTRAINT "auth_challenge_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_mfa" ADD CONSTRAINT "auth_mfa_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
