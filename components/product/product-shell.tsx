'use client'

import { useState } from 'react'
import Image from 'next/image'
import { CountyDropdown } from '@/components/product/county-dropdown'
import { AccountMenu } from '@/components/product/account-menu'
import { ProductProvider } from '@/components/product/product-context'
import { AnalyzeExperience } from '@/components/product/analyze-experience'
import type { County } from '@/lib/types'

// The consumer app's entire screen real estate: a slim top bar (brand, county
// picker, account menu - no Overview/Ingest/Execute tabs, no county
// sidebar - the county dropdown replaces both) over the full-width Analyze
// experience. See AGENTS/task notes: this app has exactly one product screen.
export function ProductShell({ counties, initialCounty, email }: { counties: County[]; initialCounty: County; email: string }) {
  const [county, setCounty] = useState(initialCounty)

  return (
    <main className="min-h-screen">
      <header className="topbar">
        <div className="flex items-center gap-3">
          <div className="brand-mark"><Image src="/icon-96x96.png" alt="" width={32} height={32} className="h-full w-full rounded-lg" /></div>
          <span className="brand-name hidden sm:inline">CarolinaTaxSale.com</span>
          <div className="mx-1 h-6 w-px bg-border" />
          <CountyDropdown counties={counties} active={county} onSelect={setCounty} />
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
