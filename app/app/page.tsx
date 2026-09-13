import { redirect } from 'next/navigation'
import { COUNTIES, countyPath } from '@/lib/counties'
import { getCurrentUser } from '@/lib/server/auth/session'

// /app opens the first county; each county has its own URL.
export default async function AppPage() {
  if (!(await getCurrentUser())) redirect('/login')
  redirect(countyPath(COUNTIES[0]))
}
