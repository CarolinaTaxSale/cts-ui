# cts-ui

Consumer-facing web app for CarolinaTaxSale.com.

Two pieces:

- **Landing page** (`/`) and email-only OTP sign in (`/login`).
  No passwords, no OAuth: a visitor enters their email, gets a one-time code, and is signed in.
- **Product experience** (`/app/:state/:county`, e.g. `/app/sc/york`; `/app` opens the first county): the same parcel map, list and detail experience as `admin-ui`'s Analyze tab, adapted for a consumer.
  Full-width layout, a county menu instead of a sidebar, and none of the ingestion or infrastructure tooling.

## Local development

```
pnpm install
pnpm dev
```

Copy `.env.example` to `.env.local` and fill it in.

## Where the data comes from

This app is the product; `admin-ui`, `data-orchestrator` and `data-retriever` are a local data-collection tool it never calls.
Everything it shows is read straight from two places the orchestrator fills:

- **Postgres** (`PARCELS_DB_URL`): the `parcels` schema, read-only.
  In production that is pdo-db on Fly.io, which the orchestrator's `etl` job rebuilds per county.
  Locally you can point it at the all-in-one stack's Postgres instead (`postgres://postgres:postgres@localhost:5432/CarolinaTaxSale`).
  `lib/server/parcels.ts` holds every query.
- **The image store** (`S3_*`): parcel images in the R2 bucket.
  `parcels.stored_images` says which object holds each parcel's `satellite-card`, `satellite-hero` and `street-view` image, and `app/api/counties/[county]/parcels/[parcel]/images/[kind]` streams it.
  The orchestrator's `parcel-images` job produces them; a parcel it hasn't reached yet shows a placeholder.

So new data reaches production in this order: the orchestrator's enrichment jobs, then `parcel-images`, then `etl`.

The query rules, county list, types and Analyze components are copies of code in the other services.
all-in-one's `docs/shared-code-inventory.md` lists each copy, its source and the options for sharing it instead.

## API

| Route | Returns | Who |
|---|---|---|
| `GET /api/counties/:county/parcels` | The county's delinquent parcels (card and map pin fields) | Signed in |
| `GET /api/counties/:county/parcels/:parcel` | One parcel in full | Signed in |
| `GET /api/counties/:county/parcels/:parcel/images/satellite-card` | The card thumbnail, or 404 | Anyone (the landing page shows it) |
| `GET /api/counties/:county/parcels/:parcel/images/:kind` | `satellite-hero` or `street-view`, or 404 | Signed in |
| `POST /api/auth/request-otp`, `POST /api/auth/verify-otp`, `POST /api/auth/logout` | Email OTP sign in | Anyone |

## Auth

Auth (email OTP) reads and writes the `consumer_auth` schema on pdo-db; see `AUTH_DB_URL` in `.env.example` and `scripts/provision-auth-db.mjs`.
With no `BREVO_API_KEY`, OTP codes are logged to the server console instead of emailed.
A session is a random token in an `httpOnly` cookie; only its hash is stored.

Every code request sends a real email, so requests are limited per address in the database: one a minute and five an hour (`lib/server/auth/otp.ts`).
That limit holds across restarts and replicas.
There is no per-IP limit in the app, because an address read from `X-Forwarded-For` can be forged; put one at the edge (CDN or load balancer) in front of it.
