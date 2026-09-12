'use client'

import { useState, type ReactNode } from 'react'
import Image from 'next/image'
import { ImageOff } from 'lucide-react'
import type { StreetViewInsight } from '@/lib/api'
import { SATELLITE_IMAGE_CREDIT, STREET_VIEW_IMAGE_CREDIT, satelliteImageUrl, streetViewImageUrl } from '@/lib/parcel-images'

// "2024-06" -> "Jun 2024", the way Google reports a pano's capture month.
function formatCaptured(month: string): string {
  const date = new Date(`${month}-01T00:00:00`)
  return Number.isNaN(date.getTime()) ? month : date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

function Frame({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <figure className="m-0">
      <div className="parcel-card-placeholder relative aspect-[4/3] overflow-hidden rounded-xl border border-border">{children}</div>
      <figcaption className="mt-1 truncate text-[11px] text-muted-foreground">{caption}</figcaption>
    </figure>
  )
}

function Missing({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-sm text-muted-foreground">
      <ImageOff aria-hidden size={22} strokeWidth={1.5} />
      {children}
    </div>
  )
}

// The parcel detail's two photos of the lot, side by side: the satellite
// overhead with the boundary drawn on (every parcel with a boundary has one, so
// it's the hero), and Google Street View from the road when there's a pano near
// the lot. Both are served and cached by the orchestrator.
//
// `streetView` is what the orchestrator already knows: undefined/null = not
// looked up yet (requesting the image looks it up), `available: false` =
// nothing nearby, so skip a request that can only 404.
export function ParcelHeroImages({
  countyId,
  parcelId,
  streetView,
}: {
  countyId: string
  parcelId: string
  streetView: StreetViewInsight | null | undefined
}) {
  const [satelliteFailed, setSatelliteFailed] = useState(false)
  const [streetViewFailed, setStreetViewFailed] = useState(false)
  const noStreetView = streetView?.available === false

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Frame caption={SATELLITE_IMAGE_CREDIT}>
        {satelliteFailed ? (
          <Missing>Couldn&apos;t load the overhead</Missing>
        ) : (
          <Image
            src={satelliteImageUrl(countyId, parcelId, 'hero')}
            alt="Satellite view of the parcel with its boundary outlined"
            fill
            unoptimized
            className="object-cover"
            onError={() => setSatelliteFailed(true)}
          />
        )}
      </Frame>
      <Frame caption={streetView?.capturedAt ? `${STREET_VIEW_IMAGE_CREDIT} · captured ${formatCaptured(streetView.capturedAt)}` : STREET_VIEW_IMAGE_CREDIT}>
        {noStreetView || streetViewFailed ? (
          <Missing>{noStreetView ? 'No Street View near this parcel' : 'Street View unavailable'}</Missing>
        ) : (
          <Image
            src={streetViewImageUrl(countyId, parcelId)}
            alt="Street View of the parcel from the road"
            fill
            unoptimized
            className="object-cover"
            onError={() => setStreetViewFailed(true)}
          />
        )}
      </Frame>
    </div>
  )
}
