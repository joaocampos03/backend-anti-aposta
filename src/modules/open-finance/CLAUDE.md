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

## Still missing

The OAuth flow against a DataHolder, the `sandbox-bank` context, and the HTTP ingestion that
`IngestTransactions` is waiting behind — it has no route today and is called by the seed and by the
integration fixture. Revocation has a use case and a subscriber but no endpoint: nothing emits
`ConsentRevoked` outside a test.
