# `notifications` — the inbox and the stream

Delivers what the platform has to tell one person, to that person only. The inbox is the source
of truth; the SSE stream is an optimisation over it.

## The model

- `Inbox` — exists from registration (`UserRegistered` → `CreateInbox`). Delivery to a user id
  without one answers `404 RECIPIENT_NOT_FOUND`: no inbox means nobody registered under that id.
- `Notification` — one thing pushed to one person: a `NotificationContent` variant (kind + display
  fields), the recipient, and an instant. `Notification.compose` refuses what a person could not
  read: a blank or over-long line (140 characters), a fraction of a cent, a zero count, a nudge for
  a zero amount. Its id is a UUID v7, so it is ordered by time — that is what the stream resumes
  after.

| Kind | Fields | Comes from |
| --- | --- | --- |
| `AWARENESS_NUDGE` | `merchant`, `amountInCents`, `yieldInCents`, `annualRatePercent`, `monthlyTotalInCents`, `matchedBy` | the demo console today; `BetTransactionDetected` once nudges land |
| `BADGE_AWARDED` | `badgeId`, `title`, `description` | the demo console today; `BadgeAwarded` later |
| `STREAK_BROKEN` | `previousDays` | the demo console today; `StreakBroken` later |
| `GOAL_REACHED` | `label`, `amountInCents` | the demo console today |
| `TRANSACTIONS_INGESTED` | `ingestedCount` | `open-finance.TransactionsIngested`, from any synchronisation |

`TRANSACTIONS_INGESTED` carries a count and nothing about the movements: the statement says what
they were, behind the session. A run that ingested nothing announces nothing.

## Delivery

`NotificationDelivery` stores first and pushes second, so a push nobody is connected to receive is
not lost. It is shared by every use case that tells somebody something, so none of them calls
another. The push goes through the `NotificationChannel` port; `InProcessNotificationStream` is a
per-user fan-out in this process. It does not cross instances — a second API process would need a
broker behind the same port, which the inbox makes safe to add.

A nudge's yield is **never** taken from the caller. `SendDemoNotification` reframes the amount
through `awareness` (the `YieldCalculator` port), and the request schema has no yield field.

## The stream — `GET /api/v1/notifications/stream`

Session-scoped: the caller's own notifications only. Each frame is a named event:

```
id: <notification id>
event: <KIND>
data: {"id":"…","createdAt":"…","kind":"<KIND>",…fields}
```

- `retry: 3000` once on open, and a `: heartbeat` comment every 15 s.
- **Replay only on reconnection.** `Last-Event-ID` returns what came after it, oldest first, at
  most 50 (`REPLAY_LIMIT`). A fresh connection replays nothing: opening the app must not re-open
  every nudge somebody already dismissed. An id that is not ours replays nothing.
- `NotificationStream` subscribes **before** reading the replay and holds live pushes until the
  replay is written, so a notification delivered in between is neither lost nor shown twice.
- It streams what already happened. It is never a command channel.

The browser never reaches this API directly: the Next.js route `app/api/notifications/stream`
holds the session cookie, opens this stream with the bearer token, forwards `Last-Event-ID`, and
pipes the body through.

## The demonstration console — `POST /api/v1/users/{userId}/notifications`

Sends one notification to one person by id, so a presenter can show each kind on another screen.
Any signed-in caller may use it, which is why it is mounted **only** where the sandbox's demo
writes are on (`sandboxLedgerWritesEnabled`: never in production), and rate limited
(`DEMO_NOTIFICATIONS_PER_HOUR`).

| Status | Code | When |
| --- | --- | --- |
| 201 | — | stored and pushed; body is the wire shape above |
| 401 | `UNAUTHENTICATED` | no session |
| 404 | `RECIPIENT_NOT_FOUND` | no inbox for that id |
| 422 | `VALIDATION_FAILED` | shape, including a yield sent by the caller |
| 422 | `INVALID_NOTIFICATION` | the domain refused it |

## Rules

- One person's notification never reaches another person's stream.
- Payloads carry ids, cents and short display text — never a raw statement line, never a token.
- Nothing is pushed for a sign-in, a registration or a password change.
- A broken streak is never a modal (that is the frontend's layout, and the reason the kinds are
  separate).
