// View models for the Analyze experience's parcel cards + map. `AnalyzeSummaryRow`
// projects the lightweight `ParcelSummary` list (what every card renders and
// what the map places pins from) - the derivation is already done server-side
// (lib/server/parcels.ts). `AnalyzeRow` projects a full `Parcel`, fetched on
// demand for exactly one parcel at a time (the detail dialog, and the map's
// single selected outline) - see use-selected-parcel.ts.

import type { Owner, Parcel, ParcelSummary, PaymentHistoryEntry, Sale, StreetViewInsight, TaxHistoryEntry, Valuation } from '@/lib/types'
import { toLatLng } from '@/components/product/leaflet-constants'
import { parcelKey } from '@/lib/parcel-key'

export type AnalyzeSummaryRow = {
  // parcelKey(countyId, id) - what selection, saving and map pins go by, since a
  // parcel id alone can repeat across counties.
  key: string
  id: string
  countyId: string
  // False for a saved parcel that has been paid up since it was saved.
  isDelinquent: boolean
  owner: string
  // The first owner's mailing address, or '' when the county lists none.
  ownerAddress: string
  type: string
  acres: number | null
  marketValue: number
  taxesOwed: number
  address: string
  countyParcelUrl: string
  // Feet of boundary running along a road (road-frontage job) and miles from the
  // parcel to its nearest owner's mailing address (address-normalization job).
  // null until the job that produces each has run - not the same as zero.
  roadFrontageFt: number | null
  isLandlocked: boolean | null
  ownerDistance: number | null
  // An owner's mailing address is the parcel itself.
  ownerAtParcel: boolean
  // Bills still unpaid - the red dots on the payment-timing chart.
  latePayments: number
  paymentHistory: PaymentHistoryEntry[]
  // [lat, lng], or null for a parcel with no centroid yet.
  centroid: [number, number] | null
}

export type AnalyzeRow = {
  key: string
  id: string
  countyId: string
  owner: string
  type: string
  acres: number | null
  marketValue: number
  taxesOwed: number
  address: string
  zoning: string[]
  owners: Owner[]
  // Parcel-level owner-location insight (`parcels.insights`): miles from
  // the parcel to the nearest owner's mailing address, and whether an owner's
  // mailing address is the parcel itself. null when address-normalization hasn't
  // produced the insight yet.
  ownerDistance: number | null
  ownerAtParcel: boolean
  valuations: Valuation[]
  sales: Sale[]
  // Every issued bill with the date (if any) it was paid - drives the detail
  // dialog's payment-timing chart. Empty when the parcel has no tax summary yet.
  paymentHistory: PaymentHistoryEntry[]
  // First polygon ring as a closed [lat, lng] ring - react-leaflet's Polygon
  // `positions` shape.
  polygon: [number, number][]
  // Whether there's Street View near the lot; null until it's been looked up.
  streetView: StreetViewInsight | null
}

function firstRing(polygons: number[][][]): [number, number][] {
  const ring = (polygons[0] ?? []).map(toLatLng)
  if (ring.length > 1) {
    const first = ring[0]
    const last = ring[ring.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first)
  }
  return ring
}

// The same trim lib/server/parcels.ts applies to ParcelSummary.paymentHistory: drop
// not-yet-issued placeholders (no bill amount and no payment) and order oldest
// first, so the detail dialog's chart draws exactly what the card's did.
function issuedBills(history: TaxHistoryEntry[]): PaymentHistoryEntry[] {
  return history
    .filter((e) => e.billAmount !== 0 || e.paymentDate)
    .sort((a, b) => a.billYear - b.billYear)
    .map((e) => ({ billYear: e.billYear, paymentDate: e.paymentDate }))
}

export function toAnalyzeSummaryRow(p: ParcelSummary): AnalyzeSummaryRow {
  return {
    key: parcelKey(p.countyId, p.parcelId),
    id: p.parcelId,
    countyId: p.countyId,
    isDelinquent: p.isDelinquent,
    owner: p.owner || '-',
    ownerAddress: p.ownerAddress ?? '',
    type: p.type || '-',
    acres: p.acreage,
    marketValue: p.marketValue,
    taxesOwed: p.taxesOwed,
    address: p.address,
    countyParcelUrl: p.countyParcelUrl ?? '',
    roadFrontageFt: p.roadFrontageFt,
    isLandlocked: p.isLandlocked ?? null,
    ownerDistance: p.ownerDistance,
    ownerAtParcel: p.isOwnerAddress ?? false,
    latePayments: p.latePayments,
    paymentHistory: p.paymentHistory ?? [],
    centroid: p.centroid ? toLatLng(p.centroid) : null,
  }
}

export function toAnalyzeRow(p: Parcel): AnalyzeRow {
  return {
    key: parcelKey(p.countyId, p.parcelId),
    id: p.parcelId,
    countyId: p.countyId,
    owner: p.owners[0]?.name ?? '-',
    type: p.zoning[0] ?? '-',
    acres: p.acreage,
    marketValue: p.valuations.find((v) => v.label === 'Total Market Value')?.amount ?? 0,
    taxesOwed: p.taxes?.taxOwed ?? 0,
    address: p.address,
    zoning: p.zoning,
    owners: p.owners,
    ownerDistance: p.insights?.ownerDistance ?? null,
    ownerAtParcel: p.insights?.isOwnerAddress ?? false,
    valuations: p.valuations,
    sales: p.sales,
    paymentHistory: issuedBills(p.taxes?.taxHistory ?? []),
    polygon: firstRing(p.polygons),
    streetView: p.insights?.streetView ?? null,
  }
}
