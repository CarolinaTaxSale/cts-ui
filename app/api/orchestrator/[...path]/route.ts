// Same-origin, READ-ONLY parcel/county data API, plus a thin image proxy.
//
// admin-ui/data-orchestrator/data-retriever are a local data-collection tool
// only - there is no orchestrator to call in production. So the JSON data
// paths below (counties, parcels/meta, parcels/taxes/delinquent, parcels/:id)
// are served directly from Postgres (see lib/parcels-db.ts, lib/counties.ts),
// not forwarded anywhere. The path shape is kept identical to the old
// orchestrator-proxying version of this route (and to admin-ui's own proxy)
// so lib/api.ts and lib/parcel-images.ts needed no changes.
//
// The two image paths (satellite/street-view) still forward to
// ORCHESTRATOR_URL - the orchestrator's image cache/store hasn't been ported
// here yet. That's a real gap for production (see cts-ui's README) - filed as
// a follow-up, not solved by this change.
//
// This stays a strict allowlist, same reasoning as before: this app is
// public-internet-facing, unlike admin-ui's trusted internal pass-through.

import { isValidCounty, COUNTIES } from '@/lib/counties'
import { getDelinquentParcels, getParcel, getParcelMeta } from '@/lib/parcels-db'

const DEFAULT_ORCHESTRATOR_URL = 'http://localhost:3100'

// Never cache a response, and never try to statically render this.
export const dynamic = 'force-dynamic'

const COUNTY = '[a-z]+\\.[a-z-]+'
const PARCEL = '[A-Za-z0-9-]+'
const IMAGE_PATHS = [
  new RegExp(`^(${COUNTY})/parcels/(${PARCEL})/satellite$`),
  new RegExp(`^(${COUNTY})/parcels/(${PARCEL})/street-view$`),
]

function resolveUpstreamBase(): string {
  const configured = process.env.ORCHESTRATOR_URL?.trim()
  if (configured && /^https?:\/\//i.test(configured)) return configured.replace(/\/+$/, '')
  return DEFAULT_ORCHESTRATOR_URL
}

async function proxyImage(path: string[], search: string): Promise<Response> {
  const base = resolveUpstreamBase()
  const target = `${base}/${path.map(encodeURIComponent).join('/')}${search}`

  let upstream: Response
  try {
    upstream = await fetch(target, { redirect: 'manual' })
  } catch {
    return Response.json({ error: 'data-orchestrator is unreachable from the cts-ui server' }, { status: 504 })
  }

  const body = await upstream.arrayBuffer()
  const out = new Headers()
  for (const name of ['content-type', 'cache-control', 'x-image-cache']) {
    const value = upstream.headers.get(name)
    if (value) out.set(name, value)
  }
  return new Response(body, { status: upstream.status, headers: out })
}

type Ctx = { params: Promise<{ path: string[] }> }

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { path } = await ctx.params
  const segments = path ?? []
  const joined = segments.join('/')
  const search = new URL(req.url).search

  if (joined === 'counties') {
    return Response.json(COUNTIES.map(({ id, state, name }) => ({ id, state, name })))
  }

  for (const re of IMAGE_PATHS) {
    if (re.test(joined)) return proxyImage(segments, search)
  }

  const [countyId, resource, ...rest] = segments
  if (!countyId || !isValidCounty(countyId) || resource !== 'parcels') {
    return Response.json({ error: 'not found' }, { status: 404 })
  }

  try {
    if (rest.length === 1 && rest[0] === 'meta') {
      return Response.json(await getParcelMeta(countyId))
    }
    if (rest.length === 2 && rest[0] === 'taxes' && rest[1] === 'delinquent') {
      return Response.json(await getDelinquentParcels(countyId))
    }
    if (rest.length === 1 && /^[A-Za-z0-9-]+$/.test(rest[0]!)) {
      const parcel = await getParcel(countyId, rest[0]!)
      if (!parcel) return Response.json({ error: 'not found' }, { status: 404 })
      return Response.json(parcel)
    }
  } catch (err) {
    console.error('parcels-db query failed', err)
    return Response.json({ error: 'the consumer database is unreachable' }, { status: 504 })
  }

  return Response.json({ error: 'not found' }, { status: 404 })
}
