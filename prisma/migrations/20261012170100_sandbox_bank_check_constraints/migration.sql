-- Written by hand: Prisma cannot express CHECK constraints, and does not track
-- them, so they cause no drift. Each one enforces in the database what an
-- aggregate already enforces in memory.

-- LedgerEntry: a movement of nothing is not a movement.
ALTER TABLE "sandbox_bank_ledger_entries"
  ADD CONSTRAINT "sandbox_bank_ledger_entries_amount_not_zero"
  CHECK ("amount_in_cents" <> 0);

-- LedgerEntry: an MCC is a four-digit ISO 18245 code.
ALTER TABLE "sandbox_bank_ledger_entries"
  ADD CONSTRAINT "sandbox_bank_ledger_entries_mcc_within_range"
  CHECK ("merchant_category_code" IS NULL OR "merchant_category_code" BETWEEN 0 AND 9999);

-- Consent (sandbox-bank): it cannot lapse before it was created.
ALTER TABLE "sandbox_bank_consents"
  ADD CONSTRAINT "sandbox_bank_consents_expires_after_creation"
  CHECK ("expires_at" > "created_at");

-- Consent (sandbox-bank): an authorised consent names whose accounts it shares,
-- and shares at least one.
ALTER TABLE "sandbox_bank_consents"
  ADD CONSTRAINT "sandbox_bank_consents_authorised_names_its_accounts"
  CHECK (
    "status" <> 'AUTHORISED'
    OR ("customer_id" IS NOT NULL AND cardinality("account_ids") > 0)
  );

-- AuthorisationRequest (open-finance): it cannot expire before it was opened.
ALTER TABLE "open_finance_authorisation_requests"
  ADD CONSTRAINT "open_finance_authorisation_requests_expires_after_creation"
  CHECK ("expires_at" > "created_at");
