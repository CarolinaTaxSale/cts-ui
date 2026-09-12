import { isValidCounty } from '@/lib/counties'
import { notFound, serverError } from '@/lib/server/http'
import { getParcel } from '@/lib/server/parcels'

// GET /api/counties/:county/parcels/:parcel - one parcel in full, for the
// detail dialog. Parcel ids are county formats (Lancaster's carry dots and
// dashes) and only ever reach SQL as a bound parameter, so they aren't
// pattern-checked here.
export async function GET(_req: Request, { params }: { params: Promise<{ county: string; parcel: string }> }) {
  const { county, parcel } = await params
  if (!isValidCounty(county)) return notFound('Unknown county')
  try {
    const found = await getParcel(county, parcel)
    return found ? Response.json(found) : notFound('Parcel not found')
  } catch (err) {
    return serverError(err, `loading ${county} parcel ${parcel}`)
  }
}
