-- Sign-in, sign-out and password reset.
--
-- `last_used_at` is added the additive way — add nullable, backfill, then
-- enforce — so an existing session survives the deploy instead of blocking it.

ALTER TABLE "identity_sessions" ADD COLUMN "last_used_at" TIMESTAMPTZ(3);
UPDATE "identity_sessions" SET "last_used_at" = "issued_at" WHERE "last_used_at" IS NULL;
ALTER TABLE "identity_sessions" ALTER COLUMN "last_used_at" SET NOT NULL;

-- The attempt window for one address.
--
-- There is no "locked" column here, and there must never be one: an attacker
-- who knows an address could otherwise lock a real person out of their own
-- financial history by guessing wrong five times. The window delays an attempt;
-- it never denies one, and it needs no administrative unlock.
--
-- The address is stored as a SHA-256, so this table cannot be read as a list of
-- the people who tried to sign in to a product about gambling.
CREATE TABLE "identity_sign_in_attempts" (
    "identifier_hash" VARCHAR(64) NOT NULL,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "first_failure_at" TIMESTAMPTZ(3),
    "blocked_until" TIMESTAMPTZ(3),

    CONSTRAINT "identity_sign_in_attempts_pkey" PRIMARY KEY ("identifier_hash")
);

-- Single use, 60-minute TTL, stored hashed: a database dump must not yield
-- usable reset links.
CREATE TABLE "identity_password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),

    CONSTRAINT "identity_password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "identity_password_reset_tokens_token_hash_key" ON "identity_password_reset_tokens"("token_hash");

CREATE INDEX "identity_password_reset_tokens_user_id_idx" ON "identity_password_reset_tokens"("user_id");

ALTER TABLE "identity_password_reset_tokens" ADD CONSTRAINT "identity_password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- What the aggregates enforce in memory, enforced again here.
ALTER TABLE "identity_sessions"
  ADD CONSTRAINT "identity_sessions_used_after_issue" CHECK ("last_used_at" >= "issued_at");

ALTER TABLE "identity_sign_in_attempts"
  ADD CONSTRAINT "identity_sign_in_attempts_failure_count_not_negative" CHECK ("failure_count" >= 0);

ALTER TABLE "identity_password_reset_tokens"
  ADD CONSTRAINT "identity_password_reset_tokens_expires_after_issue" CHECK ("expires_at" > "issued_at"),
  ADD CONSTRAINT "identity_password_reset_tokens_consumed_after_issue" CHECK ("consumed_at" IS NULL OR "consumed_at" >= "issued_at");
