'use client'

// Caches full parcel detail (owners/valuations/sales/polygon), fetched lazily
// the first time a parcel is picked - its map pin clicked or its card opened -
// never for the whole list (that's what the lightweight ParcelSummary list is
// for). Entries are never evicted once loaded, so reopening a parcel is instant.
// Keyed by parcelKey, so one cache serves parcels from several counties (the
// saved page).

import { useCallback, useRef, useState } from 'react'
import { getParcel } from '@/lib/api-client'
import { splitParcelKey } from '@/lib/parcel-key'
import { toAnalyzeRow, type AnalyzeRow } from './analyze-row'

export function useSelectedParcel() {
  const [details, setDetails] = useState<Record<string, AnalyzeRow>>({})
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set())
  // Refs rather than `details`/`loadingKeys` state, so `ensureLoaded` keeps one
  // identity: the map's ~1-2k memoized pins take handlers built on it, and a
  // new identity per fetched parcel would re-render every one of them.
  const loaded = useRef<Set<string>>(new Set())
  const inFlight = useRef<Set<string>>(new Set())

  const ensureLoaded = useCallback((key: string) => {
    if (loaded.current.has(key) || inFlight.current.has(key)) return
    inFlight.current.add(key)
    setLoadingKeys((current) => new Set(current).add(key))

    const { countyId, parcelId } = splitParcelKey(key)
    getParcel(countyId, parcelId)
      .then((parcel) => {
        loaded.current.add(key)
        setDetails((current) => ({ ...current, [key]: toAnalyzeRow(parcel) }))
      })
      .catch(() => {
        // Leave it unloaded - ensureLoaded will retry next time this parcel
        // is picked, since neither `loaded` nor `inFlight` still has it.
      })
      .finally(() => {
        inFlight.current.delete(key)
        setLoadingKeys((current) => {
          const next = new Set(current)
          next.delete(key)
          return next
        })
      })
  }, [])

  return { details, loadingKeys, ensureLoaded }
}
