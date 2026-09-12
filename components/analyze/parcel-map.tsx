'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type { ParcelMapInner } from './parcel-map-inner'

// Leaflet touches `window` on import, so it can only run client-side.
export const ParcelMap = dynamic<ComponentProps<typeof ParcelMapInner>>(
  () => import('./parcel-map-inner').then((m) => m.ParcelMapInner),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading map…</div> },
)
