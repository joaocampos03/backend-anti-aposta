-- CreateEnum
CREATE TYPE "open_finance_account_kind" AS ENUM ('CHECKING', 'CREDIT_CARD');

-- CreateEnum
CREATE TYPE "open_finance_transaction_category" AS ENUM ('BETS', 'GROCERIES', 'DINING', 'TRANSPORT', 'HOUSING', 'HEALTH', 'SUBSCRIPTIONS', 'SHOPPING', 'INCOME', 'TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "open_finance_payment_method" AS ENUM ('PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'DIRECT_DEBIT', 'TRANSFER', 'BOLETO');

-- CreateEnum
CREATE TYPE "open_finance_transaction_status" AS ENUM ('SETTLED', 'PENDING');

-- CreateEnum
CREATE TYPE "bet_detection_reason" AS ENUM ('GAMBLING_MCC', 'LICENSED_CNPJ', 'DESCRIPTION_KEYWORD');

-- CreateEnum
CREATE TYPE "bet_detection_confidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "bet_detection_source" AS ENUM ('POLICY', 'USER_OVERRIDE');

-- CreateEnum
CREATE TYPE "bet_detection_override_verdict" AS ENUM ('NOT_A_BET');

-- AlterTable
ALTER TABLE "open_finance_consents" ADD COLUMN     "last_synced_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "open_finance_connected_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "consent_id" UUID NOT NULL,
    "institution" VARCHAR(120) NOT NULL,
    "short_name" VARCHAR(60) NOT NULL,
    "product" VARCHAR(60) NOT NULL,
    "masked_number" VARCHAR(16) NOT NULL,
    "kind" "open_finance_account_kind" NOT NULL,
    "connected_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "open_finance_connected_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "open_finance_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "amount_in_cents" INTEGER NOT NULL,
    "counterparty" VARCHAR(140) NOT NULL,
    "category" "open_finance_transaction_category" NOT NULL,
    "method" "open_finance_payment_method" NOT NULL,
    "status" "open_finance_transaction_status" NOT NULL,
    "ingested_at" TIMESTAMPTZ(3) NOT NULL,
    "bet_matched_by" "bet_detection_reason",
    "bet_confidence" "bet_detection_confidence",
    "bet_source" "bet_detection_source",
    "overridden_at" TIMESTAMPTZ(3),

    CONSTRAINT "open_finance_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bet_detection_bookmakers" (
    "id" UUID NOT NULL,
    "trade_name" VARCHAR(120) NOT NULL,
    "document" VARCHAR(14) NOT NULL,
    "registered_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bet_detection_bookmakers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bet_detection_classifications" (
    "transaction_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "mcc" INTEGER,
    "counterparty_document" VARCHAR(14),
    "description" TEXT NOT NULL DEFAULT '',
    "matched_by" "bet_detection_reason",
    "confidence" "bet_detection_confidence",
    "classified_at" TIMESTAMPTZ(3) NOT NULL,
    "override_verdict" "bet_detection_override_verdict",
    "override_reason" VARCHAR(280),
    "overridden_at" TIMESTAMPTZ(3),

    CONSTRAINT "bet_detection_classifications_pkey" PRIMARY KEY ("transaction_id")
);

-- CreateIndex
CREATE INDEX "open_finance_connected_accounts_user_id_idx" ON "open_finance_connected_accounts"("user_id");

-- CreateIndex
CREATE INDEX "open_finance_connected_accounts_consent_id_idx" ON "open_finance_connected_accounts"("consent_id");

-- CreateIndex
CREATE INDEX "open_finance_transactions_user_id_occurred_at_id_idx" ON "open_finance_transactions"("user_id", "occurred_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "open_finance_transactions_user_id_account_id_idx" ON "open_finance_transactions"("user_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "bet_detection_bookmakers_document_key" ON "bet_detection_bookmakers"("document");

-- CreateIndex
CREATE INDEX "bet_detection_classifications_user_id_idx" ON "bet_detection_classifications"("user_id");

-- AddForeignKey
ALTER TABLE "open_finance_connected_accounts" ADD CONSTRAINT "open_finance_connected_accounts_consent_id_fkey" FOREIGN KEY ("consent_id") REFERENCES "open_finance_consents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_finance_transactions" ADD CONSTRAINT "open_finance_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "open_finance_connected_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Accent-insensitive search over the counterparty and the institution. The
-- frontend folds accents before comparing and nobody types "Pão de Açúcar" with
-- the diacritics, so the server has to fold too.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- What the aggregates enforce in memory, enforced again here.

-- The projected verdict is all three columns or none of them: a row with a
-- reason and no confidence would render a badge the product cannot explain.
ALTER TABLE "open_finance_transactions"
  ADD CONSTRAINT "open_finance_transactions_bet_mark_is_whole" CHECK (
    ("bet_matched_by" IS NULL) = ("bet_confidence" IS NULL)
    AND ("bet_matched_by" IS NULL) = ("bet_source" IS NULL)
  );

ALTER TABLE "bet_detection_classifications"
  ADD CONSTRAINT "bet_detection_classifications_verdict_is_whole" CHECK (
    ("matched_by" IS NULL) = ("confidence" IS NULL)
  ),
  ADD CONSTRAINT "bet_detection_classifications_override_is_whole" CHECK (
    ("override_verdict" IS NULL) = ("overridden_at" IS NULL)
  );

-- A bookmaker is identified by fourteen digits and nothing else.
ALTER TABLE "bet_detection_bookmakers"
  ADD CONSTRAINT "bet_detection_bookmakers_document_is_fourteen_digits"
  CHECK ("document" ~ '^[0-9]{14}$');
