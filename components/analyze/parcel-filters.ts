// Client-side filtering for the whole Analyze tab - the map's pins and the
// card list come from the same narrowed list, so a filter means the same thing
// everywhere on the page. The tab already loads every delinquent parcel for the
// county in one request (see analyze-tab.tsx), so narrowing happens in the
// browser against rows already in memory - no refetch, and no server round trip
// per keystroke.
//
// Kept as pure data + predicates, separate from the filter bar that edits them,
// so the matching rules can be reasoned about (and reused) without the UI.

import type { AnalyzeSummaryRow } from './analyze-row'

export type TriState = 'any' | 'yes' | 'no'

// Zoning is deliberately absent: county zoning descriptions are free text with
// real classification complexity behind them (see TODO.md), and a half-right
// residential/commercial/agricultural picker would quietly mislead rather than
// narrow. It goes in once the taxonomy is settled.
export type ParcelFilters = {
  // Free-text search over parcel id, owner, owner mailing address, parcel
  // address and zoning type.
  query: string
  hasAddress: TriState
  acresMin: number
  acresMax: number
  frontageMin: number
  frontageMax: number
  taxesOwedMin: number
  taxesOwedMax: number
  marketValueMin: number
  marketValueMax: number
  latePaymentsMin: number
  latePaymentsMax: number
}

// Every numeric bound defaults to 0, which means "unbounded" rather than a
// literal limit: a max of 0 would otherwise exclude every parcel, and since all
// of these quantities are non-negative a min of 0 already admits everything.
export const DEFAULT_FILTERS: ParcelFilters = {
  query: '',
  hasAddress: 'any',
  acresMin: 0,
  acresMax: 0,
  frontageMin: 0,
  frontageMax: 0,
  taxesOwedMin: 0,
  taxesOwedMax: 0,
  marketValueMin: 0,
  marketValueMax: 0,
  latePaymentsMin: 0,
  latePaymentsMax: 0,
}

// A bound of 0 is "not set". A row whose value is null (the producing job hasn't
// run for that parcel) fails any bound that *is* set - we can't claim an unknown
// frontage is over 50ft - but passes when neither end is bounded.
function inRange(value: number | null, min: number, max: number): boolean {
  if (min <= 0 && max <= 0) return true
  if (value == null) return false
  if (min > 0 && value < min) return false
  if (max > 0 && value > max) return false
  return true
}

function matchesQuery(row: AnalyzeSummaryRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return `${row.id} ${row.owner} ${row.ownerAddress} ${row.address} ${row.type}`.toLowerCase().includes(q)
}

export function matchesFilters(row: AnalyzeSummaryRow, f: ParcelFilters): boolean {
  if (!matchesQuery(row, f.query)) return false
  if (f.hasAddress !== 'any') {
    const has = row.address.trim().length > 0
    if (has !== (f.hasAddress === 'yes')) return false
  }
  if (!inRange(row.acres, f.acresMin, f.acresMax)) return false
  if (!inRange(row.roadFrontageFt, f.frontageMin, f.frontageMax)) return false
  if (!inRange(row.taxesOwed, f.taxesOwedMin, f.taxesOwedMax)) return false
  if (!inRange(row.marketValue, f.marketValueMin, f.marketValueMax)) return false
  if (!inRange(row.latePayments, f.latePaymentsMin, f.latePaymentsMax)) return false
  return true
}

/** How many of `keys` differ from their defaults - drives the filter bar's badges. */
export function activeFilterCount(f: ParcelFilters, keys: (keyof ParcelFilters)[]): number {
  return keys.filter((k) => f[k] !== DEFAULT_FILTERS[k]).length
}

/** Every filter behind a popover (everything but the search box, which shows its own state). */
export const POPOVER_FILTER_KEYS = (Object.keys(DEFAULT_FILTERS) as (keyof ParcelFilters)[]).filter((k) => k !== 'query')

/** A min/max pair as a pill label - "$10K+", "Up to 5 ac", "1-3" - or null when unbounded. */
export function rangeLabel(min: number, max: number, format: (n: number) => string): string | null {
  if (min > 0 && max > 0) return `${format(min)}-${format(max)}`
  if (min > 0) return `${format(min)}+`
  if (max > 0) return `Up to ${format(max)}`
  return null
}
