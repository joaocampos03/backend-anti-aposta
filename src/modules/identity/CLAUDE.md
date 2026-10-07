# `identity` — users, credentials, sessions, "who is asking"

Implements `docs/features/register.md` and `docs/features/login.md`. Those documents' API contracts
are binding: the frontend is already written against those paths, fields, codes and Portuguese
strings.

## The distinction that must never collapse

`RegistrationConsent` is **not** the `Consent` aggregate of `open-finance`.

|               | `RegistrationConsent` (here)            | `Consent` (`open-finance`)          |
| ------------- | --------------------------------------- | ----------------------------------- |
| Scope         | `NAME_AND_EMAIL`                        | financial data, per Phase 2 scopes  |
| Expiry        | none                                    | yes                                 |
| Flow          | a checkbox on `/register`               | an OAuth authorisation at the bank  |
| Revocation    | deleting the account                    | its own endpoint; deletes derived data |

Registration grants **no** financial-data scope. Naming them both `Consent` is the single most
likely modelling mistake in this module.

## Invariants

1. A `User` cannot exist without a `RegistrationConsent`: it is a constructor argument, and holding
   the value object *is* the acceptance. There is no `consent: boolean` column and there never will
   be one.
2. `Email` is stored normalised — trimmed and lower cased — so the unique index is a
   case-insensitive guarantee. A `CHECK (email = lower(btrim(email)))` keeps that true even for a
   write that bypasses the mapper.
3. Only `PASSWORD_MINIMUM_LENGTH` (8) and `PASSWORD_MAXIMUM_LENGTH` (128) gate a password.
   **Strength is advice, never a gate**: `Password1` scores `WEAK` and registers successfully, and
   a test says so. Refusing a password for being weak would be the server scolding somebody who did
   nothing wrong.
4. A `PasswordHash` never appears in a DTO, a presenter or a log line.
5. Registration is one transaction: both the user and the session, or neither.
6. `registeredAt` and `acceptedAt` come from the `Clock` port.

## Sessions

Opaque token, `op_` + 16 random bytes, returned **once** in the registration response body. Only its
SHA-256 is stored (`identity_sessions.token_hash`), so a leaked row cannot be replayed. The backend
sends **no `Set-Cookie`**: the Next.js server sets its own `httpOnly` / `Secure` / `SameSite=Lax`
cookie on its own origin. A cross-site cookie would need `SameSite=None` and would die wherever
third-party cookies are blocked.

Lifetime is 14 days from `SESSION_TTL_IN_DAYS`, and it **slides**: resolving a session that is
within `SESSION_RENEW_WITHIN_DAYS` (7) of expiring extends it to a fresh 14 days and writes
`lastUsedAt`. Outside that window nothing is written, so a person who opens the app daily costs one
write a week rather than one per request. An **expired or revoked** session is never revived — that
takes a new sign-in.

Two producers, one `Session`: registration issues one with no event (`UserRegistered` already
records the moment), sign-in issues one through `Session.issueOnSignIn`, which records
`UserSignedIn`. `GET /identity/sessions/current` accepts either without knowing which.

## Signing in

Three rules, all from the ethics section rather than from convenience. They are tested as behaviour,
not assumed:

1. **One undifferentiated failure.** A wrong password, an unknown address, a deleted account and one
   pending purge all leave `SignIn` by the same return, with `INVALID_CREDENTIALS`, the same message
   and an **empty `details`** — so the message cannot be anchored to a field and thereby reveal
   which half was wrong. `Credential.verify` answers a boolean and never a reason, because a caller
   holding the reason is one refactor away from leaking it.
2. **Constant time with respect to account existence.** An address with no account still spends an
   Argon2id verification against a decoy hash (`PasswordVerifier.verifyAgainstDecoy`). This is an
   invariant, not an optimisation.
3. **The throttle delays, it never locks.** `SignInThrottle` is 5 failures per address per 15
   minutes, then an exponential delay capped at 15 minutes, checked **before** the credential so a
   `429` says nothing about the account. There is no "locked" column and there must never be one:
   an attacker who knows an address could otherwise lock a real person out of their own financial
   history by guessing wrong five times. After the delay, the correct password works at any number
   of previous failures. Naming it `AccountLock` would be the modelling mistake that makes the
   product lockable.

The per-IP net (`SIGN_IN_ATTEMPTS_PER_QUARTER_HOUR`, default 50) is a separate, route-level limiter:
`SignInThrottle` is keyed by address, so spraying one attempt each across a thousand addresses would
otherwise slip past it. That number is an assumed default, not a decision the handoff gave.

