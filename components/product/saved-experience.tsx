'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Menu } from '@base-ui/react/menu'
import { Popover } from '@base-ui/react/popover'
import { Heart, List, Map as MapIcon, MoreHorizontal, NotebookPen, Plus } from 'lucide-react'
import { toAnalyzeSummaryRow, type AnalyzeSummaryRow } from '@/components/analyze/analyze-row'
import { ParcelDetailDialog } from '@/components/analyze/parcel-detail-dialog'
import { ParcelList } from '@/components/analyze/parcel-list'
import { ParcelMap } from '@/components/analyze/parcel-map'
import { DEFAULT_SORT, sortParcels, type ParcelSortKey } from '@/components/analyze/parcel-sort'
import { useSelectedParcel } from '@/components/analyze/use-selected-parcel'
import { PopupCard } from '@/components/product/analyze-experience'
import { useLibrary } from '@/components/product/library-context'
import { Skeleton } from '@/components/product/skeleton'
import { COUNTIES, countyPath } from '@/lib/counties'
import { getLibraryParcels, putNote } from '@/lib/library-client'
import { parcelKey, splitParcelKey } from '@/lib/parcel-key'
import type { ParcelList as ParcelListType } from '@/lib/types'

// What the page is showing: every saved parcel, the ones with notes, or one list.
type View = { kind: 'all' } | { kind: 'notes' } | { kind: 'list'; listId: string }

