// Direct, read-only Postgres access to the `parcels` schema on pdo-db - the
// consumer database the orchestrator's `etl` job replicates into. No ORM: raw
// SQL, ported by hand from data-orchestrator's src/routes/parcels.ts and
// src/lib/parcelSerializer.ts, src/lib/acreage.ts, src/lib/sharedFootprints.ts
// (keep those in sync if the schema or serialization there changes).
//
// Why this exists at all: admin-ui/data-orchestrator/data-retriever are a
// local data-collection tool only - there is no orchestrator to call in
// production. This app is the actual product, so it reads the same
// `parcels` schema straight from Postgres, over the same `consumer_reader`
// role the orchestrator's own ETL provisioning already created (read-only,
// SELECT on parcels.* - see all-in-one/scripts/consumer-db.mjs). Image URLs
// (satellite/street-view) still proxy to ORCHESTRATOR_URL for now - see the
// route handler's own note.

import postgres from 'postgres'
import { getCountyConfig } from './counties'
import type { Parcel, ParcelMeta, ParcelSummary, PaymentHistoryEntry } from './api'

declare global {
  var __ctsParcelsDb: ReturnType<typeof postgres> | undefined
}

function createClient() {
  const url = process.env.PARCELS_DB_URL
  if (!url) throw new Error('PARCELS_DB_URL is not set - see .env.example')
  // TLS comes from the URL's sslmode (verify-full for pdo-db). An explicit `ssl`
  // option would override it, and `ssl: 'require'` skips certificate checks.
  return postgres(url, { max: 5 })
}

// Lazy for the same reason lib/db.ts is: `next build` imports every route
// module to collect its metadata, and that must not require the env var or
// open a connection.
function getClient(): ReturnType<typeof postgres> {
  if (!globalThis.__ctsParcelsDb) globalThis.__ctsParcelsDb = createClient()
  return globalThis.__ctsParcelsDb
}

const sql: ReturnType<typeof postgres> = new Proxy((() => {}) as unknown as ReturnType<typeof postgres>, {
  apply: (_target, thisArg, args) => Reflect.apply(getClient() as unknown as (...a: unknown[]) => unknown, thisArg, args),
  get: (_target, prop, receiver) => Reflect.get(getClient(), prop, receiver),
})

// --- shared helpers, ported from acreage.ts / parcelSerializer.ts ---

type AcreageBasis = 'assessed' | 'calculated'

function chooseAcreage(input: {
  assessedAcreage: number | null
  calculatedAcreage: number | null
  isSharedFootprint: boolean
}): { acreage: number | null; acreageBasis: AcreageBasis | null } {
  const { assessedAcreage, calculatedAcreage, isSharedFootprint } = input
  if (isSharedFootprint || calculatedAcreage === null) {
    return assessedAcreage === null ? { acreage: null, acreageBasis: null } : { acreage: assessedAcreage, acreageBasis: 'assessed' }
  }
  return { acreage: calculatedAcreage, acreageBasis: 'calculated' }
}

function toNumber(value: string | number | null): number | null {
  return value === null ? null : Number(value)
}

