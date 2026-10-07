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
| `GET`    | `/health`                            | none              | Liveness, no dependencies                            |
| `GET`    | `/ready`                             | none              | Readiness, checks Postgres                           |

`POST /api/v1/identity/password-reset-requests` is specified in `docs/features/login.md` but not
built: it needs a mail provider and the e-mail's Portuguese copy, neither of which exists yet.

Each of those is documented as a PDF reference in [docs/api/](docs/api/) —
`identity-endpoints.pdf` (registration, session resolution) and `login-endpoints.pdf` (sign-in,
sign-out, password reset) — regenerated with `python docs/api/build-<name>-pdf.py`, which needs
only `reportlab`. Postman collections for the same endpoints live in [docs/postman/](docs/postman/).

Feature contracts arrive as handoff documents in [docs/features/](docs/features/) and are binding:
the frontend is already written against those paths, fields and error codes.
