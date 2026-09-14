'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError } from '@/lib/api-client'
import * as api from '@/lib/library-client'
import { parcelKey, splitParcelKey } from '@/lib/parcel-key'
import type { Library, ParcelList, ParcelNote } from '@/lib/types'

type LibraryContextValue = {
  // null until the first load lands (or when it failed - see loadFailed).
  library: Library | null
  loadFailed: boolean
  // Keyed by parcelKey(countyId, parcelId).
  savedKeys: Set<string>
  listIdsByKey: Map<string, string[]>
  notePreviews: Map<string, string>
  // These keep one identity for the provider's lifetime, so the memoized
  // cards and map pins that take them don't re-render on every save.
  toggleSaved: (key: string) => void
  setInList: (listId: string, key: string, inList: boolean) => void
  // These reject with the server's message (an ApiError) for the form that
  // called them to show.
  createList: (name: string) => Promise<ParcelList>
  renameList: (listId: string, name: string) => Promise<void>
  deleteList: (listId: string) => Promise<void>
  // Tells the library a note was written or cleared, for the saved page's previews.
  noteSaved: (key: string, note: ParcelNote | null) => void
}

const LibraryContext = createContext<LibraryContextValue | null>(null)

const NOTE_PREVIEW_LENGTH = 280
const TOAST_MS = 5000
const keyOf = (p: { countyId: string; parcelId: string }) => parcelKey(p.countyId, p.parcelId)

// The signed-in user's saved parcels, lists and notes, shared by every screen
// under /app. Saving and listing update the screen straight away and then tell
// the server; if the server says no, a toast says so and the library reloads,
// so the screen never keeps showing something that didn't stick.
export function LibraryProvider({ children }: { children: ReactNode }) {
  const [library, setLibraryState] = useState<Library | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  // The latest library, for mutations to read without taking it as a dependency.
  const libraryRef = useRef<Library | null>(null)

  const setLibrary = useCallback((next: Library) => {
    libraryRef.current = next
    setLibraryState(next)
  }, [])

  const reload = useCallback(async () => {
    try {
      setLibrary(await api.getLibrary())
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    }
  }, [setLibrary])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  const fail = useCallback((err: unknown, fallback: string) => {
    setToast(err instanceof ApiError && err.status < 500 ? err.message : fallback)
    void reload()
  }, [reload])

  const optimistic = useCallback((apply: (lib: Library) => Library, request: () => Promise<unknown>, failure: string) => {
    const current = libraryRef.current
    if (current) setLibrary(apply(current))
    request().then(
      () => { if (!current) void reload() },
      (err) => fail(err, failure),
    )
  }, [fail, reload, setLibrary])

  const toggleSaved = useCallback((key: string) => {
    const { countyId, parcelId } = splitParcelKey(key)
    const isSaved = libraryRef.current?.saved.some((s) => keyOf(s) === key) ?? false
    if (isSaved) {
      optimistic(
        (lib) => ({ ...lib, saved: lib.saved.filter((s) => keyOf(s) !== key) }),
        () => api.unsaveParcel(countyId, parcelId),
        'Couldn’t unsave that parcel. Try again.',
      )
    } else {
      optimistic(
        (lib) => ({ ...lib, saved: [{ countyId, parcelId, savedAt: new Date().toISOString(), listIds: [] }, ...lib.saved] }),
        () => api.saveParcel(countyId, parcelId),
        'Couldn’t save that parcel. Try again.',
      )
    }
  }, [optimistic])

  const setInList = useCallback((listId: string, key: string, inList: boolean) => {
    const { countyId, parcelId } = splitParcelKey(key)
    if (inList) {
      optimistic(
        (lib) => lib.saved.some((s) => keyOf(s) === key)
          ? { ...lib, saved: lib.saved.map((s) => keyOf(s) === key && !s.listIds.includes(listId) ? { ...s, listIds: [...s.listIds, listId] } : s) }
          : { ...lib, saved: [{ countyId, parcelId, savedAt: new Date().toISOString(), listIds: [listId] }, ...lib.saved] },
        () => api.addToList(listId, countyId, parcelId),
        'Couldn’t add that parcel to the list. Try again.',
      )
    } else {
      optimistic(
        (lib) => ({ ...lib, saved: lib.saved.map((s) => keyOf(s) === key ? { ...s, listIds: s.listIds.filter((id) => id !== listId) } : s) }),
        () => api.removeFromList(listId, countyId, parcelId),
        'Couldn’t take that parcel out of the list. Try again.',
      )
    }
  }, [optimistic])

  const createList = useCallback(async (name: string) => {
    const list = await api.createList(name)
    const current = libraryRef.current
    if (current) setLibrary({ ...current, lists: [...current.lists, list] })
    return list
  }, [setLibrary])

  const renameList = useCallback(async (listId: string, name: string) => {
    const renamed = await api.renameList(listId, name)
    const current = libraryRef.current
    if (current) setLibrary({ ...current, lists: current.lists.map((l) => (l.id === listId ? renamed : l)) })
  }, [setLibrary])

  const deleteList = useCallback(async (listId: string) => {
    await api.deleteList(listId)
    const current = libraryRef.current
    if (current) {
      setLibrary({
        ...current,
        lists: current.lists.filter((l) => l.id !== listId),
        saved: current.saved.map((s) => (s.listIds.includes(listId) ? { ...s, listIds: s.listIds.filter((id) => id !== listId) } : s)),
      })
    }
  }, [setLibrary])

  const noteSaved = useCallback((key: string, note: ParcelNote | null) => {
    const current = libraryRef.current
    if (!current) return
    const { countyId, parcelId } = splitParcelKey(key)
    const others = current.notes.filter((n) => keyOf(n) !== key)
    setLibrary({
      ...current,
      notes: note ? [{ countyId, parcelId, preview: note.body.slice(0, NOTE_PREVIEW_LENGTH), updatedAt: note.updatedAt }, ...others] : others,
    })
  }, [setLibrary])

  const savedKeys = useMemo(() => new Set((library?.saved ?? []).map(keyOf)), [library?.saved])
  const listIdsByKey = useMemo(() => new Map((library?.saved ?? []).map((s) => [keyOf(s), s.listIds])), [library?.saved])
  const notePreviews = useMemo(() => new Map((library?.notes ?? []).map((n) => [keyOf(n), n.preview])), [library?.notes])

  const value = useMemo<LibraryContextValue>(
    () => ({ library, loadFailed, savedKeys, listIdsByKey, notePreviews, toggleSaved, setInList, createList, renameList, deleteList, noteSaved }),
    [library, loadFailed, savedKeys, listIdsByKey, notePreviews, toggleSaved, setInList, createList, renameList, deleteList, noteSaved],
  )

  return (
    <LibraryContext.Provider value={value}>
      {children}
      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[80] w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-lg">
          {toast}
        </div>
      )}
    </LibraryContext.Provider>
  )
}

export function useLibrary() {
  const ctx = useContext(LibraryContext)
  if (!ctx) throw new Error('useLibrary must be used within a LibraryProvider')
  return ctx
}
