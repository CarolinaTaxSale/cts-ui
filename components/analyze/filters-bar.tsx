'use client'

import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { useClickOutside } from '@/components/product/use-click-outside'
import { formatUsdCompact } from '@/lib/format'
import {
  DEFAULT_FILTERS,
  POPOVER_FILTER_KEYS,
  activeFilterCount,
  rangeLabel,
  type ParcelFilters,
  type TriState,
} from './parcel-filters'

// Numeric bounds are stored as numbers with 0 meaning "unbounded" (see
// parcel-filters.ts). Rendering that 0 as an empty box with a "0" placeholder
// keeps a dozen inputs from shouting zeros at the operator while still showing
// what the default is.
function BoundInput({
  label,
  value,
  onChange,
  step,
}: {
  label: string
  value: number
  onChange: (next: number) => void
  step?: string
}) {
  return (
    <input
      type="number"
      min={0}
      step={step}
      aria-label={label}
      placeholder="0"
      value={value === 0 ? '' : value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus:border-primary"
    />
  )
}

function Row({ label, hint, className = '', children }: { label: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <div className={`px-1 py-2 ${className}`}>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
        {label}
        {hint && <span className="ml-1 font-normal opacity-70">{hint}</span>}
      </p>
      {children}
    </div>
  )
}

function MinMax({
  label,
  min,
  max,
  onMin,
  onMax,
  step,
  className,
}: {
  label: string
  min: number
  max: number
  onMin: (n: number) => void
  onMax: (n: number) => void
  step?: string
  className?: string
}) {
  return (
    <Row label={label} hint="(0 = no limit)" className={className}>
      <div className="flex items-center gap-2">
        <BoundInput label={`Minimum ${label}`} value={min} onChange={onMin} step={step} />
        <span className="text-xs text-muted-foreground">to</span>
        <BoundInput label={`Maximum ${label}`} value={max} onChange={onMax} step={step} />
      </div>
    </Row>
  )
}

// A listing-site filter chip: shows its own label until set, then what it's
// set to ("$10K-$50K"), and opens a small popover of controls underneath.
function FilterPill({
  label,
  summary,
  align = 'left',
  className = '',
  children,
}: {
  label: ReactNode
  // Non-null when the filter is narrowing the list - shown in place of the label.
  summary: ReactNode | null
  align?: 'left' | 'right'
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useClickOutside(open, [popoverRef, triggerRef], () => setOpen(false))

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const active = summary != null
  return (
    <div className={`relative shrink-0 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold whitespace-nowrap transition ${
          active || open ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-foreground hover:bg-muted'
        }`}
      >
        {summary ?? label}
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          ref={popoverRef}
          className={`panel absolute top-full z-30 mt-2 max-h-[70vh] w-80 max-w-[calc(100vw-2.5rem)] overflow-y-auto p-3 shadow-lg ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {children}
        </div>
      )}
    </div>
  )
}

const SELECT_CLASS = 'h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus:border-primary'

const acres = (n: number) => `${n} ac`

// The row above the map and cards: a search box, then one chip per headline
// filter, then a "Filters" chip holding the rest. Its own @container, so as it
// narrows the headline chips fold into the "Filters" popover (Market value and
// Taxes owed last, being the two a tax-sale buyer reaches for first) rather
// than wrapping onto a second line. Every row in that popover that has its own
// chip is hidden at exactly the widths the chip is shown. Memoized: it only
// needs to re-render when the filters themselves change.
export const FiltersBar = memo(function FiltersBar({ filters, setFilters }: { filters: ParcelFilters; setFilters: (f: ParcelFilters) => void }) {
  const patch = (next: Partial<ParcelFilters>) => setFilters({ ...filters, ...next })
  const moreCount = activeFilterCount(filters, POPOVER_FILTER_KEYS)

  const valueSummary = rangeLabel(filters.marketValueMin, filters.marketValueMax, formatUsdCompact)
  const taxesSummary = rangeLabel(filters.taxesOwedMin, filters.taxesOwedMax, formatUsdCompact)
  const acresSummary = rangeLabel(filters.acresMin, filters.acresMax, acres)

  const marketValue = (className?: string) => (
    <MinMax label="Market value ($)" className={className} min={filters.marketValueMin} max={filters.marketValueMax} onMin={(n) => patch({ marketValueMin: n })} onMax={(n) => patch({ marketValueMax: n })} />
  )
  const taxesOwed = (className?: string) => (
    <MinMax label="Taxes owed ($)" step="0.01" className={className} min={filters.taxesOwedMin} max={filters.taxesOwedMax} onMin={(n) => patch({ taxesOwedMin: n })} onMax={(n) => patch({ taxesOwedMax: n })} />
  )
  const acreage = (className?: string) => (
    <MinMax label="Acreage" step="0.01" className={className} min={filters.acresMin} max={filters.acresMax} onMin={(n) => patch({ acresMin: n })} onMax={(n) => patch({ acresMax: n })} />
  )

  return (
    <div className="@container">
      <div className="flex items-center gap-2">
        <label className="relative min-w-0 flex-1 @min-[44rem]:max-w-sm">
          <input
            aria-label="Search parcels"
            value={filters.query}
            onChange={(e) => patch({ query: e.target.value })}
            placeholder="Address, owner, or parcel ID"
            className="h-10 w-full rounded-lg border border-input bg-card pr-9 pl-3 text-sm outline-none focus:border-primary"
          />
          {filters.query ? (
            <button type="button" aria-label="Clear search" onClick={() => patch({ query: '' })} className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          ) : (
            <Search aria-hidden size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground" />
          )}
        </label>

        <FilterPill label="Market value" summary={valueSummary} className="hidden @min-[36rem]:block">{marketValue()}</FilterPill>
        <FilterPill label="Taxes owed" summary={taxesSummary && `${taxesSummary} owed`} className="hidden @min-[44rem]:block">{taxesOwed()}</FilterPill>
        <FilterPill label="Acreage" summary={acresSummary} className="hidden @min-[52rem]:block">{acreage()}</FilterPill>

        <FilterPill
          align="right"
          label={<><SlidersHorizontal size={15} /> Filters</>}
          summary={moreCount > 0 ? <><SlidersHorizontal size={15} /> Filters <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs">{moreCount}</span></> : null}
        >
          <div className="mb-1 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Filters</p>
              <p className="text-xs text-muted-foreground">Applies to the map and the list.</p>
            </div>
            <button
              type="button"
              onClick={() => setFilters({ ...DEFAULT_FILTERS, query: filters.query })}
              disabled={moreCount === 0}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground"
            >
              Reset
            </button>
          </div>

          {marketValue('@min-[36rem]:hidden')}
          {taxesOwed('@min-[44rem]:hidden')}
          {acreage('@min-[52rem]:hidden')}
          <MinMax label="Road frontage (ft)" min={filters.frontageMin} max={filters.frontageMax} onMin={(n) => patch({ frontageMin: n })} onMax={(n) => patch({ frontageMax: n })} />
          <MinMax label="Unpaid bills" min={filters.latePaymentsMin} max={filters.latePaymentsMax} onMin={(n) => patch({ latePaymentsMin: n })} onMax={(n) => patch({ latePaymentsMax: n })} />
          <Row label="Has site address">
            <select
              aria-label="Has site address"
              value={filters.hasAddress}
              onChange={(e) => patch({ hasAddress: e.target.value as TriState })}
              className={SELECT_CLASS}
            >
              <option value="any">Any</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Row>
        </FilterPill>
      </div>
    </div>
  )
})
