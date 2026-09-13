// Postgres client for the consumer auth store: the `consumer_auth` schema on
// `pdo-db` (Fly.io), reached over a dedicated least-privilege role
// (`cts_ui_app` - see scripts/provision-auth-db.mjs), never the
// orchestrator's `etl_writer`/`consumer_reader` roles. postgres.js is used
// (not psql/libpq) because libpq 17+ offers TLS ALPN, which Fly's pg_tls edge
// rejects - see all-in-one's consumer-db provisioning notes.
//
// One module-level client, reused across requests/warm lambdas (postgres.js
// pools internally); Next.js dev's module reload can otherwise open a new
// pool per edit, so this is guarded the same way a Prisma client normally is.

import postgres from 'postgres'

declare global {
  var __ctsAuthDb: ReturnType<typeof postgres> | undefined
}

function createClient() {
  const url = process.env.AUTH_DB_URL
  if (!url) throw new Error('AUTH_DB_URL is not set - see .env.example')
  // TLS comes from the URL's sslmode (verify-full, as provision-auth-db.mjs
  // writes it). An explicit `ssl` option would override it, and `ssl: 'require'`
  // silently skips certificate verification.
  return postgres(url, { max: 5 })
}

// Lazy: `next build` statically imports every route module to collect its
// metadata, including this one via lib/session.ts - eagerly connecting (or
// even just reading the env var) at module-evaluation time would fail that
// step in any environment where AUTH_DB_URL isn't set yet. The client is only
// actually constructed the first time a query runs.
function getClient(): ReturnType<typeof postgres> {
  if (!globalThis.__ctsAuthDb) globalThis.__ctsAuthDb = createClient()
  return globalThis.__ctsAuthDb
}

export const authDb: ReturnType<typeof postgres> = new Proxy((() => {}) as unknown as ReturnType<typeof postgres>, {
  apply: (_target, thisArg, args) => Reflect.apply(getClient() as unknown as (...a: unknown[]) => unknown, thisArg, args),
  get: (_target, prop, receiver) => Reflect.get(getClient(), prop, receiver),
})
