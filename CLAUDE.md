# anti-aposta — backend

HTTP API and system of record for **anti-aposta**: a personal-finance platform that discourages
online gambling (BETs) by detecting betting transactions through a simulated Open Finance Brasil
Phase 2 API, reframing the amount spent into future-yield equivalents (Kahneman's System 2
activation) and sustaining behaviour change through Self-Determination-Theory gamification.
Undergraduate thesis (TCC) by Guilherme de Sousa Santos and João Marcelo Pedrini Ramalho de Campos.

The frontend (`anti-aposta`, Next.js, separate repository) is a **delivery layer only**. It owns no
business rule and no database. Every rule, every amount, every state transition is decided here.
If a rule exists in both repositories, this one is the truth and the other one is a bug.

This file holds only what applies **everywhere**. Detailed rules live next to the code they
govern — see the map at the bottom.

---

## Stack of record

| Concern        | Choice                                                            |
| -------------- | ----------------------------------------------------------------- |
| Runtime        | Node.js 22 LTS, ESM (`"type": "module"`)                          |
| Language       | TypeScript, `strict: true`, no `any`                              |
| HTTP           | Express 5                                                         |
| Persistence    | PostgreSQL 16 via Prisma ORM (migrations + mappers)               |
| Validation     | Zod, at boundaries only                                           |
| Auth           | JWT access token + rotating refresh token, Argon2id for passwords |
| Realtime       | Server-Sent Events (`text/event-stream`)                          |
| Logging        | pino, structured JSON, no PII                                     |
| Tests          | Vitest (unit/integration), Supertest (HTTP), Docker Postgres      |
| Error handling | `Result<T>` for expected outcomes, thrown errors for bugs only    |

**Architectural divergence from the TCC text (deliberate — document it in the paper):** the paper
proposes microservices and WebSocket. This repository implements a **modular monolith with strictly
isolated bounded contexts**: each context owns its tables, exposes a narrow public API, and talks to
other contexts only through domain events — the standard "modular monolith as a precursor to
microservices" argument. Realtime is SSE, which is one-directional and sufficient: the server
pushes nudges and achievements, the client never pushes. Do not add a message broker, a second
runtime, or a second database.

---

## The layer rule (non-negotiable)

Dependencies point **inward only**:

```
http/ (Express delivery)  ->  application/  ->  domain/
                   infrastructure/  ->  application/ + domain/
```

- `domain/` — pure TypeScript. **Zero** imports from `express`, `@prisma/client`, `zod`, `pino`,
  `node:*`, or another module's internals. If it cannot run in a bare Node REPL, it does not
  belong here.
- `application/` — use cases. Imports `domain/` and port _interfaces_. Never imports
  `infrastructure/`, never sees a `Request`, a `Response`, a header, a cookie, or a status code.
- `infrastructure/` — Prisma repositories, HTTP clients, event bus, clock, crypto, mailer. The only
  layer allowed to know a database exists.
- `http/` — **adapters only**: parse and validate input, resolve the use case from the container,
  map the result to a status code and a JSON body. A file under `http/` containing an `if` about
  business meaning is a bug — move it into a use case or an aggregate.

Path aliases: `@modules/*` → `src/modules/*`, `@shared/*` → `src/shared/*`. Never use a relative
import that climbs more than one level.

---

## Layout

```
src/
  server.ts                      # process entry: validate env, build container, listen
  app.ts                         # Express app assembly (middleware order, routers, error funnel)
  container.ts                   # composition root — the ONLY file wiring ports to adapters
  modules/<context>/
    domain/
      <aggregate>.ts             # aggregate root + invariants
      <value-object>.ts
      events/<event-name>.ts
      <name>.repository.ts       # PORT (interface) — lives in domain
      <context>.errors.ts
    application/
      <verb-noun>.use-case.ts    # one use case per file
      ports/<name>.port.ts
      dto/<name>.dto.ts
    infrastructure/
      prisma-<name>.repository.ts
      <name>.mapper.ts           # Prisma row <-> domain, both directions
      <name>.query.ts            # read model for dashboards/insights
      in-memory/<name>.repository.ts
    http/
      <context>.routes.ts        # Express Router, one route per use case
      <context>.controller.ts    # thin adapter, no business logic
      <context>.schemas.ts       # Zod request schemas
      <context>.presenter.ts     # domain/DTO -> wire JSON
    index.ts                     # PUBLIC API — the only file other modules may import
  shared/
    domain/                      # Entity, AggregateRoot, ValueObject, DomainEvent,
                                 # UniqueEntityId, Result, Money
    application/                 # UseCase contract, AppError taxonomy, Clock, IdGenerator ports
    infrastructure/              # prisma client, event bus, logger, env.ts, crypto
    http/                        # middleware: auth, validate, error-handler, request-id, rate-limit
prisma/
  schema.prisma
  migrations/
  seed.ts                        # synthetic data only
docs/features/                   # one handoff document per feature, written by the frontend repo
tests/integration/               # real Postgres, truncated between tests
```

