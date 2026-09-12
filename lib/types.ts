// The parcel data this app works with, shared by the server's queries
// (lib/server/parcels.ts), the JSON API (app/api/counties) and the browser
// (lib/api-client.ts). The shapes match what data-orchestrator's
// parcelSerializer produces for admin-ui, field for field, so the Analyze
// components copied from admin-ui work unchanged - see all-in-one's
// docs/shared-code-inventory.md.

export type County = { id: string; state: string; name: string }

export type OwnerHoldings = {
  parcelCount: number
  delinquentCount: number
  totalAssessedValue: number
  totalTaxOwed: number
}
export type OwnerIdentityRef = {
  id: string
  canonicalName: string
  entityType: string
  holdings: OwnerHoldings
}
export type Owner = {
  name: string
  address: string
  normalizedAddress?: string
  identity?: OwnerIdentityRef
}
export type Building = { category: string; label: string; sqft: number | null; year: number | null; value: number }
export type Photo = { url: string; label: string }
export type Valuation = { label: string; amount: number }
export type Sale = { date: string | null; price: number; instrument: string; seller: string; buyer: string }

// Whether the parcel has a Street View image to show. null when there is none
// to show and no lookup has said why; `available: false` when the lookup found
// no Street View near the lot.
export type StreetViewInsight = { available: boolean; capturedAt: string | null }
export type Insights = { ownerDistance: number; isOwnerAddress: boolean; streetView?: StreetViewInsight | null } | null

export type TaxHistoryEntry = {
  billYear: number
  billDate: string | null
  billAmount: number
  amountDue: number
  paymentDate: string | null
}
export type Taxes = {
  taxOwed: number
  latePayments: number
  lastPaidDate: string | null
  taxHistory: TaxHistoryEntry[]
} | null

export type Parcel = {
  countyId: string
  parcelId: string
  address: string
  rawAddress: string
  normalizedAddress: string | null
  zoning: string[]
  acreage: number | null
  buildings: Building[]
  owners: Owner[]
  photos: Photo[]
  valuations: Valuation[]
  sales: Sale[]
  polygons: number[][][]
  centroids: number[][]
  insights: Insights
  taxes: Taxes
}

// One issued tax bill as the payment-timing chart draws it: the year it was
// billed and the date (if any) it was paid.
export type PaymentHistoryEntry = { billYear: number; paymentDate: string | null }

// The list-view projection - everything a parcel card or map pin needs. The
// rest of a parcel is fetched on demand, one at a time, as a `Parcel`.
export type ParcelSummary = {
  countyId: string
  parcelId: string
  address: string
  owner: string
  type: string
  acreage: number | null
  marketValue: number
  taxesOwed: number
  centroid: [number, number] | null
  countyParcelUrl: string
  roadFrontageFt: number | null
  ownerDistance: number | null
  latePayments: number
  ownerAddress?: string
  isOwnerAddress?: boolean | null
  isLandlocked?: boolean | null
  paymentHistory?: PaymentHistoryEntry[]
}
