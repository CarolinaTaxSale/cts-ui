import 'server-only'

// Read-only SQL against the `parcels` schema - the consumer database that
// data-orchestrator's `etl` job replicates into. Raw SQL, no ORM.
//
// The response shapes, and the rules behind acreage, payment history and the
// owner-identity overlay, are ports of data-orchestrator's routes/parcels.ts,
// lib/parcelSerializer.ts, lib/acreage.ts and lib/sharedFootprints.ts. Both
// sides must change together; all-in-one's resources/docs/shared-code-inventory.md lists
// every copied rule and where it comes from.

import { getCountyConfig } from '../counties'
import type { StoredImageKind } from '../parcel-images'
import type { Parcel, ParcelSummary, PaymentHistoryEntry } from '../types'
import { parcelsDb } from './db'

// --- rules ported from data-orchestrator ---

/** acreage.ts: the polygon's measurement, unless another parcel shares the footprint or there is none. */
function chooseAcreage(assessed: number | null, calculated: number | null, isSharedFootprint: boolean): number | null {
  return isSharedFootprint || calculated === null ? assessed : calculated
}

function toNumber(value: string | number | null): number | null {
  return value === null ? null : Number(value)
}

function toIso(value: Date | string | null): string | null {
  if (value === null) return null
  return (value instanceof Date ? value : new Date(value)).toISOString()
}

/** sharedFootprints.ts: of these footprint keys, the ones more than one parcel sits on. */
async function findSharedFootprintKeys(keys: (string | null)[]): Promise<Set<string>> {
  const present = [...new Set(keys.filter((k): k is string => k !== null))]
  if (present.length === 0) return new Set()
  const sql = parcelsDb()
  const rows = await sql<{ key: string }[]>`
    select footprint_key as key
    from parcels.attributes
    where footprint_key in ${sql(present)}
    group by footprint_key
    having count(*) > 1
  `
  return new Set(rows.map((r) => r.key))
}

/** parcelSerializer.ts issuedBills: the chart's dots - drop not-yet-issued placeholders, oldest year first. */
function issuedBills(bills: { billYear: number; billAmount: string | number; paymentDate: Date | string | null }[]): PaymentHistoryEntry[] {
  return bills
    .filter((b) => b.paymentDate !== null || Number(b.billAmount) !== 0)
    .sort((a, b) => a.billYear - b.billYear)
    .map((b) => ({ billYear: b.billYear, paymentDate: toIso(b.paymentDate) }))
}

// --- delinquent parcel list ---

type SummaryRow = {
  parcelId: string
  taxOwed: string | null
  address: string | null
  normalizedAddress: string | null
  assessedAcreage: string | null
  calculatedAcreage: string | null
  footprintKey: string | null
  centroids: number[][] | null
  ownerName: string | null
  ownerAddress: string | null
  zoning: string | null
  marketValue: string | null
  ownerDistance: string | null
  isOwnerAddress: boolean | null
  roadFrontageFt: string | null
  isLandlocked: boolean | null
  taxBills: { billYear: number; billAmount: string; paymentDate: string | null }[]
}