---

## Bounded contexts

| Context         | Owns                                                      | Example aggregates             |
| --------------- | --------------------------------------------------------- | ------------------------------ |
| `identity`      | users, credentials, sessions, "who is asking"             | `User`, `Session`              |
| `open-finance`  | consent lifecycle + transaction ingestion (DataRecipient) | `Consent`, `Transaction`       |
| `sandbox-bank`  | the simulated institution (DataHolder) + seeded data      | `BankAccount`, `LedgerEntry`   |
| `bet-detection` | classifying transactions as gambling                      | `DetectionPolicy`, `Bookmaker` |
| `awareness`     | System 2 reframing and nudges                             | `AwarenessNudge`, `Reframing`  |
| `gamification`  | streaks, badges, savings goals                            | `Streak`, `Badge`, `Goal`      |
| `notifications` | delivery of nudges and achievements                       | `Notification`                 |

### Boundaries

1. A module may import from another module **only** via that module's `index.ts`, and only the
   types/DTOs it re-exports. Importing `@modules/gamification/domain/streak` from `awareness` is a
   review blocker.
2. Preferred cross-module communication is **domain events**, not direct calls. A direct call is
   acceptable only for a synchronous query the caller cannot proceed without.
3. No cross-module database joins and no foreign key between two contexts' tables. If
   `gamification` needs an amount, it arrives in the event payload or lives in that module's own
   read model. A context references another's aggregate by raw id, never by relation.
4. `sandbox-bank` is a **foreign system**. `open-finance` reaches it over HTTP through an
   anti-corruption layer, never by importing it, even though it runs in the same process. This
   keeps the Phase 2 protocol demonstration honest — it is the thesis's core technical claim.

### Event flow

```
sandbox-bank  --HTTP-->  open-finance.IngestTransactions
     -> TransactionsIngested
          -> bet-detection.ClassifyTransactions
               -> BetTransactionDetected
                    -> awareness.GenerateNudge   -> AwarenessNudgeGenerated -> notifications
                    -> gamification.BreakStreak  -> StreakBroken            -> notifications
```

Events are published **after** the owning transaction commits, by the in-process bus in
`@shared/infrastructure`. A handler is idempotent: the same event delivered twice produces the same
state. Event names are past tense (`BetTransactionDetected`); payloads carry ids and primitives —
never an aggregate instance, never a Prisma row.

---

## Tactical DDD

- **Aggregates** extend `AggregateRoot`, expose behaviour (`consent.authorise(scopes, clock)`), and
  record events through `this.addEvent(...)`. No public setters. An aggregate with only getters is a
  data structure, not a model — that is the anemic-domain smell.
- **Value objects** are immutable, validate in a private constructor, and are built by a static
  factory returning `Result<T>`: `Money.fromCents(1250)`, `Cnpj.create('...')`. Equality is by
  value (`equals()`), never by reference.
- **Money is never a `number`.** `Money` holds integer cents plus a currency (`BRL`). Postgres
  columns are `Int`/`BigInt` cents or `Decimal` — never `Float`. Formatting is the frontend's job;
  the API transports cents.
- **Never call `new Date()`** in domain or application code. Inject the `Clock` port. Store UTC
  (`timestamptz`), transport ISO-8601 with offset, and let the client render in
  `America/Sao_Paulo`. Day-boundary rules (a streak day, a daily ceiling) are computed against
  `America/Sao_Paulo` explicitly, in the domain, from an injected timezone — never from the server's
  local time.
- **IDs** are `UniqueEntityId` (UUID v7) from an injected `IdGenerator`, never from the database, so
  an aggregate is valid before it is persisted and an event can reference it immediately.
