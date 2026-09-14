'use client'

import { useRef } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { ExternalLink, Heart, NotebookPen, X } from 'lucide-react'
import { useLibrary } from '@/components/product/library-context'
import { ListMenu } from '@/components/product/list-menu'
import { formatUsd, toDisplayCase } from '@/lib/format'
import { ParcelDetail } from './parcel-detail'
import { useParcelNotes } from './use-parcel-notes'
import type { AnalyzeRow, AnalyzeSummaryRow } from './analyze-row'

type ContentProps = {
  row: AnalyzeSummaryRow
  detail: AnalyzeRow | undefined
  loading: boolean
}

// Everything about one parcel - owners and their other holdings, valuation,
// sales, the payment-timing chart, notes, and a satellite view of the lot -
// opened by clicking its card (in the list or in a map pin's popup), the way a
// listing opens from a search results page. The header repeats the card's
// headline figures so the user never loses track of which parcel this is, and
// holds what they can do with it: save it, sort it into lists, write notes.
//
// `row` stays set while `open` goes false so the contents don't blank out
// mid-way through the closing transition.
export function ParcelDetailDialog({
  open,
  onClose,
  ...content
}: Omit<ContentProps, 'row'> & { row: AnalyzeSummaryRow | null; open: boolean; onClose: () => void }) {
  const popupRef = useRef<HTMLDivElement>(null)
  const { row } = content
  return (
    <Dialog.Root open={open && row !== null} onOpenChange={(next) => { if (!next) onClose() }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[60] bg-black/45 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        {/* Focus lands on the dialog itself rather than its first control, so
            opening a parcel doesn't ring the County record link. */}
        <Dialog.Popup ref={popupRef} initialFocus={popupRef} className="fixed top-1/2 left-1/2 z-[61] flex max-h-[calc(100dvh-2rem)] w-[min(64rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl outline-none transition-[opacity,scale] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
          {/* Keyed by parcel, so opening a different one loads its own note. */}
          {row && <ParcelDialogContent key={row.key} {...content} row={row} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ParcelDialogContent({ row, detail, loading }: ContentProps) {
  const notes = useParcelNotes(row.countyId, row.id)
  const { savedKeys, toggleSaved } = useLibrary()
  const saved = savedKeys.has(row.key)
  return (
    <>
      <header className="flex flex-wrap items-start gap-3 border-b border-border p-5">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-baseline gap-x-3">
            {row.marketValue > 0 ? (
              <span className="text-2xl font-bold tracking-tight">{formatUsd(row.marketValue)}</span>
            ) : (
              <span className="text-lg font-semibold text-muted-foreground">No market value</span>
            )}
            <span className="font-semibold text-destructive">{formatUsd(row.taxesOwed)} owed</span>
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
          <ListMenu parcelKey={row.key} />
          <button
            type="button"
            title={notes.statusLabel}
            aria-label={notes.statusLabel}
            aria-expanded={notes.notesOpen}
            onClick={notes.toggle}
            disabled={notes.notesOpen && !notes.canSave}
            className={`icon-button relative disabled:opacity-40 ${notes.notesOpen || notes.hasNote ? 'border-primary text-primary' : ''}`}
          >
            <NotebookPen size={18} />
            {(notes.isDirty || notes.saveState === 'error') && (
              <span aria-hidden className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ${notes.saveState === 'error' ? 'bg-destructive' : 'bg-primary'}`} />
            )}
          </button>
          <button
            type="button"
            aria-label={saved ? 'Unsave parcel' : 'Save parcel'}
            aria-pressed={saved}
            onClick={() => toggleSaved(row.key)}
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
        <ParcelDetail
          row={row}
          detail={detail}
          loading={loading}
          notesOpen={notes.notesOpen}
          notesLoaded={notes.loaded}
          notesText={notes.notesText}
          notesStatus={notes.statusLabel}
          onNotesChange={notes.onNotesChange}
        />
      </div>
    </>
  )
}