**Sign-in enforces no minimum password length**, and must never acquire one: a length rule on an
*existing* credential locks out whoever set a shorter password before the policy existed.
`Password.attempt` exists for exactly this, next to `Password.create` which does gate.

## Error codes this module owns

`EMAIL_ALREADY_REGISTERED` (409) · `VALIDATION_FAILED` (422) · `CONSENT_REQUIRED` (422) ·
`PASSWORD_TOO_SHORT` (422) · `PASSWORD_CONFIRMATION_MISMATCH` (422) · `RESET_TOKEN_INVALID` (422) ·
`INVALID_CREDENTIALS` (401) · `SESSION_INVALID` (401) · `SESSION_EXPIRED` (401) ·
`TOO_MANY_ATTEMPTS` (429).

Two rules about them:

- The explicit `409` is **scoped to registration**. Sign-in and password recovery must keep
  undifferentiated answers: a different message for an unknown address there turns those forms into
  a way to enumerate people who may be gambling.
- An unknown token and a revoked token answer the same `SESSION_INVALID`, which says nothing about
  whether the token ever existed. A `401` is never rendered as an error message — the person did
  nothing wrong, they get the sign-in screen.
- `RESET_TOKEN_INVALID` covers unknown, expired, already-used and superseded tokens with one
  message. Telling "expirou" from "já foi usado" tells a token guesser which of their guesses
  existed.

Order of checks in `RegisterUser`: consent → name and e-mail → password length → confirmation →
uniqueness. Consent comes first because without it the platform has no authorisation to process the
name and the e-mail at all.

## Where the copy lives

`application/identity.messages.ts`, and nowhere else. Four strings are in the frontend verbatim and
must not drift: the consent message, the confirmation mismatch, "Use pelo menos 8 caracteres." and
the per-field validation copy. The `409`, `429` and `500` strings were introduced by the handoff
document and still want a one-line product approval.

## The password policy

`domain/password-policy.ts` is the frontend's `app/(auth)/_password-strength.ts`, ported with its
constants intact. Two implementations of the same pure function is the accepted cost: the meter must
run while the person types, without a round trip that would put a plaintext password on the network
for a hint. `password-policy.spec.ts` holds the shared vectors — `Password1` → `WEAK` is the
regression test that keeps the two honest.

## Password resets

`POST /identity/password-resets` consumes a token and sets a new password. The password is validated
**before** the token is looked at, so a password that is too short or mistyped leaves the link
usable and the person can resubmit instead of asking for another e-mail. A successful reset revokes
**every** session for that user — the one place where "signing in revokes nothing" does not apply —
and consumes every other outstanding link. It issues no session: a link that both resets and signs
in makes an e-mail account a bearer credential for a finance app.

A reset must never refuse a password registration would have accepted, which is why both go through
`passwordFailure` in `identity.failures.ts`.

## Events

| Event | Payload | Who reacts |
| --- | --- | --- |
| `UserRegistered` | `{ userId, registeredAt }` | `gamification`, `notifications` |
| `UserSignedIn` | `{ userId, sessionId, signedInAt }` | nobody; audit |
| `UserSignedOut` | `{ userId, sessionId, signedOutAt }` | nobody; audit |
| `PasswordChanged` | `{ userId, changedAt }` | nobody; the revocation happens in the same transaction |

No payload carries an address, a name, a password, a session token or a reset token. **No
notification is ever sent for a sign-in**: a "novo acesso à sua conta" push is a banking pattern
that, in a product whose notifications are about gambling, puts an alarming message on a lock screen
for a routine event.

## Still missing from this module

**Password recovery requests.** `POST /identity/password-reset-requests` is specified in
`docs/features/login.md` but not built: no mail provider, template or from-address exists in either
repository and `env.ts` has no SMTP variables. Until it lands, nothing mints a `PasswordResetToken`
outside a test, and the reset endpoint has no way to be reached by a real person. Building it needs
a `PasswordResetMailer` port, an adapter, the link base URL in `env`, a per-address throttle (3 per
hour) and an identical `202` for every address, existing or not.

**E-mail change and account deletion**, which belong to `/settings`. Two questions are still open
and block that work, not these endpoints: whether the e-mail is editable (it decides whether `Email`
is immutable on the aggregate) and whether a purged account's address is free to re-register (it
decides whether the unique index covers live rows or all rows ever).
