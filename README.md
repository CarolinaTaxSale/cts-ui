# cts-ui

Consumer-facing web app for CarolinaTaxSale.com.

Three pieces:

- **Landing page** (`/`) and email-only OTP sign in (`/login`).
  No passwords, no OAuth: a visitor enters their email, gets a one-time code, and is signed in.
- **Product experience** (`/app/:state/:county`, e.g. `/app/sc/york`; `/app` opens the first county): the same parcel map, list and detail experience as `admin-ui`'s Analyze tab, adapted for a consumer.
  Full-width layout, a county menu instead of a sidebar, and none of the ingestion or infrastructure tooling.
- **Saved parcels** (`/app/saved`): the parcels a user saved (the heart), sorted into lists they name, plus every parcel they wrote a note on.
  A parcel can sit in any number of lists; adding one to a list saves it, and unsaving it takes it out of every list.

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

What users keep (saved parcels, lists, notes) is this app's own data, in the `consumer_app` schema (see [Auth and user data](#auth-and-user-data)).
It names parcels by county and parcel id rather than `parcels.meta.parcel_uuid`, so it survives the `etl` job rebuilding a county.

The query rules, county list, types and Analyze components are copies of code in the other services.
all-in-one's `resources/docs/shared-code-inventory.md` lists each copy, its source and the options for sharing it instead.

## API

| Route | Returns | Who |
|---|---|---|
| `GET /api/counties/:county/parcels` | The county's delinquent parcels (card and map pin fields) | Signed in |
| `GET /api/counties/:county/parcels/:parcel` | One parcel in full | Signed in |
| `GET /api/counties/:county/parcels/:parcel/images/satellite-card` | The card thumbnail, or 404 | Anyone (the landing page shows it) |
| `GET /api/counties/:county/parcels/:parcel/images/:kind` | `satellite-hero` or `street-view`, or 404 | Signed in |
| `POST /api/auth/request-otp`, `POST /api/auth/verify-otp`, `POST /api/auth/logout` | Email OTP sign in | Anyone |
| `GET /api/me/library` | The user's saved parcels (with the lists each is in), lists, and note previews | Signed in |
| `GET /api/me/library/parcels` | Card and map pin fields for every saved or noted parcel, across counties | Signed in |
| `PUT`, `DELETE /api/me/saved/:county/:parcel` | Save or unsave a parcel (204) | Signed in |
| `POST /api/me/lists` `{name}` | Create a list (201) | Signed in |
| `PATCH /api/me/lists/:list` `{name}`, `DELETE /api/me/lists/:list` | Rename or delete a list | Signed in |
| `PUT`, `DELETE /api/me/lists/:list/parcels/:county/:parcel` | Add a parcel to a list (saving it) or take it out (204) | Signed in |
| `GET`, `PUT /api/me/notes/:county/:parcel` `{body}` | The user's note on a parcel; a blank body deletes it | Signed in |

Every `/api/me` route acts only on the signed-in user's own rows.
One account can keep 5,000 saved parcels, 100 lists and notes of 20,000 characters (`lib/server/library.ts`).

## Auth and user data

Auth (email OTP) reads and writes the `consumer_auth` schema on pdo-db; see `AUTH_DB_URL` in `.env.example` and `scripts/provision-auth-db.mjs`.
With no `BREVO_API_KEY`, OTP codes are logged to the server console instead of emailed.
A session is a random token in an `httpOnly` cookie; only its hash is stored.

Every code request sends a real email, so requests are limited per address in the database: one a minute and five an hour (`lib/server/auth/otp.ts`).
That limit holds across restarts and replicas.
There is no per-IP limit in the app, because an address read from `X-Forwarded-For` can be forged; put one at the edge (CDN or load balancer) in front of it.

Saved parcels, lists and notes live beside it in the `consumer_app` schema, over the same connection (`lib/server/library.ts`).

`npm run provision-auth-db` (idempotent; `-- --rotate` for a new password) sets both schemas up, running every file in `migrations/` in name order.
The schemas and their tables belong to the no-login `cts_ui_owner` role.
The app connects as `cts_ui_app`, which gets only the row privileges the app's queries use (`TABLE_GRANTS` in the script) and nothing in `parcels`.
A new table or query needs its grant added there, and the script's closing privilege check fails until it is.
The login lands in the gitignored `.env.auth-db`: copy it into `.env` as `AUTH_DB_URL`, and into all-in-one's root `.env` as `CTS_UI_AUTH_DB_URL` for the compose stack.
