# `open-finance` — consent, connected accounts and the statement

Implements the `open-finance` half of `docs/features/transactions.md`. That document's API
contract is binding: four screens are written against these shapes.

This context is the *instituição receptora*. It owns the movement — amount, instant, counterparty,
account, method, status — and nothing about why a movement might be a bet.

## What it does not hold

**The raw statement line.** There is no `description` column in `open_finance_transactions` and no
`description` field in any response. The line the bank sent lives in `bet-detection`, which is the
only context whose policies may read it. What travels instead is `Counterparty`: a normalised name
derived from that line.

**A full account number.** `MaskedAccountNumber.maskingAtIngestion` keeps the last four digits and
drops the rest at the boundary. The Open Finance spec's `GET /accounts` returns the number and the
check digit in full, so this minimisation is ours to perform — and it means there is nothing to
leak into a log or a server-rendered payload.

## The consent is the gate

`Transaction.ingest` takes a `Consent` and asks it, every time. "No financial data without an
`AUTHORISED` consent" is enforced **inside the aggregate** rather than in a use case, because a
rule that lives in one caller is a rule the next caller forgets. A consent that lapsed answers the
same as one that was refused.

`syncStatus` is computed from that consent and sent explicitly, never inferred from an empty list:

| Value | When | Why it is not just an empty array |
| --- | --- | --- |
| `NO_CONSENT` | no authorised consent, or it was revoked | A zero here would read as "you spent nothing on bets", which the data does not say |
| `SYNCING` | authorised, `lastSyncedAt` still null | A partial total is worse than no total |
| `READY` | authorised and synced | — |

## The statement is a read model

`ListTransactions` and `SummariseSpendByMonth` are queries, not aggregate hydrations. Both halves
of the ledger run against the **same `WHERE`**: the rows are one page of it, the totals are all of
it. A total computed over a page is a defect rather than an approximation — the hero figure would
move as the reader scrolls.

- **Sort** is `occurred_at DESC, id DESC`, and pagination is a tuple cursor over that pair. An
  offset would duplicate or skip rows the moment ingestion inserts anything at the top.
- **Day and month keys are `America/Sao_Paulo`**, from the injected `Calendar`. A bet at 23:30 BRT
  belongs to that day; bucketing in UTC moves it and costs somebody a streak day.
- **Search folds accents** through Postgres `unaccent`, over the counterparty and the institution.
  Never over a description, which this context does not have.

## The betting total is net of refunds

`betSpend` is debits to bookmakers **minus** credits from them, floored at zero. A refund gives the
money back, so it was never foregone, and reframing it as a lost yield would be a made-up number.
`betCount` counts bets *placed*, so a refund is not one of them.

The same rule runs in the monthly summary, which is what makes the two endpoints agree per calendar
month. In the charts the `BETS` bucket follows the **classification**, not the category a
transaction was filed under: a corrected row leaves the series, or a correction would change the
statement and not the chart.

## The projection

The three `bet_*` columns on `open_finance_transactions` are a **copy** of `bet-detection`'s
verdict, refreshed by `ProjectClassification` on that context's events. They exist so the statement
can filter and total in one query instead of joining across a boundary — and the subscriber
re-reads the owning context rather than trusting a payload.

If `bet-detection` adds a policy, the `BetMarkReason` union here fails to compile. That is the
point at which somebody decides what the statement should show for it.

## Connecting an institution

This context is the OAuth client. The DataHolder today is `sandbox-bank`, reached **only over
HTTP** through `SandboxBankDataHolder` and `open-finance-brasil.wire.ts` — the anti-corruption
layer. Every field name of the specification is spelled in those two files and nowhere else.

| Step | Endpoint | Use case |
| --- | --- | --- |
| Start | `POST /api/v1/consents` | `RequestConsent`: registers at the bank, keeps `state` + PKCE verifier, answers the authorisation URL |
| Callback | `POST /api/v1/consents/{id}/authorisation` | `CompleteAuthorisation`: checks `state`, exchanges the code, authorises, first sync |
| Refresh | `POST /api/v1/consents/{id}/synchronisation` | `SynchroniseConsent`: refreshes the token if needed, ingests what is new |
| Withdraw | `POST /api/v1/consents/{id}/revocation` | `RevokeConsent`: `ConsentRevoked` → purge; then tells the bank, best effort |
| Read | `GET /api/v1/consents/current` | `GetCurrentConsent` |

- **One authorised consent at a time.** A second `POST /consents` answers `409
  CONSENT_ALREADY_AUTHORISED`.
- **A `state` mismatch records nothing**, not even the attempt: the authorisation request stays
  pending and nothing is exchanged.
- **Tokens and the PKCE verifier are AES-256-GCM encrypted at rest** (`AesGcmTokenCipher`, key from
  `OPEN_FINANCE_TOKEN_KEY`), decrypted only in `infrastructure/`.
- **Revocation does not wait for the bank.** The purge runs first; the bank is told after, and its
  failure does not undo the person's withdrawal. Revocation is deliberately not rate limited.
- A consent lasts **180 days** (`CONSENT_LIFETIME_IN_DAYS`), an assumed default under the
  specification's twelve-month cap.

## Synchronisation

`StatementSynchronisation` pulls the shared accounts, then each statement over twelve months back
and a month forward, and ingests only DataHolder ids not already on that account (unique on
`(account_id, external_id)`). Synchronising twice ingests nothing the second time, which is why the
endpoint needs no `Idempotency-Key`.

Each new transaction goes through `Transaction.ingest` (the consent gate), then is handed to
`bet-detection.ClassifyTransaction` **by direct call** through the `TransactionClassifier` port.
That is the second sanctioned direct call between contexts: the statement line and the counterparty
document must not travel on the bus, whose payloads are ids only. They pass through this context's
memory and are never stored here.

**The category is inferred** (`category-inference.ts`): the specification sends none. An MCC we
know names it; otherwise a credit is `INCOME`, a PIX or transfer is `TRANSFER`, anything else
`OTHER`. It never infers `BETS` — whether a movement is a bet is the classification's call, and
every figure already follows the classification. The table is an assumed default.

Not handled: an entry booked as `LANCAMENTO_FUTURO` that later settles is not re-read, because the
sandbox never settles one. A real DataHolder would need `Transaction.settle` wired in here.

`IngestTransactions` remains for the integration fixtures, which arrange a statement without running
the OAuth flow for every test. It is not the product's ingestion path.
