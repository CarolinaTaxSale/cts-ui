'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { Heart } from 'lucide-react'
import { AccountMenu } from '@/components/product/account-menu'
import { CountyMenu } from '@/components/product/county-menu'
import { LibraryProvider, useLibrary } from '@/components/product/library-context'
import { countyPath } from '@/lib/counties'
import type { County } from '@/lib/types'

export const SAVED_PATH = '/app/saved'

function SavedLink({ active }: { active: boolean }) {
  const { library } = useLibrary()
  const count = library?.saved.length ?? 0
  return (
    <Link
      href={SAVED_PATH}
      aria-current={active ? 'page' : undefined}
      aria-label={`Saved parcels${library ? ` (${count})` : ''}`}
      className={`secondary-button h-9 gap-2 px-3 ${active ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15' : ''}`}
    >
      <Heart aria-hidden size={16} className={count > 0 ? 'fill-destructive text-destructive' : ''} />
      <span className="hidden sm:inline">Saved</span>
      {library && count > 0 && (
        <span className="min-w-5 rounded-full bg-muted px-1.5 text-center text-xs font-bold text-muted-foreground tabular-nums">{count}</span>
      )}
    </Link>
  )
}

// Every signed-in screen: a slim top bar (brand, county picker, saved parcels,
// account menu) over the page. It lives in the /app layout, so moving between
// counties and the saved page keeps the library loaded.
export function AppChrome({ counties, email, children }: { counties: County[]; email: string; children: ReactNode }) {
  const pathname = usePathname()
  const active = counties.find((c) => pathname === countyPath(c) || pathname.startsWith(`${countyPath(c)}/`)) ?? null
  const onSaved = pathname === SAVED_PATH

  return (
    <LibraryProvider>
      <main className="min-h-screen">
        <header className="topbar">
          <div className="flex min-w-0 items-center gap-3">
            <Link href={countyPath(active ?? counties[0])} className="flex items-center gap-3">
              <div className="brand-mark"><Image src="/icon-96x96.png" alt="" width={32} height={32} className="h-full w-full rounded-lg" /></div>
              <span className="brand-name hidden sm:inline">CarolinaTaxSale.com</span>
            </Link>
            <div className="mx-1 h-6 w-px bg-border" />
            <CountyMenu counties={counties} active={active} />
          </div>
          <div className="flex items-center gap-3">
            <SavedLink active={onSaved} />
            <AccountMenu email={email} />
          </div>
        </header>
        {children}
      </main>
    </LibraryProvider>
  )
}
