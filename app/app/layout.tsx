import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { AppChrome } from '@/components/product/app-chrome'
import { plainCounties } from '@/lib/counties'
import { getCurrentUser } from '@/lib/server/auth/session'

// Everything under /app is for signed-in users and shares one top bar and one
// loaded library (saved parcels, lists, notes). Each page still checks the
// session itself, since a layout doesn't re-render on every navigation.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return (
    <AppChrome counties={plainCounties()} email={user.email}>
      {children}
    </AppChrome>
  )
}