function toIso(value: Date | string | null): string | null {
  if (value === null) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

/** Of the given footprint keys, which ones more than one parcel sits on - see sharedFootprints.ts. */
async function findSharedFootprintKeys(keys: (string | null)[]): Promise<Set<string>> {
  const present = [...new Set(keys.filter((k): k is string => k !== null))]
  if (present.length === 0) return new Set()
  const rows = await sql<{ key: string }[]>`
    select footprint_key as key
    from parcels.attributes
    where footprint_key in ${sql(present)}
    group by footprint_key
    having count(*) > 1
  `
  return new Set(rows.map((r) => r.key))
}

// The bills the payment-timing chart draws, one dot each - see
// parcelSerializer.ts's issuedBills. Oldest bill year first.
function issuedBills(bills: { billYear: number; billAmount: string | number; paymentDate: Date | string | null }[]): PaymentHistoryEntry[] {
  return bills
    .filter((b) => b.paymentDate !== null || Number(b.billAmount) !== 0)
    .sort((a, b) => a.billYear - b.billYear)
    .map((b) => ({ billYear: b.billYear, paymentDate: toIso(b.paymentDate) }))
}

// --- GET /:county/parcels/meta ---

export async function getParcelMeta(countyId: string): Promise<ParcelMeta> {
  const [row] = await sql<{ totalParcels: number; totalAssessedValue: string; totalTaxesOwed: string; delinquentCount: number }[]>`
    select
      count(*)::int as "totalParcels",
      coalesce(sum(total_assessed_value), 0) as "totalAssessedValue",
      coalesce(sum(tax_owed) filter (where is_delinquent), 0) as "totalTaxesOwed",
      count(*) filter (where is_delinquent)::int as "delinquentCount"
    from parcels.meta
    where county_id = ${countyId}
  `
  return {
    totalParcels: row?.totalParcels ?? 0,
    totalAssessedValue: Number(row?.totalAssessedValue ?? 0),
    totalTaxesOwed: Number(row?.totalTaxesOwed ?? 0),
    delinquentCount: row?.delinquentCount ?? 0,
  }
}

// --- GET /:county/parcels/taxes/delinquent ---

type DelinquentRow = {
  parcelId: string
  taxOwed: string | null
  address: string | null
  normalizedAddress: string | null
  assessedAcreage: string | null
  calculatedAcreage: string | null
  footprintKey: string | null
  centroidsRaw: unknown
  ownerName: string | null
  ownerAddress: string | null
  zoningDescription: string | null
  marketValue: string | null
  ownerDistance: string | null
  isOwnerAddress: boolean | null
  roadFrontageFt: string | null
  isLandlocked: boolean | null
  taxBills: { billYear: number; billAmount: string; paymentDate: string | null }[]
}

/** Every delinquent parcel in the county, or with `limit`, the ones owing the most tax. */
export async function getDelinquentParcels(countyId: string, { limit }: { limit?: number } = {}): Promise<ParcelSummary[]> {
  const config = getCountyConfig(countyId)
  const rows = await sql<DelinquentRow[]>`
    select
      m.parcel_id as "parcelId",
      m.tax_owed as "taxOwed",
      a.address, a.normalized_address as "normalizedAddress",
      a.assessed_acreage as "assessedAcreage", a.calculated_acreage as "calculatedAcreage",
      a.footprint_key as "footprintKey", a.centroids_raw as "centroidsRaw",
      o.name as "ownerName", o.address as "ownerAddress",
      z.description as "zoningDescription",
      v.amount as "marketValue",
      i.owner_distance as "ownerDistance", i.is_owner_address as "isOwnerAddress",
      i.road_frontage_ft as "roadFrontageFt", i.is_landlocked as "isLandlocked",
      coalesce(tb.bills, '[]'::jsonb) as "taxBills"
    from parcels.meta m
    left join parcels.attributes a on a.parcel_uuid = m.parcel_uuid
    left join lateral (
      select name, address from parcels.owners where parcel_uuid = m.parcel_uuid order by position asc limit 1
    ) o on true
    left join lateral (
      select description from parcels.zoning where parcel_uuid = m.parcel_uuid order by position asc limit 1
    ) z on true
    left join lateral (
      select amount from parcels.valuations where parcel_uuid = m.parcel_uuid and label = 'Total Market Value' limit 1
    ) v on true
    left join parcels.insights i on i.parcel_uuid = m.parcel_uuid
    left join lateral (
      select jsonb_agg(jsonb_build_object('billYear', bill_year, 'billAmount', bill_amount, 'paymentDate', payment_date)) as bills
      from parcels.tax_bills where parcel_uuid = m.parcel_uuid
    ) tb on true
    where m.county_id = ${countyId} and m.is_delinquent = true
    ${limit === undefined ? sql`` : sql`order by m.tax_owed desc nulls last limit ${limit}`}
  `

  const sharedFootprintKeys = await findSharedFootprintKeys(rows.map((r) => r.footprintKey))

  return rows.map((row): ParcelSummary => {
    const chosen = chooseAcreage({
      assessedAcreage: toNumber(row.assessedAcreage),
      calculatedAcreage: toNumber(row.calculatedAcreage),
      isSharedFootprint: row.footprintKey !== null && sharedFootprintKeys.has(row.footprintKey),
    })
    const centroids = (row.centroidsRaw as number[][] | null) ?? []
    const paymentHistory = issuedBills(row.taxBills)

    return {
      countyId,
      parcelId: row.parcelId,
      address: row.normalizedAddress ?? row.address ?? '',
      owner: row.ownerName ?? '',
      ownerAddress: row.ownerAddress ?? '',
      type: row.zoningDescription ?? '',
      acreage: chosen.acreage,
      marketValue: row.marketValue ? Number(row.marketValue) : 0,
      taxesOwed: toNumber(row.taxOwed) ?? 0,
      centroid: (centroids[0] as [number, number] | undefined) ?? null,
      countyParcelUrl: config ? config.countyParcelUrl(row.parcelId) : '',
      roadFrontageFt: toNumber(row.roadFrontageFt),
      isLandlocked: row.isLandlocked ?? null,
      ownerDistance: toNumber(row.ownerDistance),
      isOwnerAddress: row.isOwnerAddress ?? null,
      latePayments: paymentHistory.filter((b) => b.paymentDate === null).length,
      paymentHistory,
    }
  })
}

// --- GET /:county/parcels/:id ---

type ParcelHeadRow = {
  parcelUuid: string
  address: string | null
  normalizedAddress: string | null
  assessedAcreage: string | null
  calculatedAcreage: string | null
  footprintKey: string | null
  polygonsRaw: unknown
  centroidsRaw: unknown
  hasInsights: boolean
  ownerDistance: string | null
  isOwnerAddress: boolean | null
  streetView: { status: 'ok' | 'none'; capturedAt?: string | null } | null
  taxOwed: string | null
  latePayments: number | null
  lastPaidDate: string | null
}

// pdo-db's `etl` job replicates data-orchestrator's migrations on its own
// schedule, so it can briefly lag a newly added column (see cts-ui's README -
// this is exactly what happened with `insights.street_view`, added in
// data-orchestrator's migration 0015 after the last ETL run). Checked once
// and cached rather than on every request; self-heals the moment the column
// exists with no code change or restart needed elsewhere.
let hasStreetViewColumn: Promise<boolean> | undefined
function checkStreetViewColumn(): Promise<boolean> {
  if (!hasStreetViewColumn) {
    hasStreetViewColumn = sql<{ exists: boolean }[]>`
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'parcels' and table_name = 'insights' and column_name = 'street_view'
      ) as "exists"
    `.then((rows) => rows[0]?.exists ?? false)
  }
  return hasStreetViewColumn
}

export async function getParcel(countyId: string, parcelId: string): Promise<Parcel | null> {
  const streetViewAvailable = await checkStreetViewColumn()
  const [head] = await sql<ParcelHeadRow[]>`
    select
      m.parcel_uuid as "parcelUuid",
      a.address, a.normalized_address as "normalizedAddress",
      a.assessed_acreage as "assessedAcreage", a.calculated_acreage as "calculatedAcreage",
      a.footprint_key as "footprintKey", a.polygons_raw as "polygonsRaw", a.centroids_raw as "centroidsRaw",
      (i.parcel_uuid is not null) as "hasInsights",
      i.owner_distance as "ownerDistance", i.is_owner_address as "isOwnerAddress",
      ${streetViewAvailable ? sql`i.street_view` : sql`null`} as "streetView",
      ts.tax_owed as "taxOwed", ts.late_payments as "latePayments", ts.last_paid_date as "lastPaidDate"
    from parcels.meta m
    left join parcels.attributes a on a.parcel_uuid = m.parcel_uuid
    left join parcels.insights i on i.parcel_uuid = m.parcel_uuid
    left join parcels.tax_summary ts on ts.parcel_uuid = m.parcel_uuid
    where m.county_id = ${countyId} and m.parcel_id = ${parcelId}
  `
  if (!head) return null
  const parcelUuid = head.parcelUuid

  const [owners, zoning, valuations, sales, buildings, photos, taxBills] = await Promise.all([
    sql<{ name: string; address: string | null; normalizedAddress: string | null; nameKey: string | null }[]>`
      select name, address, normalized_address as "normalizedAddress", name_key as "nameKey"
      from parcels.owners where parcel_uuid = ${parcelUuid} order by position asc
    `,
    sql<{ description: string }[]>`select description from parcels.zoning where parcel_uuid = ${parcelUuid} order by position asc`,
    sql<{ label: string; amount: string }[]>`select label, amount from parcels.valuations where parcel_uuid = ${parcelUuid} order by position asc`,
    sql<{ saleDate: string | null; price: string; instrument: string; seller: string; buyer: string }[]>`
      select sale_date as "saleDate", price, instrument, seller, buyer
      from parcels.sales where parcel_uuid = ${parcelUuid} order by position asc
    `,
    sql<{ category: string; label: string; sqft: number | null; year: number | null; value: string }[]>`
      select category, label, sqft, year, value from parcels.buildings where parcel_uuid = ${parcelUuid} order by position asc
    `,
    sql<{ url: string; label: string }[]>`select url, label from parcels.photos where parcel_uuid = ${parcelUuid} order by position asc`,
    sql<{ billYear: number; billDate: string | null; billAmount: string; amountDue: string; paymentDate: string | null }[]>`
      select bill_year as "billYear", bill_date as "billDate", bill_amount as "billAmount", amount_due as "amountDue", payment_date as "paymentDate"
      from parcels.tax_bills where parcel_uuid = ${parcelUuid} order by position asc
    `,
  ])

  const identityByNameKey = await ownerIdentityOverlay(countyId, owners.map((o) => o.nameKey))
  const sharedFootprintKeys = await findSharedFootprintKeys([head.footprintKey])
  const chosen = chooseAcreage({
    assessedAcreage: toNumber(head.assessedAcreage),
    calculatedAcreage: toNumber(head.calculatedAcreage),
    isSharedFootprint: head.footprintKey !== null && sharedFootprintKeys.has(head.footprintKey),
  })

  return {
    countyId,
    parcelId,
    address: head.normalizedAddress ?? head.address ?? '',
    rawAddress: head.address ?? '',
    normalizedAddress: head.normalizedAddress ?? null,
    zoning: zoning.map((z) => z.description),
    acreage: chosen.acreage,
    buildings: buildings.map((b) => ({ category: b.category, label: b.label, sqft: b.sqft, year: b.year, value: Number(b.value) })),
    owners: owners.map((o) => {
      const identity = o.nameKey ? identityByNameKey.get(o.nameKey) : undefined
      return {
        name: o.name,
        address: o.address ?? '',
        ...(o.normalizedAddress !== null ? { normalizedAddress: o.normalizedAddress } : {}),
        ...(identity ? { identity } : {}),
      }
    }),
    photos: photos.map((p) => ({ url: p.url, label: p.label })),
    valuations: valuations.map((v) => ({ label: v.label, amount: Number(v.amount) })),
    sales: sales.map((s) => ({ date: toIso(s.saleDate), price: Number(s.price), instrument: s.instrument, seller: s.seller, buyer: s.buyer })),
    polygons: (head.polygonsRaw as number[][][] | null) ?? [],
    centroids: (head.centroidsRaw as number[][] | null) ?? [],
    insights: head.hasInsights
      ? {
          ownerDistance: toNumber(head.ownerDistance) ?? 0,
          isOwnerAddress: head.isOwnerAddress ?? false,
          streetView: head.streetView
            ? head.streetView.status === 'ok'
              ? { available: true, capturedAt: head.streetView.capturedAt ?? null }
              : { available: false, capturedAt: null }
            : null,
        }
      : null,
    taxes: head.taxOwed === null
      ? null
      : {
          taxOwed: Number(head.taxOwed),
          latePayments: head.latePayments ?? 0,
          lastPaidDate: toIso(head.lastPaidDate),
          taxHistory: taxBills.map((t) => ({
            billYear: t.billYear,
            billDate: toIso(t.billDate),
            billAmount: Number(t.billAmount),
            amountDue: Number(t.amountDue),
            paymentDate: toIso(t.paymentDate),
          })),
        },
  }
}

type OwnerIdentityOverlay = NonNullable<Parcel['owners'][number]['identity']>

/** name_key -> confirmed owner-identity + live holdings, for this parcel's owners - see parcels.ts's ownerIdentityOverlay. */
async function ownerIdentityOverlay(countyId: string, ownerNameKeys: (string | null)[]): Promise<Map<string, OwnerIdentityOverlay>> {
  const keys = [...new Set(ownerNameKeys.filter((k): k is string => !!k))]
  if (keys.length === 0) return new Map()

  const rows = await sql<{
    nameKey: string
    id: string
    canonicalName: string
    entityType: string
    parcelCount: number | null
    delinquentCount: number | null
    totalAssessedValue: string | null
    totalTaxOwed: string | null
  }[]>`
    select
      mem.name_key as "nameKey",
      oi.identity_uuid as "id",
      oi.canonical_name as "canonicalName",
      oi.entity_type as "entityType",
      oh.parcel_count as "parcelCount",
      oh.delinquent_count as "delinquentCount",
      oh.total_assessed_value as "totalAssessedValue",
      oh.total_tax_owed as "totalTaxOwed"
    from parcels.owner_identity_members mem
    join parcels.owner_identities oi
      on oi.identity_uuid = mem.identity_uuid and oi.status = 'confirmed'
    left join parcels.owner_holdings oh on oh.identity_uuid = oi.identity_uuid
    where mem.county_id = ${countyId} and mem.name_key in ${sql(keys)}
  `

  return new Map(
    rows.map((r) => [
      r.nameKey,
      {
        id: r.id,
        canonicalName: r.canonicalName,
        entityType: r.entityType,
        holdings: {
          parcelCount: Number(r.parcelCount ?? 0),
          delinquentCount: Number(r.delinquentCount ?? 0),
          totalAssessedValue: Number(r.totalAssessedValue ?? 0),
          totalTaxOwed: Number(r.totalTaxOwed ?? 0),
        },
      },
    ]),
  )
}
