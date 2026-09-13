// The browser's side of app/api/counties: typed fetches for the Analyze
// experience. Everything here runs in the browser; the queries themselves live
// in lib/server/parcels.ts.

import type { Parcel, ParcelSummary } from './types'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(res.status, body?.error ?? res.statusText)
  }
  return (await res.json()) as T
}

const parcelsUrl = (countyId: string) => `/api/counties/${encodeURIComponent(countyId)}/parcels`

export function getDelinquentParcels(countyId: string) {
  return getJson<ParcelSummary[]>(parcelsUrl(countyId))
}

export function getParcel(countyId: string, parcelId: string) {
  return getJson<Parcel>(`${parcelsUrl(countyId)}/${encodeURIComponent(parcelId)}`)
}
