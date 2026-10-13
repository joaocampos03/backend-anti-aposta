-- CreateEnum
CREATE TYPE "notifications_kind" AS ENUM ('AWARENESS_NUDGE', 'BADGE_AWARDED', 'STREAK_BROKEN', 'GOAL_REACHED', 'TRANSACTIONS_INGESTED');

-- CreateTable
CREATE TABLE "notifications_notifications" (
    "id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "kind" "notifications_kind" NOT NULL,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notifications_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_notifications_recipient_id_id_idx" ON "notifications_notifications"("recipient_id", "id");

-- CreateIndex
CREATE INDEX "open_finance_consents_external_consent_id_idx" ON "open_finance_consents"("external_consent_id");

-- CreateIndex
CREATE INDEX "sandbox_bank_consents_account_ids_idx" ON "sandbox_bank_consents" USING GIN ("account_ids");
