# `gamification` — sustaining the change

Self-Determination Theory, not points. Implements `docs/features/goals.md` (the Metas screen) plus
the registration bootstrap of `Streak` and `BadgeCollection`.

## Two kinds of goal, kept apart on purpose

| | `SavingsGoal` | `BettingCeiling` |
| --- | --- | --- |
| Figure comes from | the user, who records each movement | the statement, measured on read |
| Can be wrong because | a deposit was not logged | the classifier missed a bet |
| Resource | `/savings-goals` | `/betting-ceiling` |

Never merge them into one figure, and never let savings copy borrow the certainty the ceiling has.

## `SavingsGoal` — a ledger the person keeps

- **The balance is summed from `GoalMovement`s, never stored.** Movements are append-only: a wrong
  entry is answered by another one. `PrismaSavingsGoalLedgerQuery` sums the same rows in SQL for the
  list, and both paths go through `GoalProgress`, so the card after a deposit cannot disagree with
  the card on reload.
- **A withdrawal above the balance is refused in the aggregate** (`INSUFFICIENT_BALANCE`), and the
  `version` column makes two racing withdrawals unable to both pass that check — the loser gets
  `409 GOAL_MODIFIED_CONCURRENTLY`. There is an integration test that races them.
- **`reachedTarget` is decided here, once per goal.** The deposit that first carries the balance past
  the target is marked and records `SavingsGoalReached`; `reached_at` is then never cleared. A goal
  drawn down and refilled is not reached twice — no applause on repeat, and nothing at 90%.
  `isReached` on the wire is the *current* state; `reachedAt` is the first time.
- **`Idempotency-Key`** on recording a movement is stored on the movement. A replay with the same
  body answers the original (same `reachedNow`); a different body is `409 IDEMPOTENCY_KEY_REUSED`.

## `BettingCeiling` — a decision, measured against the statement

- One aggregate per user holding every `CeilingTerm` it has had (`effective_from` is a São Paulo
  `YYYY-MM`). Closed months stay measured against the ceiling in force in them.
- **The month under way keeps its ceiling.** A replacement is scheduled for next month; choosing
  again replaces the scheduled one; choosing the value in force cancels it. **The first ceiling
  applies at once** — there is no outcome under way to rewrite. *Assumed default:* the frontend's
  `SetCeilingAction` note fixes the replacement rule; the first-ceiling case was not specified.
- `CeilingCycle.measure` and `CeilingSimulation` are pure domain services. Months come from
  `open-finance`'s `SummariseSpendByMonth` — **the charts' own use case** — through
  `OpenFinanceMonthlyBetHistoryReader`, so the ceiling, the charts and the statement report one
  figure per month. A month with no data has no cycle and is not simulated; the open month with a
  ready statement and no movement yet is a measured zero.
- The simulator is precomputed per slider step (≤ 200 steps) with the yield from `awareness`, so the
  client computes nothing. It answers in counts and differences, never in advice.
- `NO_CONSENT` / `SYNCING` return the user's own ceiling and no measured figure.

## Not done yet

`Streak` extension/breaking and badge awarding are still bootstrap only. `SavingsGoalReached` and
`BettingCeilingSet` have no subscribers; no notification is pushed for a reached goal because the
person who reached it already sees `reachedNow` on their own request.
