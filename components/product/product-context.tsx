'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { County } from '@/lib/types'

// The county a county page is showing. What the user has saved lives in
// library-context.tsx instead, since it spans counties.
type ProductContextValue = {
  county: County
}

const ProductContext = createContext<ProductContextValue | null>(null)

export function ProductProvider({ county, children }: { county: County; children: ReactNode }) {
  const value = useMemo(() => ({ county }), [county])

  return (
    <ProductContext.Provider value={value}>
      {children}
    </ProductContext.Provider>
  )
}

export function useProduct() {
  const ctx = useContext(ProductContext)
  if (!ctx) throw new Error('useProduct must be used within a ProductProvider')
  return ctx
}
