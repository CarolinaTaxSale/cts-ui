'use client'

import { Skeleton } from '@/components/product/skeleton'
import { formatMiles, formatUsd } from '@/lib/format'
import { ParcelHeroImages } from './parcel-hero-images'
import { ParcelMap } from './parcel-map'
import { PaymentTimingChart } from './payment-timing-chart'
import type { AnalyzeRow, AnalyzeSummaryRow } from './analyze-row'

// The body of the parcel detail dialog (parcel-detail-dialog.tsx). `row` (the
// card's own summary data) renders instantly; `detail` - owners, full zoning,
// valuations, sales, and the polygon outline - is fetched lazily for just this
// one parcel (see use-selected-parcel.ts) once it's opened, and renders as a
// skeleton until it arrives. Notes state lives one level up (see
// use-parcel-notes.ts) because the button that opens/saves the textarea below
// sits in the dialog's header, not in this scrollable body.
export function ParcelDetail({
  row,
  detail,
  loading,
  notesOpen,
  notesText,
  onNotesChange,
}: {
  row: AnalyzeSummaryRow
  detail: AnalyzeRow | undefined
  loading: boolean
  notesOpen: boolean
  notesText: string
  onNotesChange: (value: string) => void
}) {
  // detail fetch failed silently (see use-selected-parcel.ts) - tell the
  // operator rather than shimmering forever.
  const detailUnavailable = !loading && !detail

  // Only the market-value line is shown here now; the rest of the valuation
  // stack (taxable, land, improvement, ...) is noise for the Analyze view.
  const marketValuations = detail ? detail.valuations.filter((v) => /market value/i.test(v.label)) : []

  return (
    <div className="p-5">
      {notesOpen && (
        <textarea
          autoFocus
          value={notesText}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Add notes about this parcel…"
          className="mb-5 h-28 w-full resize-y rounded-lg border border-input bg-background p-3 text-sm outline-none focus:border-primary"
        />
      )}
      <div className="mb-5">
        <ParcelHeroImages countyId={row.countyId} parcelId={row.id} center={row.centroid} streetView={detail?.streetView} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <p className="data-label">Address</p>
            <p className="text-sm">{row.address || '-'}</p>
          </div>
          <div>
            <p className="data-label mb-2">Owners</p>
            <div className="space-y-1">
              {detail
                ? detail.owners.map((o) => (
                    <p key={o.name} className="text-sm">
                      {o.name} · <span className="text-muted-foreground">{o.address || '-'}</span>
                      {o.address && detail.ownerDistance != null && (
                        <span className="text-muted-foreground">
                          {' · '}
                          {detail.ownerAtParcel && detail.owners.length === 1
                            ? 'lives at parcel'
                            : `${formatMiles(detail.ownerDistance)} away`}
                        </span>
                      )}
                      {o.identity && o.identity.holdings.parcelCount > 1 && (
                        <span className="ml-1 whitespace-nowrap rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                          {o.identity.canonicalName !== o.name && `${o.identity.canonicalName} · `}
                          holds {o.identity.holdings.parcelCount} parcels
                          {o.identity.holdings.totalAssessedValue > 0 &&
                            ` · $${
                              o.identity.holdings.totalAssessedValue >= 1_000_000
                                ? `${(o.identity.holdings.totalAssessedValue / 1_000_000).toFixed(1)}M`
                                : `${Math.round(o.identity.holdings.totalAssessedValue / 1_000)}k`
                            }`}
                        </span>
                      )}
                    </p>
                  ))
                : detailUnavailable
                  ? <p className="text-sm text-muted-foreground">Couldn&apos;t load</p>
                  : <Skeleton className="h-4 w-48" />}
            </div>
          </div>
          <div>
            <p className="data-label mb-2">Parcel details</p>
            <div className="space-y-1">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Acreage</span><span className="font-mono">{row.acres == null ? '-' : row.acres.toFixed(2)}</span></div>
              <div className="flex justify-between gap-3 text-sm"><span className="shrink-0 text-muted-foreground">Zoning</span><span className="text-right">{detail ? detail.zoning.join(', ') || '-' : row.type}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Taxes owed</span><span className="font-mono">{formatUsd(row.taxesOwed)}</span></div>
            </div>
          </div>
          <div>
            <p className="data-label mb-2">Valuation</p>
            <div className="space-y-1">
              {detail
                ? marketValuations.length
                  ? marketValuations.map((v) => (
                      <div key={v.label} className="flex justify-between text-sm"><span className="text-muted-foreground">{v.label}</span><span className="font-mono">{formatUsd(v.amount)}</span></div>
                    ))
                  : <p className="text-sm text-muted-foreground">-</p>
                : detailUnavailable
                  ? <p className="text-sm text-muted-foreground">Couldn&apos;t load</p>
                  : <Skeleton className="h-4 w-40" />}
            </div>
          </div>
          <div>
            <p className="data-label mb-2">Sales history</p>
            <div className="overflow-x-auto rounded-lg border border-border">
              {detail ? (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Seller</th>
                      <th className="px-3 py-2 font-medium">Buyer</th>
                      <th className="px-3 py-2 text-right font-medium">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.sales.map((s, i) => (
                      <tr key={i} className={i > 0 ? 'border-t border-border/70' : ''}>
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{s.date ? new Date(s.date).toLocaleDateString() : '-'}</td>
                        <td className="px-3 py-2">{s.seller}</td>
                        <td className="px-3 py-2">{s.buyer}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatUsd(s.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : detailUnavailable ? (
                <p className="p-3 text-sm text-muted-foreground">Couldn&apos;t load</p>
              ) : (
                <Skeleton className="h-16 w-full rounded-none" />
              )}
            </div>
          </div>
          {/* The card's summary already carries the same bills, so the chart
              draws straight away rather than waiting on the detail fetch. */}
          <PaymentTimingChart history={detail?.paymentHistory ?? row.paymentHistory} />
        </div>
        {/* isolate: Leaflet's internal panes/controls use z-indexes up to
            ~1000, which without a contained stacking context here would climb
            past anything layered over the dialog body. */}
        <div className="isolate h-64 overflow-hidden rounded-xl border border-border lg:h-auto">
          {detail ? (
            <ParcelMap outline={detail} satellite />
          ) : detailUnavailable ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Couldn&apos;t load map</div>
          ) : (
            <div className="skeleton h-full w-full" />
          )}
        </div>
      </div>
    </div>
  )
}
