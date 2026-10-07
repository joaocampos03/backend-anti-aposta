-- Invariants that must hold across concurrent requests are enforced both in the
-- aggregate and by a constraint. Prisma cannot express CHECK, so this migration is
-- hand written; it introduces no schema change Prisma tracks, so it causes no drift.

-- A streak counts days already lived through: it can never be negative, and the
-- longest streak can never be shorter than the current one.
ALTER TABLE "gamification_streaks"
  ADD CONSTRAINT "gamification_streaks_current_days_not_negative" CHECK ("current_days" >= 0),
  ADD CONSTRAINT "gamification_streaks_longest_days_not_negative" CHECK ("longest_days" >= 0),
  ADD CONSTRAINT "gamification_streaks_longest_days_covers_current" CHECK ("longest_days" >= "current_days");

-- Email is stored normalised (trimmed, lower cased) so the unique index above is a
-- case-insensitive uniqueness guarantee. This constraint is what keeps it true.
ALTER TABLE "identity_users"
  ADD CONSTRAINT "identity_users_email_is_normalised" CHECK ("email" = lower(btrim("email"))),
  ADD CONSTRAINT "identity_users_display_name_within_bounds" CHECK (char_length("display_name") BETWEEN 2 AND 80);

-- A session that expires before it was issued is not a session.
ALTER TABLE "identity_sessions"
  ADD CONSTRAINT "identity_sessions_expires_after_issue" CHECK ("expires_at" > "issued_at");
