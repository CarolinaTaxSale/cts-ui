import { isValidCounty } from '@/lib/counties'
import { getCurrentUser } from '@/lib/server/auth/session'
import { notFound, serverError, unauthorized } from '@/lib/server/http'
import { getDelinquentParcels } from '@/lib/server/parcels'

// GET /api/counties/:county/parcels - the county's delinquent parcels, as the
// Analyze experience's cards and map pins draw them. Signed-in users only, like
// the page that shows them.
export async function GET(_req: Request, { params }: { params: Promise<{ county: string }> }) {
  if (!(await getCurrentUser())) return unauthorized()
  const { county } = await params
  if (!isValidCounty(county)) return notFound('Unknown county')
  try {
    return Response.json(await getDelinquentParcels(county))
  } catch (err) {
    return serverError(err, `listing ${county} parcels`)
  }
}
