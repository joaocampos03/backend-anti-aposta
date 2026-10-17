-- The invariants `SavingsGoal` and `BettingCeiling` enforce in memory, enforced
-- again where concurrent requests meet. Prisma cannot express CHECK, so this
-- migration is hand written; it introduces no schema change Prisma tracks.

-- `GoalTitle`: the user's words, stored trimmed, 3 to 60 characters.
-- `GoalAmount`: strictly positive integer cents, at most R$ 10.000.000,00.
ALTER TABLE "gamification_savings_goals"
  ADD CONSTRAINT "gamification_savings_goals_title_within_bounds"
    CHECK ("title" = btrim("title") AND char_length("title") BETWEEN 3 AND 60),
  ADD CONSTRAINT "gamification_savings_goals_target_within_bounds"
    CHECK ("target_in_cents" > 0 AND "target_in_cents" <= 1000000000);

-- A movement of nothing is not one; the direction carries the sign, never the amount.
ALTER TABLE "gamification_goal_movements"
  ADD CONSTRAINT "gamification_goal_movements_amount_within_bounds"
    CHECK ("amount_in_cents" > 0 AND "amount_in_cents" <= 1000000000);

-- `CeilingAmount`: zero is a real ceiling, a negative is not.
-- `CeilingDestination`: absent, or the user's trimmed words.
-- `effective_from` is a São Paulo month key.
ALTER TABLE "gamification_ceiling_terms"
  ADD CONSTRAINT "gamification_ceiling_terms_amount_within_bounds"
    CHECK ("amount_in_cents" >= 0 AND "amount_in_cents" <= 1000000000),
  ADD CONSTRAINT "gamification_ceiling_terms_destination_not_blank"
    CHECK ("destination" IS NULL OR ("destination" = btrim("destination") AND char_length("destination") BETWEEN 1 AND 60)),
  ADD CONSTRAINT "gamification_ceiling_terms_effective_from_is_a_month"
    CHECK ("effective_from" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
