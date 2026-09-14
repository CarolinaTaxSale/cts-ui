import { getLibrary } from '@/lib/server/library'
import { libraryRoute } from '@/lib/server/library-route'
import { getParcelSummaries } from '@/lib/server/parcels'

// GET /api/me/library/parcels - card and map pin fields for every parcel the
// signed-in user has saved or written a note on, across counties. A parcel
// that has left the data is simply missing here; the library still lists it.
export function GET() {
  return libraryRoute('loading saved parcels', async (user) => {
    const library = await getLibrary(user.id)
    const idsByCounty = new Map<string, Set<string>>()
    for (const { countyId, parcelId } of [...library.saved, ...library.notes]) {
      idsByCounty.set(countyId, (idsByCounty.get(countyId) ?? new Set()).add(parcelId))
    }
    const perCounty = await Promise.all(
      [...idsByCounty].map(([countyId, ids]) => getParcelSummaries(countyId, [...ids])),
    )
    return Response.json(perCounty.flat())
  })
}
