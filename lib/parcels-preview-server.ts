import { getDelinquentParcels } from './parcels-db'
import type { ParcelSummary } from './api'

// Server-only, for the landing page's live preview strip: a few real
// delinquent parcels, read directly from the consumer database (see
// lib/parcels-db.ts) rather than through the client's read-only proxy. Never
// throws - an unreachable database just means the landing page renders
// without the live strip.
export async function getPreviewParcels(countyId: string, count: number): Promise<ParcelSummary[]> {
  try {
    const parcels = await getDelinquentParcels(countyId)
    return [...parcels].sort((a, b) => b.taxesOwed - a.taxesOwed).slice(0, count)
  } catch {
    return []
  }
}