- **Repositories** are collection-like (`save`, `findById`, `findByUserId`), declared as interfaces
  in `domain/` and implemented in `infrastructure/`. They accept and return **domain objects only** —
  a Prisma type crossing that boundary is a leak. Mapping lives in a mapper. No `findAll`, and no
  method taking a generic query object: name the question (`findAuthorisedByUserId`).
- **Use cases** are one class with one public `execute(input): Promise<Result<Output>>`. A use case
  never calls another use case; extract a domain service instead. Input and output are DTOs of
  primitives — an aggregate never leaves the application layer.
- **Read models.** Dashboards and insight screens are queries, not aggregates: a dedicated
  `<name>.query.ts` in `infrastructure/` may use raw SQL or a Prisma aggregation and return a DTO
  directly. Do not hydrate 5000 aggregates to compute a sum. Never mutate through a query object.
- **`Result` over exceptions** for expected outcomes (invalid CNPJ, expired consent, forbidden
  access, goal already closed). Throw only for programmer errors and unrecoverable infrastructure
  failures.
- **Unit of work.** One HTTP request is one database transaction whenever it writes more than one
  aggregate. The transaction is opened in `infrastructure/` through the `UnitOfWork` port and passed
  to the repositories — never by calling `prisma.$transaction` from a use case.

---

## HTTP conventions

Middleware order in `app.ts`, and it matters: `helmet` → `cors` → `request-id` → `pino-http` →
JSON body parser (100 kb limit) → cookie parser → rate limit → `/api/v1` routers → 404 handler →
error funnel (last).

- **Versioned prefix** `/api/v1`. Resources are plural kebab-case nouns:
  `/api/v1/savings-goals/:goalId/movements`. No verbs in paths — the HTTP method is the verb. A
  genuine command that is not CRUD becomes a sub-resource:
  `POST /api/v1/consents/:consentId/revocation`.
- **One route = one use case.** The controller does exactly four things: read validated input,
  resolve the use case, map the `Result` to a response, pass unexpected errors to `next`.
- **Validation** happens once, in a `validate(schema)` middleware fed by `<context>.schemas.ts`
  (`body`, `params`, `query`). Handlers read `req.validated`, never `req.body`. An unvalidated
  `req.body` reaching a use case is a review blocker.
- **Payload shape** is JSON, keys `camelCase`. Money is
  `{ "amountInCents": 12500, "currency": "BRL" }`. Dates are ISO-8601 strings. Enums are
  `SCREAMING_SNAKE_CASE` strings, never integers, and the frontend's Zod schema mirrors them.
- **Collections** return `{ "items": [...], "nextCursor": "..." | null }` with cursor pagination
  (`?limit=&cursor=`), default `limit` 20, maximum 100. Never return an unbounded array.
- **Errors** use a single envelope, always:

  ```json
  { "error": { "code": "CONSENT_EXPIRED", "message": "O consentimento expirou.", "details": [] } }
  ```

  `code` is a stable `SCREAMING_SNAKE_CASE` contract the frontend switches on. `message` is
  user-facing Portuguese, factual and non-judgemental. `details` carries field errors for 422
  (`[{ "field": "amountInCents", "code": "TOO_SMALL" }]`). Never leak a stack trace, a SQL error or
  a Prisma message to the client — log it with the request id and return the envelope.

| Situation                             | Status | Code example          |
| ------------------------------------- | ------ | --------------------- |
| Created a resource                    | 201    | —                     |
| Command accepted, nothing to return   | 204    | —                     |
| Schema/shape invalid                  | 400    | `MALFORMED_REQUEST`   |
| No or invalid credentials             | 401    | `UNAUTHENTICATED`     |
| Authenticated but not allowed         | 403    | `FORBIDDEN`           |
| Resource does not exist, or not yours | 404    | `NOT_FOUND`           |
| Conflicting state / duplicate         | 409    | `GOAL_ALREADY_CLOSED` |
| Valid shape, broken business rule     | 422    | `CEILING_EXCEEDED`    |
| Rate limited                          | 429    | `TOO_MANY_REQUESTS`   |
| Unexpected                            | 500    | `INTERNAL_ERROR`      |

