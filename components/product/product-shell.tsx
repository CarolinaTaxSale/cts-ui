'use client'

import Image from 'next/image'
import { AccountMenu } from '@/components/product/account-menu'
import { AnalyzeExperience } from '@/components/product/analyze-experience'
import { CountyMenu } from '@/components/product/county-menu'
import { ProductProvider } from '@/components/product/product-context'
import type { County } from '@/lib/types'

// The product's whole screen: a slim top bar (brand, county picker, account
// menu) over the full-width Analyze experience. The county comes from the URL
// (app/app/[state]/[county]), and the provider is keyed by it so switching
// counties starts from a clean slate.
export function ProductShell({ counties, county, email }: { counties: County[]; county: County; email: string }) {
  return (
    <main className="min-h-screen">
      <header className="topbar">
        <div className="flex items-center gap-3">
          <div className="brand-mark"><Image src="/icon-96x96.png" alt="" width={32} height={32} className="h-full w-full rounded-lg" /></div>
          <span className="brand-name hidden sm:inline">CarolinaTaxSale.com</span>
          <div className="mx-1 h-6 w-px bg-border" />
          <CountyMenu counties={counties} active={county} />
        </div>
        <AccountMenu email={email} />
      </header>
      <div className="content-wide">
        <ProductProvider key={county.id} county={county}>
          <AnalyzeExperience />
        </ProductProvider>
      </div>
    </main>
  )
}
