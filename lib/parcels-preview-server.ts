import { getDelinquentParcels } from './parcels-db'
import type { ParcelSummary } from './api'

// Server-only, for the landing page's live preview strip: the few delinquent
// parcels owing the most, read directly from the consumer database. Never
// throws - an unreachable database just means the landing page renders
// without the live strip.
export async function getPreviewParcels(countyId: string, count: number): Promise<ParcelSummary[]> {
  try {
    return await getDelinquentParcels(countyId, { limit: count })
  } catch {
    return []
  }
}