/** Every delinquent parcel in the county, or with `limit`, the ones owing the most tax. */
export async function getDelinquentParcels(countyId: string, { limit }: { limit?: number } = {}): Promise<ParcelSummary[]> {
  const sql = parcelsDb()
  const rows = await sql<SummaryRow[]>`
    select
      m.parcel_id as "parcelId",
      m.tax_owed as "taxOwed",
      a.address, a.normalized_address as "normalizedAddress",
      a.assessed_acreage as "assessedAcreage", a.calculated_acreage as "calculatedAcreage",
      a.footprint_key as "footprintKey", a.centroids_raw as centroids,
      o.name as "ownerName", o.address as "ownerAddress",
      z.description as zoning,
      v.amount as "marketValue",
      i.owner_distance as "ownerDistance", i.is_owner_address as "isOwnerAddress",
      i.road_frontage_ft as "roadFrontageFt", i.is_landlocked as "isLandlocked",
      coalesce(tb.bills, '[]'::jsonb) as "taxBills"
    from parcels.meta m
    left join parcels.attributes a on a.parcel_uuid = m.parcel_uuid
    left join lateral (
      select name, address from parcels.owners where parcel_uuid = m.parcel_uuid order by position limit 1
    ) o on true
    left join lateral (
      select description from parcels.zoning where parcel_uuid = m.parcel_uuid order by position limit 1
    ) z on true
    left join lateral (
      select amount from parcels.valuations where parcel_uuid = m.parcel_uuid and label = 'Total Market Value' limit 1
    ) v on true
    left join parcels.insights i on i.parcel_uuid = m.parcel_uuid
    left join lateral (
      select jsonb_agg(jsonb_build_object('billYear', bill_year, 'billAmount', bill_amount, 'paymentDate', payment_date)) as bills
      from parcels.tax_bills where parcel_uuid = m.parcel_uuid
    ) tb on true
    where m.county_id = ${countyId} and m.is_delinquent
    ${limit === undefined ? sql`` : sql`order by m.tax_owed desc nulls last limit ${limit}`}
  `

  const shared = await findSharedFootprintKeys(rows.map((r) => r.footprintKey))
  const county = getCountyConfig(countyId)

  return rows.map((row) => {
    const paymentHistory = issuedBills(row.taxBills)
    return {
      countyId,
      parcelId: row.parcelId,
      address: row.normalizedAddress ?? row.address ?? '',
      owner: row.ownerName ?? '',
      ownerAddress: row.ownerAddress ?? '',
      type: row.zoning ?? '',
      acreage: chooseAcreage(
        toNumber(row.assessedAcreage),
        toNumber(row.calculatedAcreage),
        row.footprintKey !== null && shared.has(row.footprintKey),
      ),
      marketValue: row.marketValue === null ? 0 : Number(row.marketValue),
      taxesOwed: toNumber(row.taxOwed) ?? 0,
      centroid: (row.centroids?.[0] as [number, number] | undefined) ?? null,
      countyParcelUrl: county ? county.countyParcelUrl(row.parcelId) : '',
      roadFrontageFt: toNumber(row.roadFrontageFt),
      isLandlocked: row.isLandlocked,
      ownerDistance: toNumber(row.ownerDistance),
      isOwnerAddress: row.isOwnerAddress,
      // Bills still unpaid - exactly the chart's red dots.
      latePayments: paymentHistory.filter((b) => b.paymentDate === null).length,
      paymentHistory,
    }
  })
}

// --- one parcel in full ---

type ParcelRow = {
  parcelUuid: string
  address: string | null
  normalizedAddress: string | null
  assessedAcreage: string | null
  calculatedAcreage: string | null
  footprintKey: string | null
  polygons: number[][][] | null
  centroids: number[][] | null
  hasInsights: boolean
  ownerDistance: string | null
  isOwnerAddress: boolean | null
  streetView: { status: 'ok' | 'none'; capturedAt?: string | null } | null
  hasStreetViewImage: boolean
  taxOwed: string | null
  latePayments: number | null
  lastPaidDate: string | null
}

