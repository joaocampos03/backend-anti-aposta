# backend-anti-aposta

HTTP API and system of record for **anti-aposta** — a personal-finance platform that discourages
online betting by detecting betting transactions through a simulated Open Finance Brasil Phase 2
API, reframing the amount into future-yield equivalents, and sustaining behaviour change through
Self-Determination-Theory gamification. Undergraduate thesis (TCC).

Node.js 22+ · TypeScript · Express 5 · PostgreSQL 16 + Prisma · Zod · Vitest. Modular monolith with
isolated bounded contexts; the conventions live in [CLAUDE.md](CLAUDE.md) and in a `CLAUDE.md` next
to the code each one governs.

## Running it

```bash
cp .env.example .env               # the defaults match docker-compose.yml
docker compose up -d postgres
npm install
npm run db:migrate                 # applies prisma/migrations
npm run dev                        # http://localhost:3333
```

## Checks

```bash
npm run typecheck
npm run lint
npm test                           # unit: domain + use cases, no database
npm run test:integration           # real Postgres, real Express, Supertest
npm run build
```

The integration suite creates and migrates its own database (`antiapostadb_test`) on the same
container; override it with `TEST_DATABASE_URL`.

## Implemented endpoints

| Method   | Path                                 | Auth              | Purpose                                             |
| -------- | ------------------------------------ | ----------------- | --------------------------------------------------- |
| `POST`   | `/api/v1/identity/users`             | public, limited   | Create the account, record the LGPD registration consent, issue a session |
| `POST`   | `/api/v1/identity/sessions`          | public, throttled | Sign in: verify the pair and issue a session         |
| `GET`    | `/api/v1/identity/sessions/current`  | session token     | Resolve the token into "who is asking"; slides the session |
| `DELETE` | `/api/v1/identity/sessions/current`  | session token     | Sign out; idempotent, always `204`                   |
| `POST`   | `/api/v1/identity/password-resets`   | reset token       | Consume the token, set a new password, revoke every session |
| `GET`    | `/api/v1/transactions`               | session           | The statement: a filtered page plus the totals for the whole slice |
| `GET`    | `/api/v1/transactions/monthly-summary` | session         | The charts: per-calendar-month totals per category     |
| `POST`   | `/api/v1/transactions/{id}/classification-override` | session | Record "isto não é uma aposta"            |
| `DELETE` | `/api/v1/transactions/{id}/classification-override` | session | Undo that correction                      |
| `GET`    | `/api/v1/accounts`                   | session           | The connected accounts behind the filter             |
| `GET`    | `/api/v1/consents/current`           | session           | The latest consent and its status, or `null`         |
| `POST`   | `/api/v1/consents`                   | session, throttled | Start connecting: register the consent at the bank, get the authorisation URL |
| `POST`   | `/api/v1/consents/{id}/authorisation` | session, throttled | Relay the bank's callback (`code`+`state`, or `error`+`state`); runs the first sync |
| `POST`   | `/api/v1/consents/{id}/synchronisation` | session, throttled | Pull what is new at the bank                      |
| `POST`   | `/api/v1/consents/{id}/revocation`   | session           | Revoke; deletes every derived row (LGPD art. 18)     |
| `GET`    | `/api/v1/awareness/support-offer`    | session           | Whether to surface support resources, and what was counted |
| `GET`    | `/health`                            | none              | Liveness, no dependencies                            |
| `GET`    | `/ready`                             | none              | Readiness, checks Postgres                           |

**The simulated bank** (`sandbox-bank`) is another institution that happens to share this process,
so it lives outside `/api/v1`:

| Method   | Path                                              | Auth                  | Purpose |
| -------- | ------------------------------------------------- | --------------------- | ------- |
| `POST`   | `/sandbox/open-finance/v2/token`                  | client (HTTP Basic)   | OAuth 2.0: `client_credentials`, `authorization_code` + PKCE, `refresh_token` |
| `POST`   | `/sandbox/open-finance/v2/consents`               | bearer, `consents`    | Register a consent request |
| `DELETE` | `/sandbox/open-finance/v2/consents/{urn}`         | bearer, `consents`    | Revoke it, and every token it produced |
| `GET`    | `/sandbox/open-finance/v2/accounts`               | bearer, `accounts`    | The accounts the person shared |
| `GET`    | `/sandbox/open-finance/v2/accounts/{id}/transactions` | bearer, `accounts` | One page of a shared account's statement |
| `GET`    | `/sandbox/open-finance/v2/authorize`              | session               | What the bank's authorisation screen shows |
| `POST`   | `/sandbox/open-finance/v2/authorize`              | session               | The person's answer; returns the redirect with a code or `access_denied` |
| `GET`    | `/sandbox/bank/accounts`                          | session               | The person's own accounts at the sandbox |
| `POST`   | `/sandbox/bank/accounts/{id}/ledger-entries`      | session, throttled    | Book a movement at the bank (only where `SANDBOX_BANK_LEDGER_WRITES` is on) |

`open-finance` reaches the first five over HTTP through an anti-corruption layer, exactly as it
would reach a real institution. A movement booked at the bank reaches the statement on the next
`synchronisation`, never sooner. See [src/modules/sandbox-bank/CLAUDE.md](src/modules/sandbox-bank/CLAUDE.md).

`POST /api/v1/identity/password-reset-requests` is specified in `docs/features/login.md` but not
built: it needs a mail provider and the e-mail's Portuguese copy, neither of which exists yet.

`npm run db:seed` books a synthetic twelve-month history at the sandbox bank, then connects the
demo user through the real consent flow over HTTP and prints the credentials it created.
`npm run db:seed -- --without-consent` stops after the bank, to demonstrate connecting on screen.

Each of those is documented as a PDF reference in [docs/api/](docs/api/) —
`identity-endpoints.pdf` (registration, session resolution) and `login-endpoints.pdf` (sign-in,
sign-out, password reset) — regenerated with `python docs/api/build-<name>-pdf.py`, which needs
only `reportlab`. Postman collections for the same endpoints live in [docs/postman/](docs/postman/).

Feature contracts arrive as handoff documents in [docs/features/](docs/features/) and are binding:
the frontend is already written against those paths, fields and error codes.
