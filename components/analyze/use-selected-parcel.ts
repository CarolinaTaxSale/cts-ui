'use client'

// Caches full parcel detail (owners/valuations/sales/polygon), fetched lazily
// the first time a parcel is picked - its map pin clicked or its card opened -
// never for the whole list (that's what the lightweight ParcelSummary list is
// for). Entries are never evicted once loaded, so reopening a parcel is instant.

import { useCallback, useRef, useState } from 'react'
import { getParcel } from '@/lib/api'
import { toAnalyzeRow, type AnalyzeRow } from './analyze-row'

export function useSelectedParcel(countyId: string) {
  const [details, setDetails] = useState<Record<string, AnalyzeRow>>({})
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
  // Refs rather than `details`/`loadingIds` state, so `ensureLoaded` keeps one
  // identity for the life of the county: the map's ~1-2k memoized pins take
  // handlers built on it, and a new identity per fetched parcel would
  // re-render every one of them.
  const loaded = useRef<Set<string>>(new Set())
  const inFlight = useRef<Set<string>>(new Set())

  const ensureLoaded = useCallback((parcelId: string) => {
    if (loaded.current.has(parcelId) || inFlight.current.has(parcelId)) return
    inFlight.current.add(parcelId)
    setLoadingIds((current) => new Set(current).add(parcelId))

    getParcel(countyId, parcelId)
      .then((parcel) => {
        loaded.current.add(parcelId)
        setDetails((current) => ({ ...current, [parcelId]: toAnalyzeRow(parcel) }))
      })
      .catch(() => {
        // Leave it unloaded - ensureLoaded will retry next time this parcel
        // is picked, since neither `loaded` nor `inFlight` still has it.
      })
      .finally(() => {
        inFlight.current.delete(parcelId)
        setLoadingIds((current) => {
          const next = new Set(current)
          next.delete(parcelId)
          return next
        })
      })
  }, [countyId])

  return { details, loadingIds, ensureLoaded }
}