function viewFrom(params: URLSearchParams): View {
  const list = params.get('list')
  if (list) return { kind: 'list', listId: list }
  if (params.get('view') === 'notes') return { kind: 'notes' }
  return { kind: 'all' }
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition ${
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted'
      }`}
    >
      {children}
    </button>
  )
}

const Count = ({ n }: { n: number }) => <span className="font-normal tabular-nums opacity-75">{n}</span>

// A name field in a popover - for a new list, or renaming one.
function ListNameForm({
  initial = '',
  submitLabel,
  onSubmit,
}: {
  initial?: string
  submitLabel: string
  onSubmit: (name: string) => Promise<void>
}) {
  const [name, setName] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="p-2.5">
      <div className="flex gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="e.g. Redemptions"
          aria-label="List name"
          className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:border-primary"
        />
        <button type="submit" disabled={!name.trim() || busy} className="primary-button h-9 px-3 disabled:opacity-50">
          {submitLabel}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    </form>
  )
}

const popupClass =
  'panel w-72 origin-[var(--transform-origin)] overflow-hidden shadow-lg outline-none transition-[opacity,scale] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0'

function NewListButton({ onCreated }: { onCreated: (list: ParcelListType) => void }) {
  const { createList } = useLibrary()
  const [open, setOpen] = useState(false)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-border px-3.5 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground">
        <Plus aria-hidden size={15} /> New list
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="start" className="z-[70] outline-none">
          <Popover.Popup className={popupClass}>
            <Popover.Title className="border-b border-border px-3.5 py-2.5 text-sm font-semibold">New list</Popover.Title>
            {open && (
              <ListNameForm
                submitLabel="Create"
                onSubmit={async (name) => {
                  const list = await createList(name)
                  setOpen(false)
                  onCreated(list)
                }}
              />
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

// Rename or delete the list being shown.
function ListActions({ list, onDeleted }: { list: ParcelListType; onDeleted: () => void }) {
  const { renameList, deleteList } = useLibrary()
  const [renaming, setRenaming] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const anchorRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <Menu.Root>
        <Menu.Trigger ref={anchorRef} aria-label={`Options for ${list.name}`} className="icon-button h-9 w-9 rounded-full">
          <MoreHorizontal size={17} />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={8} align="start" className="z-[70] outline-none">
            <Menu.Popup className="panel w-48 origin-[var(--transform-origin)] overflow-hidden py-1 shadow-lg outline-none">
              <Menu.Item onClick={() => setRenaming(true)} className="flex w-full px-3.5 py-2.5 text-sm outline-none data-[highlighted]:bg-muted">
                Rename list
              </Menu.Item>
              <Menu.Item onClick={() => setConfirming(true)} className="flex w-full px-3.5 py-2.5 text-sm text-destructive outline-none data-[highlighted]:bg-muted">
                Delete list
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      <Popover.Root open={renaming} onOpenChange={setRenaming}>
        <Popover.Portal>
          <Popover.Positioner anchor={anchorRef} sideOffset={8} align="start" className="z-[70] outline-none">
            <Popover.Popup className={popupClass}>
              <Popover.Title className="border-b border-border px-3.5 py-2.5 text-sm font-semibold">Rename list</Popover.Title>
              {renaming && (
                <ListNameForm
                  initial={list.name}
                  submitLabel="Save"
                  onSubmit={async (name) => {
                    await renameList(list.id, name)
                    setRenaming(false)
                  }}
                />
              )}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>

      <AlertDialog.Root open={confirming} onOpenChange={(open) => { setConfirming(open); setDeleteError(null) }}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-[60] bg-black/45" />
          <AlertDialog.Popup className="panel fixed top-1/2 left-1/2 z-[61] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 p-5 shadow-2xl outline-none">
            <AlertDialog.Title className="text-base font-semibold">Delete “{list.name}”?</AlertDialog.Title>
            <AlertDialog.Description className="mt-1.5 text-sm text-muted-foreground">
              The parcels in it stay saved. Only the list goes away.
            </AlertDialog.Description>
            {deleteError && <p role="alert" className="mt-3 text-sm text-destructive">{deleteError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Close className="secondary-button">Cancel</AlertDialog.Close>
              <button
                type="button"
                className="primary-button bg-destructive text-white"
                onClick={async () => {
                  try {
                    await deleteList(list.id)
                    setConfirming(false)
                    onDeleted()
                  } catch (err) {
                    setDeleteError(err instanceof Error ? err.message : 'Couldn’t delete that list.')
                  }
                }}
              >
                Delete list
              </button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  )
}

function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="panel flex flex-col items-center gap-2 px-6 py-10 text-center">
      <div className="metric-icon mb-1">{icon}</div>
      <p className="font-semibold">{title}</p>
      <div className="max-w-sm text-sm text-muted-foreground">{children}</div>
    </div>
  )
}

// The saved page: the user's saved parcels as the same map and cards a county
// page shows, narrowed to one list or to the parcels they wrote notes on.
export function SavedExperience() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { library, loadFailed, savedKeys, notePreviews, toggleSaved, setInList, noteSaved } = useLibrary()
  const [summaries, setSummaries] = useState<Map<string, AnalyzeSummaryRow> | null>(null)
  const [summariesFailed, setSummariesFailed] = useState(false)
  // A fetch is out, so a parcel without a summary yet may simply not have arrived.
  const [summariesPending, setSummariesPending] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const [focusToken, setFocusToken] = useState(0)
  const [detailKey, setDetailKey] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [narrowView, setNarrowView] = useState<'list' | 'map'>('list')
  const [sort, setSort] = useState<ParcelSortKey>(DEFAULT_SORT)
  const { details, loadingKeys, ensureLoaded } = useSelectedParcel()

  const view = viewFrom(searchParams)
  const setView = useCallback((next: View) => {
    const query = next.kind === 'list' ? `?list=${encodeURIComponent(next.listId)}` : next.kind === 'notes' ? '?view=notes' : ''
    router.replace(`${pathname}${query}`, { scroll: false })
  }, [pathname, router])

  // Card data for everything in the library. Fetched again whenever the library
  // names a parcel that hasn't been fetched yet - one saved from a detail
  // dialog on this page, say - but never for a parcel it already asked about,
  // so a parcel that has left the data doesn't refetch forever.
  const requested = useRef(new Set<string>())
  const libraryKeys = useMemo(
    () => (library ? [...new Set([...library.saved, ...library.notes].map((p) => parcelKey(p.countyId, p.parcelId)))] : null),
    [library],
  )
  useEffect(() => {
    if (!libraryKeys) return
    const requestedKeys = requested.current
    const missing = libraryKeys.filter((k) => !requestedKeys.has(k))
    if (missing.length === 0) return
    for (const k of missing) requestedKeys.add(k)
    let cancelled = false
    let settled = false
    setSummariesPending(true)
    getLibraryParcels()
      .then((parcels) => {
        settled = true
        if (cancelled) return
        setSummariesPending(false)
        setSummariesFailed(false)
        setSummaries((current) => {
          const next = new Map(current)
          for (const p of parcels) next.set(parcelKey(p.countyId, p.parcelId), toAnalyzeSummaryRow(p))
          return next
        })
      })
      .catch(() => {
        settled = true
        if (cancelled) return
        setSummariesPending(false)
        for (const k of missing) requestedKeys.delete(k)
        setSummariesFailed(true)
      })
    return () => {
      cancelled = true
      // A fetch dropped before it answered never delivered these, so the next
      // run (the library changed again, or a Strict Mode remount) asks again.
      if (!settled) for (const k of missing) requestedKeys.delete(k)
    }
  }, [libraryKeys])

  const activeList = view.kind === 'list' ? library?.lists.find((l) => l.id === view.listId) ?? null : null

  // The keys the current view holds, in library order.
  const viewKind = view.kind
  const viewListId = view.kind === 'list' ? view.listId : null
  const viewKeys = useMemo(() => {
    if (!library) return []
    const keyOf = (p: { countyId: string; parcelId: string }) => parcelKey(p.countyId, p.parcelId)
    if (viewKind === 'notes') return library.notes.map(keyOf)
    if (viewListId) return library.saved.filter((s) => s.listIds.includes(viewListId)).map(keyOf)
    return library.saved.map(keyOf)
  }, [library, viewKind, viewListId])

  const rows = useMemo(
    () => (summaries ? viewKeys.map((k) => summaries.get(k)).filter((r): r is AnalyzeSummaryRow => r !== undefined) : []),
    [summaries, viewKeys],
  )
  const sorted = useMemo(() => sortParcels(rows, sort), [rows, sort])
  const missingKeys = useMemo(
    () => (summaries && !summariesPending ? viewKeys.filter((k) => !summaries.has(k)) : []),
    [summaries, summariesPending, viewKeys],
  )

  // Clears out what can't be shown any more, in the way the view holds it.
  const removeMissing = useCallback(() => {
    for (const key of missingKeys) {
      if (viewKind === 'notes') {
        const { countyId, parcelId } = splitParcelKey(key)
        void putNote(countyId, parcelId, '').then(() => noteSaved(key, null), () => {})
      } else if (viewListId) {
        setInList(viewListId, key, false)
      } else {
        toggleSaved(key)
      }
    }
  }, [missingKeys, viewKind, viewListId, noteSaved, setInList, toggleSaved])

  // Keep the last-opened parcel's row around after it's unsaved, so its dialog
  // doesn't vanish mid-edit.
  const detailRow = detailKey ? summaries?.get(detailKey) ?? null : null

  const selectPin = useCallback((key: string) => {
    setSelectedKey(key)
    ensureLoaded(key)
  }, [ensureLoaded])

  const openParcel = useCallback((key: string) => {
    setSelectedKey(key)
    setFocusToken((t) => t + 1)
    ensureLoaded(key)
    setDetailKey(key)
    setDetailOpen(true)
  }, [ensureLoaded])

  const popup = useCallback((row: AnalyzeSummaryRow) => <PopupCard row={row} onOpen={openParcel} showCounty />, [openParcel])

  // A list deleted elsewhere (or a stale link) falls back to everything saved.
  useEffect(() => {
    if (library && view.kind === 'list' && !activeList) setView({ kind: 'all' })
  }, [library, view.kind, activeList, setView])

  if (loadFailed && !library) {
    return (
      <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        <p className="font-semibold">Couldn&apos;t load your saved parcels</p>
        <p className="mt-1 opacity-90">Refresh the page to try again.</p>
      </div>
    )
  }

  const browseLink = (
    <Link href={countyPath(COUNTIES[0])} className="secondary-button mt-3">Browse {COUNTIES[0].name}</Link>
  )
  const emptyState =
    view.kind === 'notes' ? (
      <EmptyState icon={<NotebookPen size={18} />} title="No notes yet">
        Open any parcel and use the notepad button to jot down what you find. Only you can see your notes.
      </EmptyState>
    ) : view.kind === 'list' ? (
      <EmptyState icon={<List size={18} />} title={`Nothing in ${activeList?.name ?? 'this list'} yet`}>
        Open a saved parcel and use <b>Add to list</b> to put it here.
      </EmptyState>
    ) : (
      <EmptyState icon={<Heart size={18} />} title="No saved parcels yet">
        <p>Tap the heart on any parcel to save it here, then sort saved parcels into lists like Redemptions or Acquisitions.</p>
        {browseLink}
      </EmptyState>
    )

  const loading = !library || (!summaries && !summariesFailed)

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[34rem] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-lg font-semibold tracking-tight">Saved parcels</h1>
        {library ? (
          <>
            <Chip active={view.kind === 'all'} onClick={() => setView({ kind: 'all' })}>
              <Heart aria-hidden size={14} /> All saved <Count n={library.saved.length} />
            </Chip>
            <Chip active={view.kind === 'notes'} onClick={() => setView({ kind: 'notes' })}>
              <NotebookPen aria-hidden size={14} /> With notes <Count n={library.notes.length} />
            </Chip>
            {library.lists.map((list) => (
              <Chip key={list.id} active={activeList?.id === list.id} onClick={() => setView({ kind: 'list', listId: list.id })}>
                {list.name} <Count n={library.saved.filter((s) => s.listIds.includes(list.id)).length} />
              </Chip>
            ))}
            {activeList && <ListActions key={activeList.id} list={activeList} onDeleted={() => setView({ kind: 'all' })} />}
            <NewListButton onCreated={(list) => setView({ kind: 'list', listId: list.id })} />
          </>
        ) : (
          <Skeleton className="h-9 w-72 rounded-full" />
        )}
      </div>

      {summariesFailed && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Couldn&apos;t load the parcel details. Refresh the page to try again.
        </div>
      )}
      {missingKeys.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          <p>
            {missingKeys.length === 1 ? '1 parcel here is' : `${missingKeys.length} parcels here are`} no longer in the county data, so{' '}
            {missingKeys.length === 1 ? 'it' : 'they'} can&apos;t be shown.
          </p>
          <button type="button" onClick={removeMissing} className="font-semibold text-foreground underline-offset-2 hover:underline">
            {missingKeys.length === 1
              ? view.kind === 'notes' ? 'Delete its note' : view.kind === 'list' ? 'Take it out of this list' : 'Unsave it'
              : view.kind === 'notes' ? 'Delete their notes' : view.kind === 'list' ? 'Take them out of this list' : 'Unsave them'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-0 flex-1 gap-4">
          <Skeleton className="h-full flex-1 rounded-xl" />
          <Skeleton className="hidden h-full w-[21rem] rounded-xl sm:block" />
        </div>
      ) : (
        <div className="@container relative min-h-0 flex-1">
          <div className="flex h-full gap-4">
            <div className={`isolate min-w-0 flex-1 overflow-hidden rounded-xl border border-border ${narrowView === 'list' ? '@max-[40rem]:hidden' : ''}`}>
              {/* Remounted per view, so the map fits the parcels being shown. */}
              <ParcelMap
                key={view.kind === 'list' ? view.listId : view.kind}
                pins={rows}
                layersKey="cts.mapLayers.saved"
                outline={selectedKey ? details[selectedKey] : null}
                selectedKey={selectedKey}
                hoveredKey={hoveredKey}
                focusToken={focusToken}
                onSelect={selectPin}
                popup={popup}
              />
            </div>
            <div className={`flex min-h-0 w-full shrink-0 flex-col @min-[40rem]:w-[21rem] @min-[68rem]:w-[41rem] ${narrowView === 'map' ? '@max-[40rem]:hidden' : ''}`}>
              <ParcelList
                label="Saved parcels"
                parcels={sorted}
                totalCount={rows.length}
                sort={sort}
                setSort={setSort}
                savedKeys={savedKeys}
                notePreviews={notePreviews}
                onToggleSave={toggleSaved}
                onOpen={openParcel}
                selectedKey={selectedKey}
                onHover={setHoveredKey}
                emptyState={emptyState}
                showCounty
              />
            </div>
          </div>
          {rows.length > 0 && (
            <button
              type="button"
              onClick={() => setNarrowView((v) => (v === 'list' ? 'map' : 'list'))}
              className="primary-button absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full px-5 shadow-lg @min-[40rem]:hidden"
            >
              {narrowView === 'list' ? <><MapIcon size={16} /> Map</> : <><List size={16} /> List</>}
            </button>
          )}
        </div>
      )}

      <ParcelDetailDialog
        row={detailRow}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        detail={detailKey ? details[detailKey] : undefined}
        loading={detailKey ? loadingKeys.has(detailKey) : false}
      />
    </div>
  )
}