- **Authorisation is always scoped by owner.** A query by id alone is a bug: every read and write
  goes through `findByIdAndUserId`. "Not yours" answers 404, not 403 — do not confirm the existence
  of another user's data.
- **Idempotency.** Non-idempotent commands that money or streaks depend on (recording a movement,
  ingesting transactions) accept an `Idempotency-Key` header and store it alongside the result.
- **Realtime.** `GET /api/v1/notifications/stream` is an SSE endpoint: named events, `id:` for
  resume via `Last-Event-ID`, a 15 s heartbeat comment, and cleanup on `req.on('close')`. It streams
  what already happened; it is never a command channel.
- **Health.** `GET /health` (liveness, no dependencies) and `GET /ready` (checks Postgres). Neither
  is behind auth, neither returns internals.

---

## Auth and security

- Access token: JWT, 15 minutes, `sub` = user id. Refresh token: opaque, 30 days, stored hashed in
  Postgres, **rotated on every use**; reuse of a consumed refresh token revokes the whole session
  family.
- Tokens reach the browser as `httpOnly`, `Secure`, `SameSite=Lax` cookies — the Next.js frontend
  calls this API server-side. Never put a token in `localStorage` guidance or in a URL.
- Passwords: Argon2id, never logged, never returned, never compared with `===`. Login, register and
  password-reset endpoints are rate limited per IP **and** per identifier, and answer in constant
  time: "credenciais inválidas" never reveals whether the e-mail exists.
- CORS allows exactly the frontend origin from `env`, with credentials. No `*`.
- Open Finance access tokens and any third-party credential are **encrypted at rest** (AES-256-GCM,
  key from `env`) and decrypted only inside `infrastructure/`.
- **Secrets** live in environment variables, validated once at boot by a Zod schema in
  `src/shared/infrastructure/env.ts`. A missing variable fails at startup, not at 2 a.m. inside a
  route handler. `process.env` is read **only** in that file.

---

## Data, privacy, and ethics

This product serves people in financial distress. These are product requirements, not suggestions.

- **Consent first.** No financial data is read, stored, or derived without an `AUTHORISED` consent.
  Revocation deletes the derived data, not just the token (LGPD art. 18) — and that deletion is a
  use case with tests, not a manual script.
- **Never log PII.** No CPF, CNPJ, full account numbers, e-mail addresses, access tokens or
  transaction descriptions in logs — log ids. Use the pino logger from `@shared/infrastructure`;
  `console.log` fails review. Request logging redacts `authorization`, `cookie` and `set-cookie`.
- **Data minimisation.** Ingest and persist only what detection and reframing actually need.
- **The platform never blocks a transaction** — it cannot, and must not claim it can. API copy and
  field names stay accurate about retrospective awareness.
- **No shaming, no dark patterns.** Server-generated copy is factual and non-judgemental, never
  moralising. No random rewards, and no mechanic that mimics a gambling loop.
- **Escalation path.** Where usage suggests compulsive behaviour, the response surfaces support
  resources (CVV 188, responsible-gambling services) instead of more gamification.
- Every migration and seed uses **synthetic** data. Real CPF/CNPJ values never enter the repository.

---

## Clean code rules

1. A function does one thing and stays under ~20 lines. If a comment is needed to separate sections,
   extract a function named after the section.
2. Guard clauses over nested `if`. Maximum nesting depth: 2.
3. No boolean parameters — split the function or pass a named options object.
4. Comments explain **why**, never **what**. Dead code is deleted, not commented out.
5. No abbreviations (`txn`, `usr`, `cfg`) and no type prefixes (`ITransaction`, `TUser`). Interfaces
   are named for their role: `TransactionRepository`.
6. `readonly` by default on fields and array parameters; prefer immutable updates.
7. `any` is banned, and so is a cast that only silences the compiler. Use `unknown` plus a Zod parse
   at the boundary. No `!` assertions.
8. Exhaustive `switch` over unions with `default: assertNever(value)`.
9. Files `kebab-case.ts`; classes and types `PascalCase`; functions and variables `camelCase`;
   constants `SCREAMING_SNAKE_CASE`. One aggregate or use case per file, named after the file.
10. No barrel files except a module's `index.ts`. No `utils/`, `helpers/` or `common/` folder.
11. Magic numbers and strings become named constants. `7995` appears once, as `GAMBLING_MCC`.
12. `async`/`await` only — no `.then()` chains and no floating promise: every one is awaited or
    explicitly handed to the error funnel. No `try/catch` that swallows — handle it or rethrow.
