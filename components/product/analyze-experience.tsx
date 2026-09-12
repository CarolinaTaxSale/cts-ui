'use client'

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { List, Map as MapIcon } from 'lucide-react'
import { useProduct } from '@/components/product/product-context'
import { Skeleton } from '@/components/product/skeleton'
import { getDelinquentParcels } from '@/lib/api-client'
import { toAnalyzeSummaryRow, type AnalyzeSummaryRow } from '@/components/analyze/analyze-row'
import { useSelectedParcel } from '@/components/analyze/use-selected-parcel'
import { ParcelMap } from '@/components/analyze/parcel-map'
import { ParcelList } from '@/components/analyze/parcel-list'
import { ParcelCard } from '@/components/analyze/parcel-card'
import { ParcelDetailDialog } from '@/components/analyze/parcel-detail-dialog'
import { FiltersBar } from '@/components/analyze/filters-bar'
import { DEFAULT_FILTERS, matchesFilters, type ParcelFilters } from '@/components/analyze/parcel-filters'
import { DEFAULT_SORT, sortParcels, type ParcelSortKey } from '@/components/analyze/parcel-sort'

// A map pin's popup card. It reads the saved state from context rather than
// through props, so the `popup` render prop handed to the map keeps one
// identity when a heart is toggled - react-leaflet portals the popup, and
// context crosses portals.
function PopupCard({ row, onOpen }: { row: AnalyzeSummaryRow; onOpen: (id: string) => void }) {
  const { savedParcelIds, toggleSavedParcel } = useProduct()
  return <ParcelCard row={row} saved={savedParcelIds.has(row.id)} onToggleSave={toggleSavedParcel} onOpen={onOpen} />
}

// The consumer product experience - admin-ui's Analyze tab, with the
// breadcrumbs/page-title chrome dropped (this app has exactly one screen, so
// there's nothing for a title to disambiguate) and sized against a top bar
// only, no tab bar above it. Same search-results layout otherwise: filters
// across the top, the map on the left and parcel cards on the right, split by
// the layout's own width (an @container), not the viewport's.
export function AnalyzeExperience() {
  const { county, savedParcelIds, toggleSavedParcel } = useProduct()
  const [rows, setRows] = useState<AnalyzeSummaryRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [focusToken, setFocusToken] = useState(0)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [narrowView, setNarrowView] = useState<'list' | 'map'>('list')
  const [filters, setFilters] = useState<ParcelFilters>(DEFAULT_FILTERS)
  const [sort, setSort] = useState<ParcelSortKey>(DEFAULT_SORT)
  const { details, loadingIds, ensureLoaded } = useSelectedParcel(county.id)

  useEffect(() => {
    let cancelled = false
    setRows(null)
    setLoadError(null)
    setSelectedId(null)
    setFilters(DEFAULT_FILTERS)

    getDelinquentParcels(county.id)
      .then((parcels) => { if (!cancelled) setRows(parcels.map(toAnalyzeSummaryRow)) })
      .catch((err) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load parcels') })

    return () => { cancelled = true }
  }, [county.id])

  const showData = rows !== null || loadError !== null
  const parcels = useMemo(() => rows ?? [], [rows])
  const deferredFilters = useDeferredValue(filters)
  const deferredSort = useDeferredValue(sort)
  const visible = useMemo(() => parcels.filter((p) => matchesFilters(p, deferredFilters)), [parcels, deferredFilters])
  const sorted = useMemo(() => sortParcels(visible, deferredSort), [visible, deferredSort])

  useEffect(() => {
    if (selectedId && !visible.some((p) => p.id === selectedId)) setSelectedId(null)
  }, [visible, selectedId])

  const selectPin = useCallback((id: string) => {
    setSelectedId(id)
    ensureLoaded(id)
  }, [ensureLoaded])

  const openParcel = useCallback((id: string) => {
    setSelectedId(id)
    setFocusToken((t) => t + 1)
    ensureLoaded(id)
    setDetailId(id)
    setDetailOpen(true)
  }, [ensureLoaded])

  const popup = useCallback((row: AnalyzeSummaryRow) => <PopupCard row={row} onOpen={openParcel} />, [openParcel])
  const resetFilters = useCallback(() => setFilters({ ...DEFAULT_FILTERS }), [])

  const detailRow = detailId ? parcels.find((p) => p.id === detailId) ?? null : null

  return (
    // Viewport height less just the top bar and this container's own padding
    // (no tab bar, no breadcrumbs/title block above the filters here).
    <div className="flex h-[calc(100dvh-8rem)] min-h-[34rem] flex-col gap-4">
      {showData && <FiltersBar filters={filters} setFilters={setFilters} />}
      {loadError && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-semibold">Couldn&apos;t load parcels</p>
          <p className="mt-1 line-clamp-3 break-words opacity-90">{loadError}</p>
        </div>
      )}

      {showData ? (
        <div className="@container relative min-h-0 flex-1">
          <div className="flex h-full gap-4">
            <div className={`isolate min-w-0 flex-1 overflow-hidden rounded-xl border border-border ${narrowView === 'list' ? '@max-[40rem]:hidden' : ''}`}>
              <ParcelMap
                pins={visible}
                outline={selectedId ? details[selectedId] : null}
                selectedId={selectedId}
                hoveredId={hoveredId}
                focusToken={focusToken}
                onSelect={selectPin}
                popup={popup}
              />
            </div>
            <div className={`flex min-h-0 w-full shrink-0 flex-col @min-[40rem]:w-[21rem] @min-[68rem]:w-[41rem] ${narrowView === 'map' ? '@max-[40rem]:hidden' : ''}`}>
              <ParcelList
                parcels={sorted}
                totalCount={parcels.length}
                sort={sort}
                setSort={setSort}
                savedIds={savedParcelIds}
                onToggleSave={toggleSavedParcel}
                onOpen={openParcel}
                selectedId={selectedId}
                onHover={setHoveredId}
                onResetFilters={resetFilters}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setNarrowView((v) => (v === 'list' ? 'map' : 'list'))}
            className="primary-button absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full px-5 shadow-lg @min-[40rem]:hidden"
          >
            {narrowView === 'list' ? <><MapIcon size={16} /> Map</> : <><List size={16} /> List</>}
          </button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4">
          <Skeleton className="h-full flex-1 rounded-xl" />
          <Skeleton className="hidden h-full w-[21rem] rounded-xl sm:block" />
        </div>
      )}

      <ParcelDetailDialog
        row={detailRow}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        detail={detailId ? details[detailId] : undefined}
        loading={detailId ? loadingIds.has(detailId) : false}
        saved={detailId ? savedParcelIds.has(detailId) : false}
        onToggleSave={() => { if (detailId) toggleSavedParcel(detailId) }}
      />
    </div>
  )
}
