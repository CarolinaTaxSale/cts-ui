'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { County } from '@/lib/api'

type ProductContextValue = {
  county: County
  savedParcelIds: Set<string>
  // Saves an unsaved parcel and unsaves a saved one - the Analyze cards' heart.
  // One identity for the provider's lifetime, so memoized cards that take it
  // don't all re-render whenever anything is saved.
  toggleSavedParcel: (id: string) => void
}

const ProductContext = createContext<ProductContextValue | null>(null)

export function ProductProvider({ county, children }: { county: County; children: ReactNode }) {
  const [savedParcelIds, setSavedParcelIds] = useState<Set<string>>(new Set())
  const toggleSavedParcel = useCallback((id: string) =>
    setSavedParcelIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    }), [])
  const value = useMemo(() => ({ county, savedParcelIds, toggleSavedParcel }), [county, savedParcelIds, toggleSavedParcel])

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