13. Code identifiers are **English**. User-facing strings are Portuguese and live in one place per
    module, never inlined across controllers.

### Ubiquitous language

Brazilian regulatory/domain proper nouns keep their Portuguese form because translating them loses
meaning (`Cnpj`, `Mcc`, `Pix`, `Cdi`, `Selic`). Use this glossary in code, tests, commit messages,
JSON field names and column names — never invent synonyms.

| PT (TCC / domain)           | Code term         | Meaning                                                        |
| --------------------------- | ----------------- | -------------------------------------------------------------- |
| Consentimento               | `Consent`         | User authorisation to share financial data; has scope + expiry |
| Instituição transmissora    | `DataHolder`      | Institution that holds the data (here: our sandbox)            |
| Instituição receptora       | `DataRecipient`   | Our platform, consuming the shared data                        |
| Transação                   | `Transaction`     | A single financial movement                                    |
| Transação de aposta         | `BetTransaction`  | Transaction classified as gambling                             |
| Casa de apostas             | `Bookmaker`       | Betting operator, identified by CNPJ/MCC                       |
| Reenquadramento (reframing) | `Reframing`       | Translating an amount into future-yield equivalents            |
| Alerta / nudge              | `AwarenessNudge`  | The System 2 intervention shown to the user                    |
| Meta                        | `Goal`            | User-defined savings target                                    |
| Sequência sem apostas       | `Streak`          | Consecutive bet-free days                                      |
| Conquista                   | `Badge`           | Awarded milestone                                              |
| Rendimento equivalente      | `YieldEquivalent` | What the amount would earn in fixed income                     |
| Nome de exibição            | `DisplayName`     | How the person wants to be called in the app; never a legal name |
| Consentimento de cadastro   | `RegistrationConsent` | The LGPD authorisation taken at registration, scoped to the name and the e-mail. **Not** the `Consent` aggregate |
| Política de senha           | `PasswordPolicy`  | Minimum length (the only gate) plus the strength advice the meter shows |
| Sessão                      | `Session`         | An opaque token, a `UserId`, an expiry and a revocation state   |
| Credencial                  | `Credential`      | The `Email` + `PasswordHash` pair; `verify` answers a boolean and never a reason |
| Token de redefinição        | `PasswordResetToken` | Single-use, 60-minute, stored hashed, bound to one user      |
| Limite de tentativas        | `SignInThrottle`  | The per-address attempt window. A delay, **never** a lockout — `AccountLock` would be the modelling mistake |

Forbidden vocabulary: `data`, `info`, `manager`, `helper`, `util`, `handler` (except Express error
handlers), `service` as a suffix for what is really a use case, `process`, `do`. Name things after
the domain, not after their mechanics.

---

## Postgres and Prisma

- The schema is **derived from the domain**, not the reverse. Model the aggregate first, then write
  the migration that stores it.
- Tables and columns are `snake_case` via `@@map`/`@map`; Prisma models stay `PascalCase`. Tables
  are prefixed by context (`identity_users`, `gamification_goals`) so module ownership is visible in
  `psql`.
- Every migration is generated (`prisma migrate dev --name <slug>`), reviewed, and committed. Never
  hand-edit an applied migration; never `db push` against a shared database. Migrations are additive
  and reversible in principle: add column → backfill → drop in a later migration.
- Invariants that must hold across concurrent requests are enforced **both** in the aggregate and by
  a constraint: a unique index for "one active streak per user", `CHECK (amount_in_cents >= 0)` for
  money, `NOT NULL` for everything the domain requires. A nullable column is a claim that the domain
  allows absence.
- Index every foreign key and every column a repository filters or sorts by. A new repository method
  that filters on an unindexed column ships with the index in the same migration.
- Timestamps are `timestamptz`. Enums are Postgres enums mirroring the domain union.
- Money is integer cents (`Int`, or `BigInt` beyond 21M BRL). `Float`/`Double` on a monetary column
  is a review blocker.
- No business logic in the database: no triggers, no stored procedures, no computed business
  columns. The exception is a `DEFAULT` or `CHECK` guarding a data invariant.
