// Sort orders for the Analyze tab's card list. Pure data + a comparator, like
// parcel-filters.ts, so the ordering rules live apart from the <select> that
// picks one.

import type { AnalyzeSummaryRow } from './analyze-row'

type SortField = 'taxesOwed' | 'marketValue' | 'acres' | 'latePayments' | 'ownerDistance' | 'roadFrontageFt'

// Labels stay short enough to fit beside the result count in the one-card-wide
// list column.
export const SORT_OPTIONS = [
  { key: 'taxesOwed-desc', label: 'Highest taxes owed' },
  { key: 'marketValue-desc', label: 'Highest market value' },
  { key: 'marketValue-asc', label: 'Lowest market value' },
  { key: 'acres-desc', label: 'Largest acreage' },
  { key: 'latePayments-desc', label: 'Most unpaid bills' },
  { key: 'ownerDistance-desc', label: 'Farthest owner' },
  { key: 'roadFrontageFt-desc', label: 'Most road frontage' },
] as const satisfies readonly { key: `${SortField}-${'asc' | 'desc'}`; label: string }[]

export type ParcelSortKey = (typeof SORT_OPTIONS)[number]['key']

// Biggest tax debt first: the parcels most likely to reach a tax sale.
export const DEFAULT_SORT: ParcelSortKey = 'taxesOwed-desc'

// Returns a new array. A null value (the producing job hasn't run for that
// parcel) always sorts last in either direction - "unknown" is not "smallest".
// Ties fall back to parcel id so the order - and so each page - is stable.
export function sortParcels(rows: AnalyzeSummaryRow[], key: ParcelSortKey): AnalyzeSummaryRow[] {
  const [field, direction] = key.split('-') as [SortField, 'asc' | 'desc']
  const sign = direction === 'asc' ? 1 : -1
  return rows.slice().sort((a, b) => {
    const av = a[field]
    const bv = b[field]
    if (av == null || bv == null) {
      if (av == null && bv == null) return a.id.localeCompare(b.id)
      return av == null ? 1 : -1
    }
    return av === bv ? a.id.localeCompare(b.id) : (av - bv) * sign
  })
}
