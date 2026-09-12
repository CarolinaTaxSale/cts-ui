'use client'

// A single-row cluster showing when this parcel's tax bills actually got paid.
// The track is three consecutive six-month periods, left to right:
//   - Early:   July 1 - Dec 31 of the bill year
//   - On-Time: Jan 1 - June 30 of bill year + 1
//   - Late:    July 1 - Dec 31 of bill year + 1
// A dot sits at the payment's true date within that 18-month window. Anything
// paid earlier than July 1 of the bill year stacks on the far-left edge, and
// anything paid after Dec 31 of bill year + 1 stacks on the far-right edge -
// both are off the scale, so they pile up rather than distort it. Dots fade
// toward the card background the older the bill is, so recent years read
// brightest. The three axis labels are fixed reference zones, not data.

import type { PaymentHistoryEntry } from '@/lib/types'

// Fraction (0-1) across a bill year's 18-month window (July 1 of billYear to
// Dec 31 of billYear + 1) at which a timestamp falls. Clamped, so out-of-range
// payments land on whichever edge they overran.
function fractionOf(billYear: number, ts: number) {
  const start = Date.UTC(billYear, 6, 1)
  const end = Date.UTC(billYear + 1, 11, 31)
  return Math.min(1, Math.max(0, (ts - start) / (end - start)))
}

// The Early|On-Time and On-Time|Late boundaries as window fractions (~1/3 and
// ~2/3). They shift by at most a fraction of a percent across leap years, so
// one representative pair keeps the divider lines put.
const EARLY_BOUNDARY = fractionOf(2001, Date.UTC(2002, 0, 1))
const ONTIME_BOUNDARY = fractionOf(2001, Date.UTC(2002, 6, 1))

const ZONES = [
  { label: 'Early', center: EARLY_BOUNDARY / 2 },
  { label: 'On-Time', center: (EARLY_BOUNDARY + ONTIME_BOUNDARY) / 2 },
  { label: 'Late', center: (ONTIME_BOUNDARY + 1) / 2 },
]

// The dimmest a dot gets: below this an old payment blends too far into the
// card to spot.
const MIN_MIX = 25

type Dot = {
  billYear: number
  x: number
  y: number
  mix: number
  paid: boolean
  label: string
}

// Stable per-payment vertical offset so payments landing on nearby dates - or
// several partial payments against one bill year - don't stack into one blob.
function jitter(seed: number) {
  const n = Math.sin(seed * 12.9898) * 43758.5453
  return n - Math.floor(n)
}

// `history` is issued bills only (not-yet-issued placeholders already dropped -
// see ParcelSummary.paymentHistory). `compact` is the parcel-card size: a
// shorter track and smaller dots, same scale and zones.
export function PaymentTimingChart({ history, compact = false }: { history: PaymentHistoryEntry[]; compact?: boolean }) {
  const years = history.map((e) => e.billYear)
  const minYear = years.length ? Math.min(...years) : 0
  const maxYear = years.length ? Math.max(...years) : 0
  const span = Math.max(1, maxYear - minYear)

  const dots: Dot[] = history
    .map((e, i) => {
      const paidTs = e.paymentDate ? Date.parse(e.paymentDate) : NaN
      const paid = !Number.isNaN(paidTs)
      return {
        billYear: e.billYear,
        x: paid ? fractionOf(e.billYear, paidTs) : 1,
        y: 0.2 + jitter(paid ? paidTs : e.billYear * 100 + i) * 0.6,
        mix: MIN_MIX + ((e.billYear - minYear) / span) * (100 - MIN_MIX),
        paid,
        label: paid
          ? `${e.billYear} bill · paid ${new Date(paidTs).toLocaleDateString()}`
          : `${e.billYear} bill · unpaid`,
      }
    })
    // Newest last so the brightest dots paint on top.
    .sort((a, b) => a.billYear - b.billYear)

  return (
    <div>
      <div className={`flex items-center justify-between gap-3 ${compact ? 'mb-1' : 'mb-2'}`}>
        <p className="data-label">Payment timing</p>
        {dots.length > 1 && (
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {minYear}
            <span className="inline-flex items-center gap-0.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: `color-mix(in oklch, var(--primary) ${MIN_MIX}%, var(--card))` }} />
              <span className="inline-block h-2 w-2 rounded-full bg-primary" />
            </span>
            {maxYear}
          </span>
        )}
      </div>
      {dots.length === 0 ? (
        <p className={compact ? 'text-xs text-muted-foreground' : 'text-sm text-muted-foreground'}>No tax payment history</p>
      ) : (
        <div className={`rounded-lg border border-border bg-card ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}>
          <div className={`relative ${compact ? 'h-6' : 'h-9'}`}>
            <div className="absolute inset-y-0 w-px bg-muted-foreground/30" style={{ left: `${EARLY_BOUNDARY * 100}%` }} />
            <div className="absolute inset-y-0 w-px bg-muted-foreground/30" style={{ left: `${ONTIME_BOUNDARY * 100}%` }} />
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/60" />
            {dots.map((d, i) => (
              <div
                key={i}
                title={d.label}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-inset ring-foreground/10 ${compact ? 'h-2 w-2' : 'h-2.5 w-2.5'}`}
                style={{
                  left: `${d.x * 100}%`,
                  top: `${d.y * 100}%`,
                  background: d.paid ? `color-mix(in oklch, var(--primary) ${d.mix}%, var(--card))` : 'var(--card)',
                  border: d.paid ? undefined : '1px solid var(--destructive)',
                }}
              />
            ))}
          </div>
          <div className="relative mt-1 h-4 border-t border-border/60 pt-1 text-[10px] text-muted-foreground">
            <div className="absolute top-0 h-1.5 w-px bg-muted-foreground/30" style={{ left: `${EARLY_BOUNDARY * 100}%` }} />
            <div className="absolute top-0 h-1.5 w-px bg-muted-foreground/30" style={{ left: `${ONTIME_BOUNDARY * 100}%` }} />
            {ZONES.map((zone) => (
              <span
                key={zone.label}
                className="absolute top-1 -translate-x-1/2 whitespace-nowrap"
                style={{ left: `${zone.center * 100}%` }}
              >
                {zone.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