export async function getParcel(countyId: string, parcelId: string): Promise<Parcel | null> {
  const sql = parcelsDb()
  const [head] = await sql<ParcelRow[]>`
    select
      m.parcel_uuid as "parcelUuid",
      a.address, a.normalized_address as "normalizedAddress",
      a.assessed_acreage as "assessedAcreage", a.calculated_acreage as "calculatedAcreage",
      a.footprint_key as "footprintKey", a.polygons_raw as polygons, a.centroids_raw as centroids,
      i.parcel_uuid is not null as "hasInsights",
      i.owner_distance as "ownerDistance", i.is_owner_address as "isOwnerAddress", i.street_view as "streetView",
      exists (
        select 1 from parcels.stored_images si where si.parcel_uuid = m.parcel_uuid and si.kind = 'street-view'
      ) as "hasStreetViewImage",
      ts.tax_owed as "taxOwed", ts.late_payments as "latePayments", ts.last_paid_date as "lastPaidDate"
    from parcels.meta m
    left join parcels.attributes a on a.parcel_uuid = m.parcel_uuid
    left join parcels.insights i on i.parcel_uuid = m.parcel_uuid
    left join parcels.tax_summary ts on ts.parcel_uuid = m.parcel_uuid
    where m.county_id = ${countyId} and m.parcel_id = ${parcelId}
  `
  if (!head) return null
  const uuid = head.parcelUuid

  const [owners, zoning, valuations, sales, buildings, photos, taxBills, shared] = await Promise.all([
    sql<{ name: string; address: string | null; normalizedAddress: string | null; nameKey: string | null }[]>`
      select name, address, normalized_address as "normalizedAddress", name_key as "nameKey"
      from parcels.owners where parcel_uuid = ${uuid} order by position
    `,
    sql<{ description: string }[]>`select description from parcels.zoning where parcel_uuid = ${uuid} order by position`,
    sql<{ label: string; amount: string }[]>`select label, amount from parcels.valuations where parcel_uuid = ${uuid} order by position`,
    sql<{ saleDate: string | null; price: string; instrument: string; seller: string; buyer: string }[]>`
      select sale_date as "saleDate", price, instrument, seller, buyer
      from parcels.sales where parcel_uuid = ${uuid} order by position
    `,
    sql<{ category: string; label: string; sqft: number | null; year: number | null; value: string }[]>`
      select category, label, sqft, year, value from parcels.buildings where parcel_uuid = ${uuid} order by position
    `,
    sql<{ url: string; label: string }[]>`select url, label from parcels.photos where parcel_uuid = ${uuid} order by position`,
    sql<{ billYear: number; billDate: string | null; billAmount: string; amountDue: string; paymentDate: string | null }[]>`
      select bill_year as "billYear", bill_date as "billDate", bill_amount as "billAmount",
             amount_due as "amountDue", payment_date as "paymentDate"
      from parcels.tax_bills where parcel_uuid = ${uuid} order by position
    `,
    findSharedFootprintKeys([head.footprintKey]),
  ])
  const identities = await ownerIdentityOverlay(countyId, owners.map((o) => o.nameKey))

  return {
    countyId,
    parcelId,
    address: head.normalizedAddress ?? head.address ?? '',
    rawAddress: head.address ?? '',
    normalizedAddress: head.normalizedAddress,
    zoning: zoning.map((z) => z.description),
    acreage: chooseAcreage(
      toNumber(head.assessedAcreage),
      toNumber(head.calculatedAcreage),
      head.footprintKey !== null && shared.has(head.footprintKey),
    ),
    buildings: buildings.map((b) => ({ category: b.category, label: b.label, sqft: b.sqft, year: b.year, value: Number(b.value) })),
    owners: owners.map((o) => {
      const identity = o.nameKey ? identities.get(o.nameKey) : undefined
      return {
        name: o.name,
        address: o.address ?? '',
        ...(o.normalizedAddress !== null ? { normalizedAddress: o.normalizedAddress } : {}),
        ...(identity ? { identity } : {}),
      }
    }),
    photos,
    valuations: valuations.map((v) => ({ label: v.label, amount: Number(v.amount) })),
    sales: sales.map((s) => ({ date: toIso(s.saleDate), price: Number(s.price), instrument: s.instrument, seller: s.seller, buyer: s.buyer })),
    polygons: head.polygons ?? [],
    centroids: head.centroids ?? [],
    insights: head.hasInsights
      ? {
          ownerDistance: toNumber(head.ownerDistance) ?? 0,
          isOwnerAddress: head.isOwnerAddress ?? false,
          // Available means there's an image in the store to show, not just a pano on Google.
          streetView: head.hasStreetViewImage
            ? { available: true, capturedAt: head.streetView?.capturedAt ?? null }
            : head.streetView?.status === 'none'
              ? { available: false, capturedAt: null }
              : null,
        }
      : null,
    taxes:
      head.taxOwed === null
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

type OwnerIdentity = NonNullable<Parcel['owners'][number]['identity']>

/** parcels.ts ownerIdentityOverlay: name_key -> confirmed owner identity with its live holdings. */
async function ownerIdentityOverlay(countyId: string, nameKeys: (string | null)[]): Promise<Map<string, OwnerIdentity>> {
  const keys = [...new Set(nameKeys.filter((k): k is string => !!k))]
  if (keys.length === 0) return new Map()
  const sql = parcelsDb()
  const rows = await sql<{
    nameKey: string
    id: string
    canonicalName: string
    entityType: string
    parcelCount: string | null
    delinquentCount: string | null
    totalAssessedValue: string | null
    totalTaxOwed: string | null
  }[]>`
    select
      mem.name_key as "nameKey", oi.identity_uuid as id, oi.canonical_name as "canonicalName", oi.entity_type as "entityType",
      oh.parcel_count as "parcelCount", oh.delinquent_count as "delinquentCount",
      oh.total_assessed_value as "totalAssessedValue", oh.total_tax_owed as "totalTaxOwed"
    from parcels.owner_identity_members mem
    join parcels.owner_identities oi on oi.identity_uuid = mem.identity_uuid and oi.status = 'confirmed'
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

// --- images ---

/** Where the store holds this parcel's image of this kind, or null when it has none. */
export async function getStoredImage(
  countyId: string,
  parcelId: string,
  kind: StoredImageKind,
): Promise<{ objectKey: string; contentType: string } | null> {
  const sql = parcelsDb()
  const [row] = await sql<{ objectKey: string; contentType: string }[]>`
    select si.object_key as "objectKey", si.content_type as "contentType"
    from parcels.stored_images si
    join parcels.meta m on m.parcel_uuid = si.parcel_uuid
    where m.county_id = ${countyId} and m.parcel_id = ${parcelId} and si.kind = ${kind}
  `
  return row ?? null
}
