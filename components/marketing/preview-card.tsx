import Image from 'next/image'
import { formatUsd, toDisplayCase } from '@/lib/format'
import { satelliteImageUrl } from '@/lib/parcel-images'
import type { ParcelSummary } from '@/lib/types'

// A stripped-down, non-interactive read of the real product's parcel card -
// no save/open handlers, no map pin sync - just enough to show a visitor what
// the data looks like. Deliberately its own component rather than reusing
// components/analyze/parcel-card.tsx: that one drags in the full Analyze
// interaction model (selection, hover, the save heart) that a marketing page
// has no use for and shouldn't pay the bundle weight of.
export function PreviewCard({ parcel }: { parcel: ParcelSummary }) {
  return (
    <div className="panel overflow-hidden shadow-sm">
      <div className="parcel-card-placeholder relative aspect-[2/1]">
        <Image
          src={satelliteImageUrl(parcel.countyId, parcel.parcelId, 'card')}
          alt=""
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover"
        />
      </div>
      <div className="space-y-1.5 p-4">
        <p className="text-lg font-semibold tracking-tight">{formatUsd(parcel.marketValue)}</p>
        <p className="text-sm font-medium text-destructive">{formatUsd(parcel.taxesOwed)} owed</p>
        <p className="truncate text-sm text-muted-foreground">{toDisplayCase(parcel.address)}</p>
        <p className="truncate text-xs text-muted-foreground">{toDisplayCase(parcel.owner)}</p>
      </div>
    </div>
  )
}
