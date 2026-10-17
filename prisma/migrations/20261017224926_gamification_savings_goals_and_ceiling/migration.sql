-- CreateEnum
CREATE TYPE "gamification_goal_purpose" AS ENUM ('EMERGENCY_FUND', 'DEBT_PAYOFF', 'HOME', 'EDUCATION', 'TRAVEL', 'VEHICLE', 'HEALTH', 'OTHER');

-- CreateEnum
CREATE TYPE "gamification_movement_direction" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

-- CreateTable
CREATE TABLE "gamification_savings_goals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(60) NOT NULL,
    "purpose" "gamification_goal_purpose" NOT NULL,
    "target_in_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "reached_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "gamification_savings_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gamification_goal_movements" (
    "id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "direction" "gamification_movement_direction" NOT NULL,
    "amount_in_cents" INTEGER NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "reached_target" BOOLEAN NOT NULL DEFAULT false,
    "idempotency_key" VARCHAR(64),

    CONSTRAINT "gamification_goal_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gamification_betting_ceilings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "gamification_betting_ceilings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gamification_ceiling_terms" (
    "id" UUID NOT NULL,
    "ceiling_id" UUID NOT NULL,
    "amount_in_cents" INTEGER NOT NULL,
    "destination" VARCHAR(60),
    "effective_from" CHAR(7) NOT NULL,
    "set_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "gamification_ceiling_terms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gamification_savings_goals_user_id_created_at_id_idx" ON "gamification_savings_goals"("user_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "gamification_goal_movements_goal_id_occurred_at_id_idx" ON "gamification_goal_movements"("goal_id", "occurred_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "gamification_goal_movements_goal_id_idempotency_key_key" ON "gamification_goal_movements"("goal_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "gamification_betting_ceilings_user_id_key" ON "gamification_betting_ceilings"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "gamification_ceiling_terms_ceiling_id_effective_from_key" ON "gamification_ceiling_terms"("ceiling_id", "effective_from");

-- AddForeignKey
ALTER TABLE "gamification_goal_movements" ADD CONSTRAINT "gamification_goal_movements_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "gamification_savings_goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gamification_ceiling_terms" ADD CONSTRAINT "gamification_ceiling_terms_ceiling_id_fkey" FOREIGN KEY ("ceiling_id") REFERENCES "gamification_betting_ceilings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
