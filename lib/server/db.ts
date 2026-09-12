import 'server-only'
import postgres from 'postgres'

type Sql = ReturnType<typeof postgres>

declare global {
  var __ctsParcelsDb: Sql | undefined
}

/**
 * The read-only client for the `parcels` schema (pdo-db in production, over
 * the `consumer_reader` role). Created on first use rather than at import, so
 * `next build` can collect routes without the env var, and kept on globalThis
 * so dev-mode module reloads don't open a new pool per edit.
 *
 * TLS comes from the URL's sslmode (verify-full for pdo-db). An explicit `ssl`
 * option would override it, and `ssl: 'require'` skips certificate checks.
 */
export function parcelsDb(): Sql {
  if (!globalThis.__ctsParcelsDb) {
    const url = process.env.PARCELS_DB_URL
    if (!url) throw new Error('PARCELS_DB_URL is not set - see .env.example')
    globalThis.__ctsParcelsDb = postgres(url, { max: 5 })
  }
  return globalThis.__ctsParcelsDb
}
