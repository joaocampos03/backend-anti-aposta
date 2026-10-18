-- The bet-free streak is derived from the statement on every read (docs/features/achievements.md),
-- so the stored counters are retired. They were bootstrap rows at zero days that nothing ever
-- updated; dropping them loses no fact. Their CHECK constraints go with the table.

-- DropTable
DROP TABLE "gamification_streaks";
