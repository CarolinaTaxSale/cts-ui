'use client'

import { memo, useRef, useState, type ReactNode } from 'react'
import { ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { ParcelCard } from './parcel-card'
import { SORT_OPTIONS, type ParcelSortKey } from './parcel-sort'
import type { AnalyzeSummaryRow } from './analyze-row'

// Enough to fill a tall screen twice over in the two-column layout while
// keeping a county's ~1-2k cards (each with its own chart) out of the DOM.
const PAGE_SIZE = 40

// Page numbers to show around the current one: always the first and last, the
// current page and its neighbours, and an ellipsis for each gap.
function pageWindow(page: number, pageCount: number): (number | 'gap')[] {
  const shown = new Set([0, pageCount - 1, page - 1, page, page + 1].filter((p) => p >= 0 && p < pageCount))
  const sorted = [...shown].sort((a, b) => a - b)
  const out: (number | 'gap')[] = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('gap')
    out.push(p)
  })
  return out
}

// One card plus the hover tracking that lights up its pin on the map. Memoized
// so hovering or selecting one parcel re-renders two cards, not the page.
//
// content-visibility: auto lets the browser skip layout and paint for the
// cards scrolled out of view - a page of 40 took ~35-40 ms to lay out after
// every filter change, and only a handful are ever on screen. The intrinsic
// size stands in for a skipped card's height (`auto` then remembers each
// card's real one), so the scrollbar stays put.
const ParcelListItem = memo(function ParcelListItem({
  row,
  saved,
  highlighted,
  onToggleSave,
  onOpen,
  onHover,
  note,
  showCounty,
}: {
  row: AnalyzeSummaryRow
  saved: boolean
  highlighted: boolean
  onToggleSave: (key: string) => void
  onOpen: (key: string) => void
  onHover: (key: string | null) => void
  note: string | undefined
  showCounty: boolean
}) {
  return (
    <div
      onMouseEnter={() => onHover(row.key)}
      onMouseLeave={() => onHover(null)}
      className="[contain-intrinsic-size:auto_23rem] [content-visibility:auto]"
    >
      <ParcelCard row={row} saved={saved} onToggleSave={onToggleSave} onOpen={onOpen} highlighted={highlighted} note={note} showCounty={showCounty} />
    </div>
  )
})

// The card column beside the map: a results header with the sort order, then
// one page of parcel cards - one card wide, or two once the page is wide enough
// (the @container is the Analyze layout's, see analyze-tab.tsx). Memoized, so
// the page re-rendering for a card hover (which only the map cares about)
// skips the list entirely.
export const ParcelList = memo(function ParcelList({
  parcels,
  totalCount,
  sort,
  setSort,
  savedKeys,
  notePreviews,
  onToggleSave,
  onOpen,
  selectedKey,
  onHover,
  onResetFilters,
  label = 'Delinquent parcels',
  emptyState,
  showCounty = false,
}: {
  // Already filtered and sorted; `totalCount` is the county's full delinquent
  // count, so the header can say how much the filters removed.
  parcels: AnalyzeSummaryRow[]
  totalCount: number
  sort: ParcelSortKey
  setSort: (sort: ParcelSortKey) => void
  // Keyed by parcelKey, like every id below.
  savedKeys: Set<string>
  notePreviews: Map<string, string>
  onToggleSave: (key: string) => void
  onOpen: (key: string) => void
  selectedKey: string | null
  onHover: (key: string | null) => void
  onResetFilters?: () => void
  label?: string
  // Shown in place of the cards when there are none; defaults to the filters' "no matches".
  emptyState?: ReactNode
  showCounty?: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  // A new filter or sort order starts back on page one - adjusting state while
  // rendering (rather than in an effect) so the stale page never paints.
  const [pagedList, setPagedList] = useState(parcels)
  if (pagedList !== parcels) {
    setPagedList(parcels)
    setPage(0)
  }

  const pageCount = Math.max(1, Math.ceil(parcels.length / PAGE_SIZE))
  const pageRows = parcels.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const goTo = (next: number) => {
    setPage(next)
    scrollRef.current?.scrollTo({ top: 0 })
  }

  return (
    <section aria-label={label} className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 pb-3">
        <h2 className="min-w-0 truncate text-sm font-semibold">
          {parcels.length === totalCount
            ? `${totalCount.toLocaleString()} parcels`
            : `${parcels.length.toLocaleString()} of ${totalCount.toLocaleString()} parcels`}
        </h2>
        <label className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
          <ArrowUpDown size={15} />
          <span className="sr-only">Sort parcels by</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as ParcelSortKey)}
            className="h-9 rounded-lg border border-border bg-card px-2 text-sm font-semibold text-foreground outline-none focus:border-primary"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Bottom padding below the toggle breakpoint keeps the floating Map
          button from covering the last card or the pager. */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pb-16 [scrollbar-gutter:stable] @min-[40rem]:pr-1 @min-[40rem]:pb-1">
        {parcels.length === 0 ? (
          emptyState ?? (
            <div className="panel flex flex-col items-center gap-3 p-8 text-center">
              <p className="text-sm text-muted-foreground">No parcels match these filters.</p>
              {onResetFilters && <button type="button" onClick={onResetFilters} className="secondary-button">Reset filters</button>}
            </div>
          )
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 @min-[68rem]:grid-cols-2">
              {pageRows.map((row) => (
                <ParcelListItem
                  key={row.key}
                  row={row}
                  saved={savedKeys.has(row.key)}
                  highlighted={row.key === selectedKey}
                  onToggleSave={onToggleSave}
                  onOpen={onOpen}
                  onHover={onHover}
                  note={notePreviews.get(row.key)}
                  showCounty={showCounty}
                />
              ))}
            </div>
            {pageCount > 1 && (
              <nav aria-label="Parcel pages" className="flex items-center justify-center gap-1 py-5">
                <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => goTo(page - 1)} className="icon-button disabled:pointer-events-none disabled:opacity-40">
                  <ChevronLeft size={16} />
                </button>
                {pageWindow(page, pageCount).map((p, i) =>
                  p === 'gap' ? (
                    <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground">…</span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      aria-current={p === page ? 'page' : undefined}
                      onClick={() => goTo(p)}
                      className={`h-9 min-w-9 rounded-lg px-2 text-sm font-semibold transition ${p === page ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'}`}
                    >
                      {p + 1}
                    </button>
                  ),
                )}
                <button type="button" aria-label="Next page" disabled={page === pageCount - 1} onClick={() => goTo(page + 1)} className="icon-button disabled:pointer-events-none disabled:opacity-40">
                  <ChevronRight size={16} />
                </button>
              </nav>
            )}
          </>
        )}
      </div>
    </section>
  )
})
