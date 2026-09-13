import { isValidCounty } from '@/lib/counties'
import { notFound, serverError } from '@/lib/server/http'
import { getDelinquentParcels } from '@/lib/server/parcels'

// GET /api/counties/:county/parcels - the county's delinquent parcels, as the
// Analyze experience's cards and map pins draw them.
export async function GET(_req: Request, { params }: { params: Promise<{ county: string }> }) {
  const { county } = await params
  if (!isValidCounty(county)) return notFound('Unknown county')
  try {
    return Response.json(await getDelinquentParcels(county))
  } catch (err) {
    return serverError(err, `listing ${county} parcels`)
  }
}
