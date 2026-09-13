# cts-ui

Consumer-facing web app for CarolinaTaxSale.com.

Two pieces:

- **Landing page** (`/`) and email-only OTP sign in (`/login`) - no
  passwords, no OAuth. A visitor enters their email, gets a one-time code,
  and is signed in.
- **Product experience** (`/app`) - the same parcel map/list/detail
  experience as `admin-ui`'s Analyze tab, adapted for a consumer: full-width
  layout, a county dropdown instead of a sidebar, and none of the
  ingestion/execute/infrastructure tooling.

## Local development

```
pnpm install
pnpm dev
```

Reads parcel data from the data-orchestrator API through a same-origin,
read-only proxy (see `ORCHESTRATOR_URL` in `.env.example`) - point it at a
locally running `all-in-one` stack (`http://localhost:3100`) or a deployed
orchestrator.

Auth (email OTP) reads/writes the `consumer_auth` schema on the `pdo-db`
Postgres instance on Fly.io - see `AUTH_DB_URL` in `.env.example` and
`scripts/provision-auth-db.mjs`. OTP codes are logged to the server console
in place of a real email until Brevo is wired up in `lib/email.ts`.

`npm run provision-auth-db` (idempotent; `-- --rotate` for a new password) sets that store up.
The schema and its tables belong to the no-login `cts_ui_owner` role.
The app connects as `cts_ui_app`, which gets only the row privileges `lib/otp.ts` uses (`TABLE_GRANTS` in the script) and nothing in `parcels`.
A new auth table or query needs its grant added there, and the script's closing privilege check fails until it is.
The login lands in the gitignored `.env.auth-db`: copy it into `.env` as `AUTH_DB_URL`, and into all-in-one's root `.env` as `CTS_UI_AUTH_DB_URL` for the compose stack.
