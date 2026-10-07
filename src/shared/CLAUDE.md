# `src/shared` — shared kernel and delivery plumbing

Everything here is used by **every** context and owns **no** business rule. If a type here starts
knowing about betting, consents or streaks, it belongs in a module instead.

## `shared/domain` — the kernel

| File                  | What it is                                                                 |
| --------------------- | -------------------------------------------------------------------------- |
| `result.ts`           | `Result<TValue, TError>` as a discriminated union: `{ ok: true, value }` / `{ ok: false, error }`. Propagate a failure with `if (!result.ok) return result;` — narrowing does the rest. |
| `domain-error.ts`     | `DomainError` — a **value** with a `code` and no message. The domain layer never knows which language the API answers in. |
| `unique-entity-id.ts` | UUID v7, validated. `restore` is the only way in; new ids come from the `IdGenerator` port. |
| `entity.ts` / `aggregate-root.ts` | Identity equality, and `addEvent` / `pullEvents`. `pullEvents` empties the list: whoever pulls is publishing. |
| `domain-event.ts`     | `name`, `occurredAt`, `payload`. Payloads carry ids and primitives, never an aggregate. |
| `assert-never.ts`     | Makes a non-exhaustive `switch` a compile error.                           |

There is no `Money` yet, on purpose: the first feature that transports an amount adds it, with its
tests. A kernel type nobody uses is speculation.

## `shared/application` — ports and the error taxonomy

`AppError` is `{ code, message, status, details }`: `code` is the frontend's stable contract,
`message` is the **Portuguese sentence a person reads**, `details` is keyed by field name. A use
case returns it inside a `Result`; it is never thrown.

`Clock`, `IdGenerator` and `EventPublisher` are the three ports every module injects. `new Date()`
and `crypto.randomUUID()` in a use case are bugs — ESLint fails the first one for you.

## `shared/infrastructure`

- `env.ts` is the **only** file that reads `process.env`. A missing variable fails at boot.
- `logger.ts` redacts headers, body and the caller's address at the logger, so a new route cannot
  leak an e-mail, a token or an address into a log line. `console.log` fails lint.
- `prisma.ts` exports the single client, the transaction-client type, and `isUniqueViolationOn`.
- `in-process-event-bus.ts` delivers after commit. A subscriber that throws is logged and the
  others still run: the transaction has already committed, so a failing reaction must not look like
  a failed request.

## `shared/http` — middleware, and nothing with business meaning

Order in `src/app.ts` matters: `helmet` → `cors` → `request-id` → `pino-http` → JSON body (100 kb)
→ `cookie-parser` → routers under `/api/v1` → `notFound` → `errorHandler` **last**. Route-level
rate limits are mounted by the router that needs them, which is where the threshold is a property
of the endpoint rather than of the whole API.

- `validate.ts` — `validateBody(schema, onInvalid)` returns `{ middleware, read }`. The parsed
  value is held against the request in a `WeakMap`, so the controller reads a value **typed by the
  schema** with no cast. A controller that touches `request.body` is a review blocker.
- `error-handler.ts` — the single place a failure becomes a body. `AppError` renders as itself; a
  body-parser failure becomes `400 MALFORMED_REQUEST`; anything else becomes `500 INTERNAL_ERROR`
  with the message the route declared through `internalErrorMessage(...)`, logged against the
  request id. No stack trace, no SQL, no Prisma message ever reaches the client.
- `rate-limit.ts` — per-IP, `429` in the same envelope, with `Retry-After`.

## `shared/testing`

`FixedClock`, `SequentialIdGenerator` and `RecordingEventPublisher`. Excluded from the build. A test
that reads the wall clock is flaky by construction; a test that asserts on an id it did not see
created needs the sequential generator.
