-- CreateEnum
CREATE TYPE "identity_registration_consent_scope" AS ENUM ('NAME_AND_EMAIL');

-- CreateEnum
CREATE TYPE "open_finance_consent_status" AS ENUM ('AWAITING_AUTHORISATION', 'AUTHORISED', 'REJECTED', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "identity_users" (
    "id" UUID NOT NULL,
    "display_name" VARCHAR(80) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "registered_at" TIMESTAMPTZ(3) NOT NULL,
    "consent_accepted_at" TIMESTAMPTZ(3) NOT NULL,
    "consent_policy_version" VARCHAR(32) NOT NULL,
    "consent_scope" "identity_registration_consent_scope" NOT NULL,

    CONSTRAINT "identity_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "identity_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "open_finance_consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "open_finance_consent_status" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "open_finance_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gamification_streaks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "current_days" INTEGER NOT NULL DEFAULT 0,
    "longest_days" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "gamification_streaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gamification_badge_collections" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "gamification_badge_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gamification_badges" (
    "id" UUID NOT NULL,
    "collection_id" UUID NOT NULL,
    "kind" VARCHAR(64) NOT NULL,
    "awarded_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "gamification_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications_inboxes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notifications_inboxes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "identity_users_email_key" ON "identity_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "identity_sessions_token_hash_key" ON "identity_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "identity_sessions_user_id_idx" ON "identity_sessions"("user_id");

-- CreateIndex
CREATE INDEX "open_finance_consents_user_id_status_idx" ON "open_finance_consents"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gamification_streaks_user_id_key" ON "gamification_streaks"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "gamification_badge_collections_user_id_key" ON "gamification_badge_collections"("user_id");

-- CreateIndex
CREATE INDEX "gamification_badges_collection_id_idx" ON "gamification_badges"("collection_id");

-- CreateIndex
CREATE UNIQUE INDEX "gamification_badges_collection_id_kind_key" ON "gamification_badges"("collection_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_inboxes_user_id_key" ON "notifications_inboxes"("user_id");

-- AddForeignKey
ALTER TABLE "identity_sessions" ADD CONSTRAINT "identity_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gamification_badges" ADD CONSTRAINT "gamification_badges_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "gamification_badge_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
