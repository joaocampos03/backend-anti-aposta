# `src/modules` — module anatomy and the event map

## What exists today

| Context         | State                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------- |
| `identity`      | **Implemented**: `User`, `Session`, `Credential`, `RegistrationConsent`, `SignInThrottle`, `PasswordResetToken` — registration, sign-in, sign-out, session resolution and password reset. Recovery *requests* wait on a mail decision. |
| `gamification`  | Bootstrap only: `Streak` at zero days and an empty `BadgeCollection` on `UserRegistered`. No scoring, no awarding yet. |
| `notifications` | Bootstrap only: the empty `Inbox`. Nothing is pushed, and there is no SSE endpoint yet.      |
| `open-finance`  | **Read side only**: `AuthorisedConsentQuery` answers "has this user an `AUTHORISED` consent?". The `Consent` aggregate, the OAuth flow and ingestion arrive with the Open Finance feature. |
| `sandbox-bank`, `bet-detection`, `awareness` | Not created. A new context is a decision, not a new folder. |

## The rules that get broken most

1. **One way in.** A module imports another only through its `index.ts`. ESLint enforces it; the one
   exception is `src/container.ts`, the composition root.
2. **No foreign keys across contexts.** `gamification_streaks.user_id` is a raw `uuid` with no
   relation to `identity_users`. Cascade deletion across contexts is a use case with tests, not a
   database trigger.
3. **Events, not calls.** A direct call is acceptable only for a synchronous query the caller cannot
   proceed without — today that is exactly one: `identity` asking `open-finance` for
   `hasAuthorisedConsent`, through `identity`'s own port and an adapter that is the
   anti-corruption layer.
4. **Idempotent subscribers.** The same event delivered twice produces the same state. Every
   bootstrap use case checks for the aggregate before creating it, and has a test that says so.

## Event map

```
identity.RegisterUser
  -> UserRegistered { userId, registeredAt }          # no name, no e-mail
       -> gamification.StartStreak                    # zero days, never day one
       -> gamification.CreateBadgeCollection          # empty; participation is not a milestone
       -> notifications.CreateInbox                   # empty; no welcome message

identity.SignIn        -> UserSignedIn    { userId, sessionId, signedInAt }
identity.SignOut       -> UserSignedOut   { userId, sessionId, signedOutAt }
identity.ResetPassword -> PasswordChanged { userId, changedAt }
```

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
