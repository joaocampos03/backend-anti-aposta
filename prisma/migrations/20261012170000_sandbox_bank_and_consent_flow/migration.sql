-- CreateEnum
CREATE TYPE "sandbox_bank_account_type" AS ENUM ('CONTA_DEPOSITO_A_VISTA', 'CARTAO_CREDITO');

-- CreateEnum
CREATE TYPE "sandbox_bank_entry_type" AS ENUM ('PIX', 'TED', 'BOLETO', 'CONVENIO_ARRECADACAO', 'CARTAO', 'FOLHA_PAGAMENTO', 'TRANSFERENCIA_MESMA_INSTITUICAO');

-- CreateEnum
CREATE TYPE "sandbox_bank_entry_status" AS ENUM ('TRANSACAO_EFETIVADA', 'LANCAMENTO_FUTURO');

-- CreateEnum
CREATE TYPE "sandbox_bank_consent_status" AS ENUM ('AWAITING_AUTHORISATION', 'AUTHORISED', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "sandbox_bank_permission" AS ENUM ('ACCOUNTS_READ', 'ACCOUNTS_TRANSACTIONS_READ', 'RESOURCES_READ');

-- CreateEnum
CREATE TYPE "sandbox_bank_token_kind" AS ENUM ('ACCESS', 'REFRESH');

-- CreateEnum
CREATE TYPE "sandbox_bank_token_scope" AS ENUM ('CONSENTS', 'ACCOUNTS');

-- AlterTable: add, backfill, then require. Rows written before this migration
-- were never fetched from a DataHolder, so their own id is the only external id
-- they have; nothing will ever synchronise against it.
ALTER TABLE "open_finance_connected_accounts" ADD COLUMN "external_id" VARCHAR(100);
UPDATE "open_finance_connected_accounts" SET "external_id" = "id"::text WHERE "external_id" IS NULL;
ALTER TABLE "open_finance_connected_accounts" ALTER COLUMN "external_id" SET NOT NULL;

-- AlterTable: add, backfill, then require. Rows written before this migration
-- were never fetched from a DataHolder, so their own id is the only external id
-- they have; nothing will ever synchronise against it.
ALTER TABLE "open_finance_consents" ADD COLUMN "external_consent_id" VARCHAR(100);
UPDATE "open_finance_consents" SET "external_consent_id" = "id"::text WHERE "external_consent_id" IS NULL;
ALTER TABLE "open_finance_consents" ALTER COLUMN "external_consent_id" SET NOT NULL;

-- AlterTable: add, backfill, then require. Rows written before this migration
-- were never fetched from a DataHolder, so their own id is the only external id
-- they have; nothing will ever synchronise against it.
ALTER TABLE "open_finance_transactions" ADD COLUMN "external_id" VARCHAR(100);
UPDATE "open_finance_transactions" SET "external_id" = "id"::text WHERE "external_id" IS NULL;
ALTER TABLE "open_finance_transactions" ALTER COLUMN "external_id" SET NOT NULL;

-- CreateTable
CREATE TABLE "open_finance_authorisation_requests" (
    "consent_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "state_fingerprint" VARCHAR(64) NOT NULL,
    "code_verifier_ciphertext" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "open_finance_authorisation_requests_pkey" PRIMARY KEY ("consent_id")
);

-- CreateTable
CREATE TABLE "open_finance_consent_tokens" (
    "consent_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "access_token_ciphertext" TEXT NOT NULL,
    "refresh_token_ciphertext" TEXT NOT NULL,
    "access_token_expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "open_finance_consent_tokens_pkey" PRIMARY KEY ("consent_id")
);

-- CreateTable
CREATE TABLE "sandbox_bank_accounts" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "type" "sandbox_bank_account_type" NOT NULL,
    "brand_name" VARCHAR(80) NOT NULL,
    "company_cnpj" VARCHAR(14) NOT NULL,
    "compe_code" VARCHAR(3) NOT NULL,
    "branch_code" VARCHAR(4) NOT NULL,
    "number" VARCHAR(20) NOT NULL,
    "check_digit" VARCHAR(1) NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sandbox_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sandbox_bank_ledger_entries" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "booked_at" TIMESTAMPTZ(3) NOT NULL,
    "amount_in_cents" INTEGER NOT NULL,
    "transaction_name" VARCHAR(140) NOT NULL,
    "type" "sandbox_bank_entry_type" NOT NULL,
    "status" "sandbox_bank_entry_status" NOT NULL,
    "merchant_category_code" INTEGER,
    "payee_document" VARCHAR(14),

    CONSTRAINT "sandbox_bank_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sandbox_bank_consents" (
    "id" UUID NOT NULL,
    "client_id" VARCHAR(64) NOT NULL,
    "status" "sandbox_bank_consent_status" NOT NULL,
    "permissions" "sandbox_bank_permission"[],
    "customer_id" UUID,
    "account_ids" UUID[],
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "status_updated_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sandbox_bank_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sandbox_bank_authorisation_codes" (
    "id" UUID NOT NULL,
    "code_fingerprint" VARCHAR(64) NOT NULL,
    "consent_id" UUID NOT NULL,
    "client_id" VARCHAR(64) NOT NULL,
    "redirect_uri" VARCHAR(500) NOT NULL,
    "code_challenge" VARCHAR(128) NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "redeemed_at" TIMESTAMPTZ(3),

    CONSTRAINT "sandbox_bank_authorisation_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sandbox_bank_issued_tokens" (
    "id" UUID NOT NULL,
    "token_fingerprint" VARCHAR(64) NOT NULL,
    "kind" "sandbox_bank_token_kind" NOT NULL,
    "scope" "sandbox_bank_token_scope" NOT NULL,
    "client_id" VARCHAR(64) NOT NULL,
    "consent_id" UUID,
    "issued_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "sandbox_bank_issued_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "open_finance_authorisation_requests_user_id_idx" ON "open_finance_authorisation_requests"("user_id");

-- CreateIndex
CREATE INDEX "open_finance_consent_tokens_user_id_idx" ON "open_finance_consent_tokens"("user_id");

-- CreateIndex
CREATE INDEX "sandbox_bank_accounts_customer_id_idx" ON "sandbox_bank_accounts"("customer_id");

-- CreateIndex
CREATE INDEX "sandbox_bank_ledger_entries_account_id_booked_at_id_idx" ON "sandbox_bank_ledger_entries"("account_id", "booked_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "sandbox_bank_consents_client_id_idx" ON "sandbox_bank_consents"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "sandbox_bank_authorisation_codes_code_fingerprint_key" ON "sandbox_bank_authorisation_codes"("code_fingerprint");

-- CreateIndex
CREATE INDEX "sandbox_bank_authorisation_codes_consent_id_idx" ON "sandbox_bank_authorisation_codes"("consent_id");

-- CreateIndex
CREATE UNIQUE INDEX "sandbox_bank_issued_tokens_token_fingerprint_key" ON "sandbox_bank_issued_tokens"("token_fingerprint");

-- CreateIndex
CREATE INDEX "sandbox_bank_issued_tokens_consent_id_idx" ON "sandbox_bank_issued_tokens"("consent_id");

-- CreateIndex
CREATE UNIQUE INDEX "open_finance_connected_accounts_consent_id_external_id_key" ON "open_finance_connected_accounts"("consent_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "open_finance_transactions_account_id_external_id_key" ON "open_finance_transactions"("account_id", "external_id");

-- AddForeignKey
ALTER TABLE "open_finance_authorisation_requests" ADD CONSTRAINT "open_finance_authorisation_requests_consent_id_fkey" FOREIGN KEY ("consent_id") REFERENCES "open_finance_consents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_finance_consent_tokens" ADD CONSTRAINT "open_finance_consent_tokens_consent_id_fkey" FOREIGN KEY ("consent_id") REFERENCES "open_finance_consents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sandbox_bank_ledger_entries" ADD CONSTRAINT "sandbox_bank_ledger_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "sandbox_bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

