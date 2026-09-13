import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/server/auth/session'
import { plainCounties } from '@/lib/counties'
import { ProductShell } from '@/components/product/product-shell'

export default async function AppPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const counties = plainCounties()
  return <ProductShell counties={counties} initialCounty={counties[0]!} email={user.email} />
}
