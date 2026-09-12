import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { getCountiesServer } from '@/lib/counties-server'
import { ProductShell } from '@/components/product/product-shell'

export default async function AppPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const counties = await getCountiesServer()
  if (counties.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8 text-center">
        <div>
          <p className="text-lg font-semibold">No counties available yet</p>
          <p className="mt-2 text-sm text-muted-foreground">Check back soon.</p>
        </div>
      </main>
    )
  }

  return <ProductShell counties={counties} initialCounty={counties[0]!} email={user.email} />
}
