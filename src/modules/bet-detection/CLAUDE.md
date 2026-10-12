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

## Error codes this module owns

`TRANSACTION_NOT_FOUND` (404, and the same answer for another user's transaction) ·
`NOT_CLASSIFIED_AS_BET` (422) · `ALREADY_OVERRIDDEN` (409) · `OVERRIDE_NOT_FOUND` (404) ·
`VALIDATION_FAILED` (422) · `TOO_MANY_ATTEMPTS` (429).

## Still missing

Nothing consumes `BetTransactionDetected` beyond `open-finance`'s projection: the awareness nudge
and the streak break arrive with their own features. The reverse correction ("this *was* a bet")
is deliberately not modelled — `verdict` is an enum with one member so that adding it later is a
widening rather than a change of shape.
