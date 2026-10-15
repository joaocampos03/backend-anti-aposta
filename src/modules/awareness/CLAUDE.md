# `awareness` — the reframing and the support offer

Implements the `awareness` half of `docs/features/transactions.md`.

## The rate lives here, and travels with every figure

`FIXED_INCOME_ANNUAL_RATE_PERCENT = 11.4` is this context's configuration. `YieldEquivalent`
carries the rate it used and the horizon it projected over, because an unlabelled projection is a
made-up number, and the copy presents it as an estimate and never as a guarantee of return.

The frontend computes this in four places today, from a constant duplicated twice. That is how two
screens came to show different figures for the same money, and it is why `AmountReframing` is
published to the rest of the monolith rather than reimplemented per caller.

**This is required coverage.** `yield-equivalent.spec.ts` pins the figures the screens show; a
wrong number here discredits every screen that shows one.

## The support offer counts and then stops

Three consecutive **whole** months at or above R$ 1.000,00 in bets. The current month never counts:
it is incomplete by definition, and half a month above the floor is not a month above it.

The rule is conservative on purpose, and **its negative cases are the ones that matter**: a missed
offer costs one screen, while a false one tells somebody they may have a problem they do not have,
on the evidence of a bank statement alone. `support-offer.spec.ts` tests the negatives first.

The response carries `shouldOffer`, `sustainedMonths`, `isRising` and `thresholdInCents` — counts
and a threshold, so the copy and the rule cannot disagree. There is **no** risk level, no severity
and no recommendation: the product has seen a statement and is in no position to say what it means
about anyone. The card says so in as many words.

Two things the endpoint deliberately does not do:

- **It takes no window and no filter.** Whether somebody is shown a crisis line cannot depend on
  which chart option they happen to have selected.
- **It is never suppressed server-side.** Dismissal lasts a browsing session and lives in the
  browser. A permanent, server-side hide would bury a crisis line behind one stray click.

A failure renders nothing rather than an error: a broken support card must not become an alarming
message, and the contacts are permanently available in the footer and the auth layout.

## Equivalences invent nothing, and say where each number came from

`DescribeEquivalences` says an amount in something other than money, in two kinds that are
deliberately **kept apart** on the wire. Interleaving them into one list would blur which figures
came from the reader's statement and which came from ours.

- **`OWN_SPENDING`** — whole months of one of their own categories, at their own average. The
  average covers **complete** months only, and `completeMonthsCounted` travels with it so the
  detail line can say what it covers. Including the current partial month deflates the average and
  inflates every "N meses de mercado" on the screen, which is exactly what the frontend fixture did.
- **`REFERENCE_PRICE`** — a quantity of a `ReferenceItem`, with the target a goal for it would have.
  `target = quantity × unitPrice`, always: a goal prefilled with a different number than the card
  just named would be a lie of its own.

Both are `floor`, and anything below one whole unit is **absent** rather than listed at zero. No
quantity is ever rounded up: "2,7 passagens" is a number nobody can picture, and rounding it would
overstate what the money was worth.

`ReferenceItem` is seeded configuration, like the bookmaker registry — a price is corrected in the
table, not in a deploy. Every row carries its `source` and the day it was last `reviewedAt`, because
these are rounded estimates chosen to make an amount legible and not researched figures, and a card
that cannot say so goes stale without anybody noticing. The screen labels them as approximations.

The category averages are **`open-finance`'s** figures, read through its public API by
`OpenFinanceCategoryAverageReader`; this context only turns them into months. A transaction
classified as a bet never counts towards another category's average, exactly as on the charts — a
betting total compared against a grocery average that quietly included betting would be comparing
the money with itself.

## Still missing

The nudges themselves (`AwarenessNudge`, the SSE push) and the `Reframing` aggregate behind them.
This context currently publishes arithmetic, a catalogue and one policy; the intervention arrives
with its own feature.
