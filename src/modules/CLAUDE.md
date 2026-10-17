# `src/modules` — module anatomy and the event map

## What exists today

| Context         | State                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------- |
| `identity`      | **Implemented**: `User`, `Session`, `Credential`, `RegistrationConsent`, `SignInThrottle`, `PasswordResetToken` — registration, sign-in, sign-out, session resolution and password reset. Recovery *requests* wait on a mail decision. |
| `gamification`  | **Goals implemented**: `SavingsGoal` (self-reported ledger, `/savings-goals`) and `BettingCeiling` (`/betting-ceiling`, measured against `open-finance`'s monthly summary, reframed by `awareness`). `Streak` and `BadgeCollection` are still bootstrap only — no scoring, no awarding yet. |
| `notifications` | **Implemented**: `Inbox` and `Notification`, persisted and pushed per user over SSE (`GET /notifications/stream`, replay by `Last-Event-ID`); announces `TransactionsIngested`; a demo-only console that sends to a user by id. Nudges and badges arrive from their own features. |
| `open-finance`  | **Implemented**: `Consent`, `AuthorisationRequest`, `ConnectedAccount`, `Transaction`; the OAuth 2.0 + PKCE client against the DataHolder, synchronisation over HTTP, revocation; the statement and the charts as read models. |
| `bet-detection` | **Implemented**: the three-policy chain, `Bookmaker`, `TransactionClassification` and the correction; `BookmakerIdentity` and the betting summary (`GET /bets/summary`), which it composes from the other two contexts. The only context that may read a raw statement line, and the only one that knows a CNPJ. |
| `awareness`     | **Implemented**: `YieldEquivalent` (the compound-interest service and the rate), `SupportOffer`, and the equivalence catalogue (`ReferenceItem`, `SpendingEquivalence`). Nudges arrive with their own feature. |
| `sandbox-bank`  | **Implemented**: the simulated DataHolder — `BankAccount`, `LedgerEntry`, its own `Consent`, `AuthorisationCode`, `IssuedToken`; the Open Finance surface under `/sandbox`; a "resources changed" notice to the DataRecipient over HTTP after a booking. A foreign system: nothing imports it. |

## The rules that get broken most

1. **One way in.** A module imports another only through its `index.ts`. ESLint enforces it; the one
   exception is `src/container.ts`, the composition root.
2. **No foreign keys across contexts.** `gamification_streaks.user_id` is a raw `uuid` with no
   relation to `identity_users`. Cascade deletion across contexts is a use case with tests, not a
   database trigger.
3. **Events, not calls.** A direct call is acceptable only where an event cannot do the job — today
   there are exactly two, each through the caller's own port and an adapter that is the
   anti-corruption layer:
   - `identity` asking `open-finance` for `hasAuthorisedConsent`, a synchronous query it cannot
     proceed without;
   - `open-finance` handing each ingested transaction to `bet-detection.ClassifyTransaction` with
     the raw statement line, which must never ride on the bus.

   `sandbox-bank` is not an exception to anything: no module calls it. `open-finance` reaches it
   over HTTP.
4. **Idempotent subscribers.** The same event delivered twice produces the same state. Every
   bootstrap use case checks for the aggregate before creating it, and has a test that says so.

## Event map

```
identity.RegisterUser
  -> UserRegistered { userId, registeredAt }          # no name, no e-mail
       -> gamification.StartStreak                    # zero days, never day one
       -> gamification.CreateBadgeCollection          # empty; participation is not a milestone
       -> notifications.CreateInbox                   # empty; no welcome message; delivery needs it

identity.SignIn        -> UserSignedIn    { userId, sessionId, signedInAt }
identity.SignOut       -> UserSignedOut   { userId, sessionId, signedOutAt }
identity.ResetPassword -> PasswordChanged { userId, changedAt }

sandbox-bank  --HTTP (OAuth 2.0 + PKCE, Open Finance Brasil)-->  open-finance

sandbox-bank.RecordLedgerEntry
  --HTTP POST /api/v1/data-holder-notices { consentId }-->  open-finance.SynchroniseNotifiedConsent
                                                            # a prompt, never data: the same pull

open-finance.CompleteAuthorisation
  -> ConsentAuthorised { userId, consentId, authorisedAt }   # audit; no subscriber

open-finance.CompleteAuthorisation / SynchroniseConsent / SynchroniseNotifiedConsent
                                                             # StatementSynchronisation
  -> bet-detection.ClassifyTransaction (direct call, per new transaction, with the raw line)
  -> TransactionsIngested { userId, transactionIds, ingestedAt }
       -> notifications.AnnounceIngestedTransactions   # TRANSACTIONS_INGESTED { ingestedCount } on the stream

bet-detection.ClassifyTransaction
  -> BetTransactionDetected { userId, transactionId, matchedBy, confidence }
       -> open-finance.ProjectClassification     # refresh the copy on the row

bet-detection.ReclassifyTransaction / RevertReclassification
  -> BetClassificationOverridden { userId, transactionId, verdict }
       -> open-finance.ProjectClassification     # the correction reaches every figure

gamification.RecordGoalMovement
  -> SavingsGoalReached { userId, goalId, reachedAt }        # once per goal; no subscriber yet
gamification.SetBettingCeiling
  -> BettingCeilingSet { userId, ceilingId, effectiveFromMonthKey, setAt }   # audit

gamification.DescribeBettingCeiling reads, never writes, across two boundaries:
  open-finance.SummariseSpendByMonth   (the charts' own months)  via OpenFinanceMonthlyBetHistoryReader
  awareness.AmountReframing            (the rate)                via AwarenessYieldCalculator

open-finance.RevokeConsent
  -> ConsentRevoked { userId, consentId, revokedAt }
       -> open-finance.PurgeUserFinancialData    # transactions, accounts, bank tokens, pending authorisations
       -> bet-detection.ForgetUserClassifications # verdicts and the raw lines
```

**The projection is the load-bearing part of the statement.** `open-finance`
keeps a copy of `bet-detection`'s verdict **and its bookmaker grouping** on its
own row, so the ledger can filter `type=BETS` or `bookmakerId=…` and total it in
one query rather than joining across a context boundary. The subscriber
**re-reads** the owning context rather than trusting the payload — the events
carry ids only, which is what stops a financial judgement travelling through the
bus.

**The betting screen is read the other way round.** `bet-detection` owns
`GET /bets/summary` and composes the other two contexts through their public
APIs — the amounts, the instants and the income from `open-finance`
(`SyncStatusLookup`, `PrismaBettingWindowQuery`), the rate and the equivalence
catalogue from `awareness` (`DescribeEquivalences`). Three read-only queries
across two boundaries, each through a port in the caller and an adapter in its
`infrastructure/`. Nothing is written, nothing is joined, and the figures match
the statement's because both read the same projected columns.

The last three have no subscribers: they are recorded for audit. **Nothing is ever pushed to the
notification stream for a sign-in** — a "novo acesso" alert belongs to a bank, not to a product
whose notifications are about gambling and whose previews land on shared lock screens.

Subscribers are wired in `src/container.ts` and recognise their event with `instanceof` on the class
the owning module re-exports — no payload casting, no string-typed parsing.

Events are published **after** the owning transaction commits, by `RegisterUser` itself, from the
events the aggregate recorded. An aggregate's `pullEvents()` is called inside the transaction and
published outside it.

## Anatomy of a module

```
<context>/
  domain/         aggregates, value objects, events, repository PORTS, <context>.errors.ts
  application/    one use case per file, ports/, dto/, <context>.messages.ts, <context>.failures.ts
  infrastructure/ prisma repositories, mappers, queries, in-memory/ fakes
  http/           routes, controller, schemas, presenter
  index.ts        the public API — the only file another context may import
```

Portuguese copy lives in `application/<context>.messages.ts` and nowhere else. `AppError` factories
live in `application/<context>.failures.ts`, which is the only place a domain error code becomes a
status code and a sentence.
