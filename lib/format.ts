// Shared display formatting for parcel measurements, so the Analyze list's
// columns read the same as the detail panel below them.

// Owner distance is usually well under a mile for a resident owner but can be
// cross-state for an absentee one - keep 2 decimals close in, whole miles once
// it's clearly far.
export function formatMiles(mi: number): string {
  return mi < 10 ? `${mi.toFixed(2)} mi` : `${Math.round(mi)} mi`
}

// Road frontage is only ever meaningful to the foot.
export function formatFeet(ft: number): string {
  return `${Math.round(ft).toLocaleString()} ft`
}

// Whole dollars for the headline figures (market value); cents only where the
// county bills them (taxes owed).
export function formatUsd(amount: number, { cents = false } = {}): string {
  return amount.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  })
}

// Map-pin price labels: "$850", "$35K", "$1.2M" - short enough that a few
// hundred of them can share a county map.
export function formatUsdCompact(amount: number): string {
  if (amount >= 999_500) return `$${(amount / 1_000_000).toFixed(amount >= 9_950_000 ? 0 : 1)}M`
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`
  return `$${Math.round(amount)}`
}

// Two-letter tokens that must stay capitalised when an all-caps county string
// is re-cased: US state codes, compass directions, and PO (as in PO Box).
const KEEP_UPPER = new Set(
  'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY N S E W NE NW SE SW PO'.split(' '),
)

// Counties and the Census geocoder both hand back SHOUTING ALL-CAPS strings.
// Title-case those for display, leaving state codes, directions and
// parenthesised zoning codes like "(RV)" as they are. Mixed-case input is
// assumed to be deliberate and passes through untouched.
export function toDisplayCase(value: string): string {
  if (value !== value.toUpperCase()) return value
  return value.replace(/\([^)]*\)|[A-Z][A-Z']*/g, (word) =>
    word.startsWith('(') || KEEP_UPPER.has(word) ? word : word[0] + word.slice(1).toLowerCase(),
  )
}
