import 'server-only'
import postgres from 'postgres'

type Sql = ReturnType<typeof postgres>

declare global {
  var __ctsParcelsDb: Sql | undefined
  var __ctsAuthDb: Sql | undefined
}

// Both clients are created on first use rather than at import, so `next build`
// can collect routes without the env vars, and kept on globalThis so dev-mode
// module reloads don't open a new pool per edit.
//
// TLS comes from each URL's sslmode (verify-full for pdo-db). An explicit `ssl`
// option would override it, and `ssl: 'require'` skips certificate checks.
function client(slot: '__ctsParcelsDb' | '__ctsAuthDb', envVar: string): Sql {
  const existing = globalThis[slot]
  if (existing) return existing
  const url = process.env[envVar]
  if (!url) throw new Error(`${envVar} is not set - see .env.example`)
  return (globalThis[slot] = postgres(url, { max: 5 }))
}

/** Read-only client for the `parcels` schema, over the `consumer_reader` role. */
export const parcelsDb = () => client('__ctsParcelsDb', 'PARCELS_DB_URL')

/** Client for the `consumer_auth` schema, over the `cts_ui_app` role (scripts/provision-auth-db.mjs). */
export const authDb = () => client('__ctsAuthDb', 'AUTH_DB_URL')
