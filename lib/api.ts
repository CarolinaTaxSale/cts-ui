// Typed, read-only client for the data-orchestrator service. Trimmed from
// admin-ui's lib/api.ts to just what the consumer Analyze experience needs -
// this app never runs jobs, tunes infrastructure, or reviews owner
// identities, so those endpoints aren't exposed here at all (see
// app/api/orchestrator/[...path]/route.ts's allowlist).
//
// Every call goes to the same-origin proxy at `/api/orchestrator/...`, which
// forwards it to the orchestrator server-side - the browser never talks to
// the orchestrator directly.

import { reportApiReachable, reportApiUnreachable } from './apiStatus'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const ORCHESTRATOR_PROXY = '/api/orchestrator'

async function requestUrl<T>(url: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(url)
  } catch (err) {
    // fetch only rejects on a network-level failure - our own proxy route
    // being unreachable, or offline.
    reportApiUnreachable()
    throw err
  }
  // The proxy answers 504 when it cannot reach the orchestrator upstream.
  if (res.status === 504) {
    reportApiUnreachable()
    throw new ApiError(504, 'data-orchestrator is unreachable')
  }
  reportApiReachable()
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ApiError(res.status, body || res.statusText)
  }
  return (await res.json()) as T
}

async function request<T>(countyId: string, path: string): Promise<T> {
  return requestUrl<T>(`${ORCHESTRATOR_PROXY}/${countyId}${path}`)
}

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
// streetView: null until the street-view job (or a first view of the image)
// has looked the parcel up; `available: false` = no Street View near the lot.
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

// The list-view projection returned by getDelinquentParcels - everything a
// parcel card or map pin needs. Fetch getParcel(countyId, parcelId) for the
// rest once a viewer picks one parcel.
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

export type ParcelMeta = {
  totalParcels: number
  totalAssessedValue: number
  totalTaxesOwed: number
  delinquentCount: number
}

export function getCounties() {
  return requestUrl<County[]>(`${ORCHESTRATOR_PROXY}/counties`)
}

export function getParcelMeta(countyId: string) {
  return request<ParcelMeta>(countyId, '/parcels/meta')
}

export function getDelinquentParcels(countyId: string) {
  return request<ParcelSummary[]>(countyId, '/parcels/taxes/delinquent')
}

export function getParcel(countyId: string, parcelId: string) {
  return request<Parcel>(countyId, `/parcels/${parcelId}`)
}
