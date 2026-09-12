'use client'

import { useRef } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { ExternalLink, Heart, X } from 'lucide-react'
import { formatUsd, toDisplayCase } from '@/lib/format'
import { ParcelDetail } from './parcel-detail'
import type { AnalyzeRow, AnalyzeSummaryRow } from './analyze-row'

// Everything about one parcel - owners and their other holdings, valuation,
// sales, the payment-timing chart, notes, and a satellite view of the lot -
// opened by clicking its card (in the list or in a map pin's popup), the way a
// listing opens from a search results page. The header repeats the card's
// headline figures so the operator never loses track of which parcel this is.
//
// `row` stays set while `open` goes false so the contents don't blank out
// mid-way through the closing transition.
export function ParcelDetailDialog({
  row,
  open,
  onClose,
  detail,
  loading,
  saved,
  onToggleSave,
}: {
  row: AnalyzeSummaryRow | null
  open: boolean
  onClose: () => void
  detail: AnalyzeRow | undefined
  loading: boolean
  saved: boolean
  onToggleSave: () => void
}) {
  const popupRef = useRef<HTMLDivElement>(null)
  return (
    <Dialog.Root open={open && row !== null} onOpenChange={(next) => { if (!next) onClose() }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[60] bg-black/45 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        {/* Focus lands on the dialog itself rather than its first control, so
            opening a parcel doesn't ring the County record link. */}
        <Dialog.Popup ref={popupRef} initialFocus={popupRef} className="fixed top-1/2 left-1/2 z-[61] flex max-h-[calc(100dvh-2rem)] w-[min(64rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl outline-none transition-[opacity,scale] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
          {row && (
            <>
              <header className="flex items-start gap-3 border-b border-border p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    {row.marketValue > 0 ? (
                      <span className="text-2xl font-bold tracking-tight">{formatUsd(row.marketValue, { cents: true })}</span>
                    ) : (
                      <span className="text-lg font-semibold text-muted-foreground">No market value</span>
                    )}
                    <span className="font-semibold text-destructive">{formatUsd(row.taxesOwed, { cents: true })} owed</span>
                  </div>
                  <Dialog.Title className="mt-1 truncate text-base font-semibold">
                    {row.address ? toDisplayCase(row.address) : 'No site address'}
                  </Dialog.Title>
                  <Dialog.Description className="truncate text-sm text-muted-foreground">
                    Parcel <span className="font-mono">{row.id}</span> · {row.owner}
                  </Dialog.Description>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {row.countyParcelUrl && (
                    <a href={row.countyParcelUrl} target="_blank" rel="noreferrer" className="secondary-button h-9 px-3">
                      <ExternalLink size={15} />
                      <span className="hidden sm:inline">County record</span>
                    </a>
                  )}
                  <button
                    type="button"
                    aria-label={saved ? 'Unsave parcel' : 'Save parcel'}
                    aria-pressed={saved}
                    onClick={onToggleSave}
                    className="icon-button"
                  >
                    <Heart size={18} className={saved ? 'fill-destructive text-destructive' : ''} />
                  </button>
                  <Dialog.Close aria-label="Close" className="icon-button">
                    <X size={18} />
                  </Dialog.Close>
                </div>
              </header>
              <div className="min-h-0 overflow-y-auto">
                <ParcelDetail key={row.id} row={row} detail={detail} loading={loading} />
              </div>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
