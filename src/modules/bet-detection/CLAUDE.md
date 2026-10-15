# `bet-detection` — deciding whether a transaction is a bet, and saying why

Implements the `bet-detection` half of `docs/features/transactions.md`.

## Never a bare boolean

A classification carries `matchedBy`, `confidence` and `source` — in the domain and on the wire.
Somebody who sees a grocery run labelled "Aposta" with no explanation stops trusting the hero
figure, the charts, the streak and the goal in one go, so the reason travels with the verdict
everywhere it goes.

## The chain

Strongest first. `matchedBy` is the **strongest** policy that matched, because that is the reason
worth explaining; `confidence` is the **lowest** of all that matched, because uncertainty has to
survive the journey to the screen. A false positive here is worse than a false negative.

| Policy | Signal | Confidence | Why that confidence |
| --- | --- | --- | --- |
| `GAMBLING_MCC` | MCC 7995 | `HIGH` | Assigned by the acquirer under an international standard, not by us |
| `LICENSED_CNPJ` | the bookmaker registry | `MEDIUM` | Ours to keep current: an operator we have not listed is one this policy cannot see |
| `DESCRIPTION_KEYWORD` | words in the statement line | `LOW` | "bet" appears in plenty of names that have nothing to do with gambling — matched as a whole word only, so "Betânia" is left alone |

The `HIGH`/`MEDIUM`/`LOW` assignment is an **assumed default**: the handoff fixes the order of
strength and that `DESCRIPTION_KEYWORD` can never be `HIGH`, but not which policy is `MEDIUM`.

`GAMBLING_MCC = 7995` is declared **once**, in `policies/gambling-mcc.policy.ts`. It is not
exported from `index.ts` and never reaches a response: the frontend renders the label "MCC 7995"
from the enum.

## The raw statement line stops here

`DetectionSignals` holds the description, and `bet_detection_classifications.description` is the
only column in the database that has one. It reaches no response, no event payload and no log
line. `open-finance` answers with a normalised counterparty instead.

Revoking a consent deletes these rows, which is also what deletes the only copy of those lines.

## A correction outranks the chain

`TransactionClassification` is one aggregate per transaction — its id **is** the transaction's id —
holding the signals, the chain's verdict and the person's correction. `effectiveClassification`
is what the rest of the product sees, and an override wins permanently: re-running the chain after
a re-ingestion never overturns somebody's own verdict.

Undoing a correction **re-reads** the chain rather than restoring the verdict it remembered. The
registry is resolved fresh, so a bookmaker added since yields the current answer — a remembered
verdict would quietly preserve a judgement the product has changed its mind about.

No message on this path disputes the correction. "Nossa classificação está correta" is not an
available response.

## What counts as one bookmaker

`BookmakerIdentity` is resolved every time the chain runs, and re-resolved when it runs again: a
house the registry gained since is a registered house from that moment on.

- **Registered** — the CNPJ is in the registry. The id is the registry row's, so two spellings of
  one operator ("BETANO", "Betano\*Pix") are one house, under the registry's name.
- **Unregistered** — a match on MCC or on a keyword alone. The id is an FNV-1a digest of the
  `CounterpartyKey` (case folded, accent stripped, acquirer tag after `*` dropped, payment-processor
  words removed), so the grouping is identical on every request and in every process.

`RegistryStatus` is on the wire although no screen shows it: an unregistered grouping can merge two
similarly named houses or split one house's two spellings, and the paper has to be able to say how
often that happened. **The CNPJ itself never crosses the boundary** — it is the registry's key, and
`index.ts` does not export `Cnpj`.

## The betting summary is this module's, and it composes the other two

`SummariseBetting` owns `GET /bets/summary`. It reads the amounts, the instants and the income from
`open-finance`'s public API and the rate and the equivalence catalogue from `awareness`'s, and the
grouping, the counts, the tallies and the hours are its own. Two properties are load-bearing and
both have tests:

- **Every figure describes the same window**, so no two sections of the screen can disagree.
- **`cost.total` equals the statement's `totals.betSpend`** for the same window, to the cent. The
  entries come from the same projected columns `type=BETS` filters by, so the two are the same
  number rather than two computations that usually agree.

Three counting rules, and they are not interchangeable:

1. **The total is net** — debits to houses minus credits from them, floored at zero. A refund gives
   the money back, so it was never foregone.
2. **Counts, tallies and hours describe bets placed.** A refund nets off a total and adds no
   transaction, no policy match and no hour of day.
3. **A confidence travels with the reason that earned it.** `weakest` is the lowest confidence
   among a house's rows together with the `matchedBy` of a row that actually has it, breaking ties
   toward the weaker policy. Pairing one policy's reason with another's confidence is how a reader
   comes to believe a figure is firmer than it is.

Hours are São Paulo bands and carry a count and nothing else. No field labels a band as late, risky
or problematic: the product has seen a statement and is in no position to diagnose anybody from
eight integers.

## Error codes this module owns

`TRANSACTION_NOT_FOUND` (404, and the same answer for another user's transaction) ·
`NOT_CLASSIFIED_AS_BET` (422) · `ALREADY_OVERRIDDEN` (409) · `OVERRIDE_NOT_FOUND` (404) ·
`VALIDATION_FAILED` (422, also the answer to a `days` the screen does not offer) ·
`TOO_MANY_ATTEMPTS` (429).

## Still missing

Nothing consumes `BetTransactionDetected` beyond `open-finance`'s projection: the awareness nudge
and the streak break arrive with their own features. The reverse correction ("this *was* a bet")
is deliberately not modelled — `verdict` is an enum with one member so that adding it later is a
widening rather than a change of shape.

The summary is computed on read, so every event reaches it for free. If it is ever materialised,
`TransactionsIngested`, `BetTransactionDetected`, `BetClassificationOverridden`, `ConsentRevoked`,
a registry update and a catalogue or rate change all have to invalidate it.
