# `sandbox-bank` — the simulated DataHolder

The *instituição transmissora*: a fake bank implementing the Open Finance Brasil Phase 2 surface so
the platform has something real to talk to. Production access needs certificates and institutional
enrolment the project cannot obtain — this is objective B of the TCC, and its faithfulness is what
makes the demonstration credible.

## A foreign system in the same process

**Nothing imports this module.** `index.ts` exports nothing; only `src/container.ts` reaches in, to
wire the routes. `open-finance` talks to it with `fetch`, through `SandboxBankDataHolder` and
`open-finance-brasil.wire.ts` — the anti-corruption layer — exactly as it would talk to any
institution. If a type from here is ever imported elsewhere, the demonstration has been
short-circuited.

It shares the database and owns its tables (`sandbox_bank_*`). No foreign key reaches it, and it
reaches none.

## The surface

Mounted under `/sandbox`, outside `/api/v1`: it is another institution with its own versioning.

| Endpoint | Caller | Dialect |
| --- | --- | --- |
| `POST /open-finance/v2/token` | the DataRecipient (HTTP Basic) | OAuth 2.0 (`{ error, error_description }`) |
| `POST /open-finance/v2/consents`, `DELETE …/consents/{urn}` | DataRecipient, `consents` token | Open Finance Brasil (`data`/`links`/`meta`, `errors[]`) |
| `GET /open-finance/v2/accounts`, `GET …/accounts/{id}/transactions` | DataRecipient, `accounts` token | Open Finance Brasil |
| `GET`/`POST /open-finance/v2/authorize` | the frontend, for the signed-in person | this API's envelope |
| `GET /bank/accounts`, `POST /bank/accounts/{id}/ledger-entries` | the frontend, for the signed-in person | this API's envelope |
| `GET /bank/customers/{customerId}/accounts`, `POST /bank/customers/{customerId}/accounts/{id}/ledger-entries` | the frontend's demonstration console, for somebody else by id | this API's envelope |

And one call the bank **makes**: `POST {noticeUri}` to the DataRecipient — see below.

Field names follow the specification: `creditDebitType`, `transactionDateTime`,
`transactionAmount: { amount: "50.00", currency }`, `completedAuthorisedPaymentType`,
`merchantCategoryCode`, `payeeDocument`. Consent ids are URNs (`urn:sandbox-bank:<uuid>`), and the
consent rides in the OAuth `scope` (`openid accounts consent:<urn>`).

## The flow

```
open-finance                 sandbox-bank                       browser / frontend
POST /token (client creds) ->
POST /consents             -> AWAITING_AUTHORISATION
                                                                <- authorisationUrl (state, S256 challenge)
                              GET  /authorize   <- the bank's screen: who asks, for what, which accounts
                              POST /authorize   <- APPROVE + accountIds  -> redirect ?code&state
POST /token (code+verifier)-> code redeemed once; access + refresh token bound to the consent
GET  /accounts, …/transactions
```

- **PKCE S256 is mandatory.** The code is bound to the client, the exact registered redirect and
  the challenge; any mismatch is `invalid_grant`, with no hint which.
- **Codes and tokens are stored as SHA-256 fingerprints.** A leaked row cannot be replayed.
- **Refresh tokens rotate.** Replaying a spent one revokes everything that consent ever issued.
- **Revoking the consent revokes its tokens.** The ledger stays: a bank keeps its own history;
  what is deleted on revocation is the platform's derived data (`open-finance`'s purge).

## Deliberate simplifications — state them in the paper

| Real ecosystem | Here | Why |
| --- | --- | --- |
| The bank signs the customer in with its own credentials | The platform session stands in for that login; `customer_id` **is** the platform user id | A second credential set adds nothing to the protocol being demonstrated |
| FAPI: mTLS with ICP-Brasil certificates, `private_key_jwt`, PAR, signed request objects | HTTP Basic client authentication, one client from the environment | The certificate infrastructure is out of reach; the protocol *shape* is what is shown |
| Directory of participants | `ConfiguredClientRegistry`: one client, its secret and its redirect from `env` | Same reason |
| Credit cards served by `credit-cards-accounts` | Folded into `/accounts` as `type: CARTAO_CREDITO` | One statement endpoint covers what detection needs |
| `CONSENTS` and `ACCOUNTS` token scopes | As named, not the specification's full scope list | Only these two are ever exercised |
| The customer arrives with accounts | Every new customer gets a checking account and a card on first contact (`DemoAccountOpening`) | An empty authorisation screen demonstrates nothing |
| Phase 2 data sharing is pull-only; event notifications are authenticated with mTLS | The bank posts a "resources changed" notice to the enrolled `noticeUri`, authenticated with the enrolment's client credentials over HTTP Basic | Real-time statements are the demo's point; the notice only prompts the same protocol pull |

## Booking entries

`POST /sandbox/bank/accounts/{id}/ledger-entries` is how a demo says "I just bet R$ 50". It writes
to the bank and **nowhere else**. The demonstration console's variant,
`/bank/customers/{customerId}/accounts/{id}/ledger-entries`, books on somebody else's account named
in the path, so a presenter can type a movement and watch another screen update. Its account
listing **opens nothing**: the bank cannot tell a real customer id from a typo.

Both routes are **not mounted** when `SANDBOX_BANK_LEDGER_WRITES=disabled` (production included: the
switch alone decides).
A fabricated movement must never be able to reach a real person's statement.

### The notice to the DataRecipient

After booking, `RecordLedgerEntry` tells each DataRecipient whose **active** consent shares that
account that the consent's resources changed (`DataRecipientNotifier` → `HttpDataRecipientNotifier`):

```
POST {client.noticeUri}            Authorization: Basic <clientId:clientSecret>
{ "data": { "consentId": "urn:sandbox-bank:<uuid>" } }
```

The notice names the consent and **nothing else** — no movement, no amount, no customer. The
recipient still pulls the statement over the protocol with its own token, so the notice cannot
become a side channel for data the consent does not cover. It is best effort: a recipient that is
down is logged by consent id, the entry stays booked, and the next synchronisation reads it.

Invariants (`LedgerEntry.book`, mirrored by CHECK constraints): a non-zero amount, a statement line
of 1–140 characters, an MCC of four digits, a CPF or CNPJ of digits only, and only `CARTAO`
movements on a credit-card account.

## Seed data

`prisma/seed.ts` books a synthetic year through `RecordLedgerEntry`, including the cases the
classifier must survive: a bookmaker behind a generic `PIX ENVIADO` line (CNPJ only), a
non-betting merchant whose name contains "bet" (`Padaria Betânia`), and a refund from a bookmaker.
Every institution and CNPJ is invented; never put a real CPF, CNPJ or account number here.
