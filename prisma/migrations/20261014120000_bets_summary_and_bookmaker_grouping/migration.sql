-- CreateEnum
CREATE TYPE "bet_detection_registry_status" AS ENUM ('REGISTERED', 'UNREGISTERED');

-- AlterTable
ALTER TABLE "bet_detection_classifications" ADD COLUMN     "bookmaker_id" VARCHAR(64),
ADD COLUMN     "bookmaker_name" VARCHAR(140),
ADD COLUMN     "counterparty" VARCHAR(140) NOT NULL DEFAULT '',
ADD COLUMN     "registry_status" "bet_detection_registry_status";

-- AlterTable
ALTER TABLE "open_finance_transactions" ADD COLUMN     "bet_bookmaker_id" VARCHAR(64);

-- CreateTable
CREATE TABLE "awareness_reference_items" (
    "id" VARCHAR(40) NOT NULL,
    "singular" VARCHAR(60) NOT NULL,
    "plural" VARCHAR(60) NOT NULL,
    "unit_price_in_cents" INTEGER NOT NULL,
    "source" VARCHAR(120) NOT NULL,
    "reviewed_at" VARCHAR(10) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "awareness_reference_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bet_detection_classifications_bookmaker_idx" ON "bet_detection_classifications"("user_id", "bookmaker_id");

-- CreateIndex
CREATE INDEX "open_finance_transactions_bookmaker_idx" ON "open_finance_transactions"("user_id", "bet_bookmaker_id", "occurred_at" DESC);

-- A nullable column is a claim that the domain allows absence, and these three
-- are absent together or present together: a row nobody called a bet belongs to
-- no bookmaker, and a row that is one is always attributed.
ALTER TABLE "bet_detection_classifications"
  ADD CONSTRAINT "bet_detection_classifications_bookmaker_complete"
  CHECK (
    ("bookmaker_id" IS NULL AND "bookmaker_name" IS NULL AND "registry_status" IS NULL)
    OR ("bookmaker_id" IS NOT NULL AND "bookmaker_name" IS NOT NULL AND "registry_status" IS NOT NULL)
  );

-- An attributed row is a row the chain called a bet. The two are decided
-- together in the aggregate, and the constraint is what keeps them together
-- across concurrent requests.
ALTER TABLE "bet_detection_classifications"
  ADD CONSTRAINT "bet_detection_classifications_bookmaker_needs_verdict"
  CHECK ("bookmaker_id" IS NULL OR "matched_by" IS NOT NULL);

-- The projection cannot name a house for a row it does not mark as a bet.
ALTER TABLE "open_finance_transactions"
  ADD CONSTRAINT "open_finance_transactions_bookmaker_needs_mark"
  CHECK ("bet_bookmaker_id" IS NULL OR "bet_matched_by" IS NOT NULL);

-- An item priced at nothing would divide a total into an infinity of itself.
ALTER TABLE "awareness_reference_items"
  ADD CONSTRAINT "awareness_reference_items_unit_price_positive"
  CHECK ("unit_price_in_cents" > 0);
