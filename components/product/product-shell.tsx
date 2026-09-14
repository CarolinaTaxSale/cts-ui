'use client'

import { AnalyzeExperience } from '@/components/product/analyze-experience'
import { ProductProvider } from '@/components/product/product-context'
import type { County } from '@/lib/types'

// One county's page under the top bar (app-chrome.tsx): the full-width Analyze
// experience. The county comes from the URL (app/app/[state]/[county]), and the
// provider is keyed by it so switching counties starts from a clean slate.
export function ProductShell({ county }: { county: County }) {
  return (
    <div className="content-wide">
      <ProductProvider key={county.id} county={county}>
        <AnalyzeExperience />
      </ProductProvider>
    </div>
  )
}
