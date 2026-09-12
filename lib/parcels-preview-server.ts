import type { ParcelSummary } from './api'

// Server-only, for the landing page's live preview strip: a few real
// delinquent parcels, fetched directly from the orchestrator (same pattern as
// counties-server.ts) rather than through the client's read-only proxy. Never
// throws - an unreachable orchestrator just means the landing page renders
// without the live strip.
export async function getPreviewParcels(countyId: string, count: number): Promise<ParcelSummary[]> {
  const base = (process.env.ORCHESTRATOR_URL || 'http://localhost:3100').replace(/\/+$/, '')
  try {
    const res = await fetch(`${base}/${countyId}/parcels/taxes/delinquent`, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const parcels = (await res.json()) as ParcelSummary[]
    return [...parcels].sort((a, b) => b.taxesOwed - a.taxesOwed).slice(0, count)
  } catch {
    return []
  }
}
