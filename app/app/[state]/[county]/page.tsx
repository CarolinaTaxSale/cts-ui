import { notFound, redirect } from 'next/navigation'
import { ProductShell } from '@/components/product/product-shell'
import { countyFromPath, plainCounties } from '@/lib/counties'
import { getCurrentUser } from '@/lib/server/auth/session'

// /app/:state/:county - the product for one county. The county lives in the URL,
// so a refresh, a bookmark or a shared link opens the same county.
export default async function CountyPage({ params }: { params: Promise<{ state: string; county: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { state, county } = await params
  const active = countyFromPath(state, county)
  if (!active) notFound()

  return <ProductShell counties={plainCounties()} county={active} email={user.email} />
}
