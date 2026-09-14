import { addToList, removeFromList } from '@/lib/server/library'
import { libraryRoute, listIdFromUrl, parcelFromUrl } from '@/lib/server/library-route'

type Params = { params: Promise<{ list: string; county: string; parcel: string }> }

// PUT /api/me/lists/:list/parcels/:county/:parcel - add a parcel to a list,
// saving it first if it isn't saved (idempotent).
export function PUT(_req: Request, { params }: Params) {
  return libraryRoute('adding a parcel to a list', async (user) => {
    const { list, county, parcel } = await params
    const listId = listIdFromUrl(list)
    const ref = await parcelFromUrl(county, parcel, { mustExist: true })
    await addToList(user.id, listId, ref.countyId, ref.parcelId)
    return new Response(null, { status: 204 })
  })
}

// DELETE /api/me/lists/:list/parcels/:county/:parcel - take it out of the list. It stays saved.
export function DELETE(_req: Request, { params }: Params) {
  return libraryRoute('removing a parcel from a list', async (user) => {
    const { list, county, parcel } = await params
    const listId = listIdFromUrl(list)
    const ref = await parcelFromUrl(county, parcel, { mustExist: false })
    await removeFromList(user.id, listId, ref.countyId, ref.parcelId)
    return new Response(null, { status: 204 })
  })
}
