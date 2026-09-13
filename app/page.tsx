import Image from 'next/image'
import Link from 'next/link'
import { MapPinned, Home as HomeIcon, TrendingDown, Search } from 'lucide-react'
import { getCurrentUser } from '@/lib/server/auth/session'
import { getDelinquentParcels } from '@/lib/server/parcels'
import { PreviewCard } from '@/components/marketing/preview-card'

export default async function LandingPage() {
  const [user, previewParcels] = await Promise.all([
    getCurrentUser(),
    // Best effort: without the database the page still renders, minus the live strip.
    getDelinquentParcels('sc.york', { limit: 3 }).catch(() => []),
  ])
  const ctaHref = user ? '/app' : '/login'
  const ctaLabel = user ? 'Go to your dashboard' : 'Get started free'

  return (
    <main>
      <header className="topbar">
        <div className="flex items-center gap-3">
          <div className="brand-mark"><Image src="/icon-96x96.png" alt="" width={32} height={32} className="h-full w-full rounded-lg" /></div>
          <span className="brand-name">CarolinaTaxSale.com</span>
        </div>
        <Link href={ctaHref} className="primary-button">{user ? 'Dashboard' : 'Sign in'}</Link>
      </header>

      {/* Hero */}
      <section className="content-wide grid gap-10 pt-10 sm:pt-16 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div>
          <p className="eyebrow">Delinquent tax parcel research</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-.04em] sm:text-5xl">
            Know every parcel before it hits the auction block.
          </h1>
          <p className="mt-4 max-w-lg text-base text-muted-foreground sm:text-lg">
            CarolinaTaxSale.com pulls delinquent tax data straight from the county,
            then layers in satellite imagery, street-level photos, ownership history,
            and payment timing so you can size up a lead in seconds instead of hours.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <Link href={ctaHref} className="primary-button cta-sweep relative h-12 px-6 text-base">{ctaLabel}</Link>
            <p className="text-sm text-muted-foreground">No password. No spam. Just your email.</p>
          </div>
        </div>
        <div className="relative">
          <div className="panel overflow-hidden shadow-lg">
            <div className="grid grid-cols-2">
              <Image
                src="/screenshots/parcel-5940906290-satellite.jpg"
                alt="Overhead satellite view of a parcel"
                width={1200}
                height={900}
                className="h-full w-full object-cover"
                priority
              />
              <Image
                src="/screenshots/parcel-5940906290-streetview.jpg"
                alt="Street-level photo of the same parcel"
                width={640}
                height={480}
                className="h-full w-full object-cover"
                priority
              />
            </div>
            <div className="space-y-1 p-5">
              <p className="text-xl font-semibold tracking-tight">$3,299,000</p>
              <p className="text-sm font-medium text-destructive">$97,941 owed</p>
              <p className="text-sm text-muted-foreground">415 Clouds Way, Rock Hill, SC, 29732</p>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">Real parcel data from York County, SC - captured live in the product.</p>
        </div>
      </section>

      {/* Features */}
      <section className="content-wide mt-20 sm:mt-28">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCard icon={MapPinned} title="See it before you drive there" body="Overhead satellite imagery and street-level photos for every parcel, pulled automatically." />
          <FeatureCard icon={TrendingDown} title="Payment timing at a glance" body="A year-by-year history of every tax bill and whether it was paid on time, late, or not at all." />
          <FeatureCard icon={HomeIcon} title="Owner + sales history" body="Current owner, mailing address, and the full recorded sales history for the parcel." />
          <FeatureCard icon={Search} title="Search, filter, sort" body="Filter by market value, taxes owed, acreage, and more - sort by whatever matters to your strategy." />
        </div>
      </section>

      {/* Live preview */}
      {previewParcels.length > 0 && (
        <section className="content-wide mt-20 sm:mt-28">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Live from York County, SC</p>
              <h2 className="page-title mt-2">This is real data, right now.</h2>
            </div>
            <Link href={ctaHref} className="secondary-button">Browse all parcels</Link>
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {previewParcels.map((parcel) => (
              <PreviewCard key={parcel.parcelId} parcel={parcel} />
            ))}
          </div>
        </section>
      )}

      {/* Closing CTA */}
      <section className="content-wide my-20 sm:my-28">
        <div className="panel flex flex-col items-center gap-4 p-10 text-center shadow-sm sm:p-14">
          <h2 className="page-title">Start finding leads today.</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Enter your email, we&apos;ll send you a one-time code, and you&apos;re in.
          </p>
          <Link href={ctaHref} className="primary-button cta-sweep relative h-12 px-6 text-base">{ctaLabel}</Link>
        </div>
      </section>

      <footer className="border-t border-border/80 py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} CarolinaTaxSale.com
      </footer>
    </main>
  )
}

function FeatureCard({ icon: Icon, title, body }: { icon: typeof MapPinned; title: string; body: string }) {
  return (
    <div className="panel p-5">
      <div className="metric-icon mb-3"><Icon size={18} /></div>
      <p className="section-title">{title}</p>
      <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
    </div>
  )
}