- Concurrency: optimistic locking via a `version` column on aggregates two requests can touch at
  once (goals, streaks). A lost update is a correctness bug, not an edge case.
- The Prisma client is a single instance from `@shared/infrastructure`. A module importing
  `@prisma/client` outside its own `infrastructure/` folder is a layer violation.

---

## Testing

- Domain and application layers: unit tests with the in-memory fake repositories shipped by each
  module, **no database**, and no mocking framework for code you own.
- Infrastructure and HTTP: integration tests against a real Postgres (Docker), truncated between
  tests, driving the real Express app through Supertest — auth middleware and error funnel included.
  A test that stubs the middleware proves nothing about the endpoint.
- Every endpoint has at least: the happy path, one validation failure (422 shape), one authorisation
  failure (another user's id → 404), and one broken business rule.
- Test names state behaviour: `it('refuses ingestion when the consent has expired')`.
- Arrange with builders (`aConsent().authorised().build()`), not 40-line object literals.
- Fix the clock and the id generator in tests (`FixedClock`, `SequentialIdGenerator`). A test that
  depends on the wall clock is flaky by construction.
- Every bug fix starts with a failing test that reproduces it.
- Non-negotiable coverage: every aggregate invariant, every detection policy, the compound-interest
  calculation, and every authorisation check.

---

## Workflow

```bash
npm run dev                  # tsx watch src/server.ts
npm run build                # tsc -p tsconfig.build.json — must pass before any commit
npm run lint                 # eslint
npm run typecheck            # tsc --noEmit
npm test                     # vitest run
npm run test:integration     # requires: docker compose up -d postgres
npm run db:migrate           # prisma migrate dev
npm run db:seed              # synthetic data only
```

- Branches: `feat/<context>-<slug>`, `fix/<context>-<slug>`.
- Conventional commits scoped by bounded context: `feat(bet-detection): add CNPJ policy`.
- Never commit `.env`, real bank data, or real CPF/CNPJ values.

**Definition of done:** the rule lives in the domain layer with tests; the endpoint matches the
handoff document's contract exactly (path, fields, codes); `npm run build`, `npm run typecheck`,
`npm run lint` and `npm test` are clean; migration committed and reversible; no layer violation, no
cross-module deep import, no `any`, no `console.log`, no PII in logs; every read and write scoped by
owner; Portuguese copy accurate about what the platform can and cannot do.

---

## Implementing a feature

Features arrive as a handoff document in `docs/features/<feature>.md`, generated from the frontend
repository (the prompt that produces it lives in `prompts/feature-handoff.md`). Work in this order:

1. **Read the handoff document fully.** Its API contract is binding: the frontend is already written
   against those paths, fields, enums and error codes. If you must deviate, say so explicitly in
   your summary so the frontend is updated in the same pull request — never silently rename a field.
2. **Stop at the open questions.** If the document lists an unanswered blocking question, ask it
   before writing code. A guessed business rule is the most expensive thing in this repository.
3. **Place the feature.** Which bounded context owns it? If it seems to need two, one owns the write
   and the other reacts to an event. A new context requires an explicit decision, not a new folder.
4. **Model the domain:** aggregate, value objects, invariants, events, repository port — with unit
   tests, before any Prisma or Express code exists.
5. **Write the use cases** against the ports, tested with the in-memory repositories.
6. **Then** the infrastructure: Prisma model, migration, mapper, repository, and its integration
   test.
7. **Then** the delivery layer: Zod schemas, controller, router, presenter, wiring in
   `container.ts`, and the endpoint tests.
8. **Report** the implemented contract back as a short table (method, path, request, response, error
   codes) so the frontend can replace its mock with the real call.

---

## Where the detailed rules live

Each file below is loaded automatically when you work on files in that directory. Add new guidance to
the **nearest** file; promote it here only when it truly applies everywhere.

| Scope                             | File                              |
| --------------------------------- | --------------------------------- |
| Express assembly, middleware, API | `src/shared/CLAUDE.md`            |
| Shared kernel                     | `src/shared/CLAUDE.md`            |
| Module anatomy, event map         | `src/modules/CLAUDE.md`           |
| One per bounded context           | `src/modules/<context>/CLAUDE.md` |
| Schema and migration conventions  | `prisma/CLAUDE.md`                |
| Feature handoff documents         | `docs/features/`                  |
