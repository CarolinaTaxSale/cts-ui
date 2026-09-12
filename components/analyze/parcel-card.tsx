'use client'

import { Fragment, memo, type ReactNode } from 'react'
import Image from 'next/image'
import { Heart, LandPlot } from 'lucide-react'
import { formatFeet, formatMiles, formatUsd, toDisplayCase } from '@/lib/format'
import { satelliteImageUrl } from '@/lib/parcel-images'
import { PaymentTimingChart } from './payment-timing-chart'
import type { AnalyzeSummaryRow } from './analyze-row'

// Chips over the image, like a listing's "Price cut" tag: only the facts worth
// stopping the scroll for, at most two so they never cover the picture.
function badgesFor(row: AnalyzeSummaryRow): string[] {
  const badges: string[] = []
  if (row.isLandlocked) badges.push('Landlocked')
  if (row.latePayments >= 2) badges.push(`${row.latePayments} unpaid bills`)
  return badges.slice(0, 2)
}

// "0.89 ac | 317 ft frontage | Residential Vacant (RV)" - the parcel's
// equivalent of a listing's beds | baths | sqft line.
function factsFor(row: AnalyzeSummaryRow): ReactNode[] {
  const facts: ReactNode[] = []
  if (row.acres != null) facts.push(<><b className="font-semibold">{row.acres.toFixed(2)}</b> ac</>)
  if (row.roadFrontageFt != null) facts.push(<><b className="font-semibold">{formatFeet(row.roadFrontageFt)}</b> frontage</>)
  if (row.type !== '-') facts.push(toDisplayCase(row.type))
  return facts
}

// One parcel as a listing card. The same component renders in the list beside
// the map and inside a map pin's popup, so the two always read identically.
// Clicking anywhere on it opens the parcel's full detail; the heart toggles the
// saved state without opening anything.
//
// Memoized, with the callbacks taking the parcel id rather than being bound
// per card, so selecting, hovering or saving one parcel re-renders only the
// cards whose props actually changed - not a page of cards and their charts.
export const ParcelCard = memo(function ParcelCard({
  row,
  saved,
  onToggleSave,
  onOpen,
  highlighted = false,
}: {
  row: AnalyzeSummaryRow
  saved: boolean
  onToggleSave: (id: string) => void
  onOpen: (id: string) => void
  // Ring the card - it's the parcel whose pin is selected on the map.
  highlighted?: boolean
}) {
  const badges = badgesFor(row)
  const facts = factsFor(row)
  const distance = row.ownerAtParcel ? 'Lives here' : row.ownerDistance != null ? `${formatMiles(row.ownerDistance)} away` : null

  return (
    <article
      onClick={() => onOpen(row.id)}
      className={`group flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition hover:shadow-md ${highlighted ? 'border-primary ring-1 ring-primary' : 'border-border'}`}
    >
      <div className="parcel-card-placeholder relative aspect-[2/1] shrink-0 overflow-hidden">
        <LandPlot aria-hidden size={40} strokeWidth={1.25} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-muted-foreground/45" />
        {/* The satellite overhead with the boundary drawn on - every parcel with
            a boundary has one. Lazy-loaded, so only cards scrolled into view
            fetch it; the placeholder shows while it loads, and if it can't. */}
        <Image
          src={satelliteImageUrl(row.countyId, row.id, 'card')}
          alt=""
          fill
          unoptimized
          className="object-cover"
          onError={(e) => { e.currentTarget.hidden = true }}
        />
        {badges.length > 0 && (
          <div className="absolute top-2 left-2 flex flex-wrap gap-1">
            {badges.map((b) => (
              <span key={b} className="rounded-md bg-card/95 px-1.5 py-0.5 text-xs font-semibold text-card-foreground shadow-sm">{b}</span>
            ))}
          </div>
        )}
        <button
          type="button"
          aria-label={saved ? 'Unsave parcel' : 'Save parcel'}
          aria-pressed={saved}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSave(row.id)
          }}
          // A solid tint rather than backdrop-blur: forty blurred backdrops
          // re-composited on every scroll and resize frame cost more than the
          // frosted look is worth.
          className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white transition hover:bg-black/55"
        >
          <Heart size={18} strokeWidth={2.25} className={saved ? 'fill-destructive text-destructive' : ''} />
        </button>
        <span className="absolute bottom-2 left-2 rounded bg-black/50 px-1.5 py-0.5 font-mono text-[11px] text-white">{row.id}</span>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex flex-wrap items-baseline gap-x-2">
          {row.marketValue > 0 ? (
            <span className="text-xl font-bold tracking-tight">{formatUsd(row.marketValue)}</span>
          ) : (
            <span className="text-base font-semibold text-muted-foreground">No market value</span>
          )}
          <span className="text-sm font-semibold text-destructive">{formatUsd(row.taxesOwed)} owed</span>
        </div>
        {facts.length > 0 && (
          <p className="truncate text-sm">
            {facts.map((fact, i) => (
              <Fragment key={i}>
                {i > 0 && <span className="mx-1.5 text-muted-foreground/50">|</span>}
                {fact}
              </Fragment>
            ))}
          </p>
        )}
        {/* The only real control besides the heart, so a keyboard user can
            reach the card - its click bubbles to the article's onOpen. */}
        <button type="button" className="truncate text-left text-sm text-muted-foreground outline-none group-hover:text-foreground focus-visible:underline" title={row.address || undefined}>
          {row.address ? toDisplayCase(row.address) : 'No site address'}
        </button>
        <div className="min-w-0 text-[11px] leading-4 tracking-wide text-muted-foreground uppercase">
          <p className="flex gap-2">
            <span className="truncate font-semibold text-foreground/80">{row.owner}</span>
            {distance && <span className="ml-auto shrink-0 normal-case">{distance}</span>}
          </p>
          {row.ownerAddress && <p className="truncate" title={row.ownerAddress}>{row.ownerAddress}</p>}
        </div>
        <div className="mt-auto pt-1.5">
          <PaymentTimingChart history={row.paymentHistory} compact />
        </div>
      </div>
    </article>
  )
})
