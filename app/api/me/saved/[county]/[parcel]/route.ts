import { saveParcel, unsaveParcel } from '@/lib/server/library'
import { libraryRoute, parcelFromUrl } from '@/lib/server/library-route'

type Params = { params: Promise<{ county: string; parcel: string }> }

// PUT /api/me/saved/:county/:parcel - save a parcel (idempotent).
export function PUT(_req: Request, { params }: Params) {
  return libraryRoute('saving a parcel', async (user) => {
    const { county, parcel } = await params
    const ref = await parcelFromUrl(county, parcel, { mustExist: true })
    await saveParcel(user.id, ref.countyId, ref.parcelId)
    return new Response(null, { status: 204 })
  })
}

// DELETE /api/me/saved/:county/:parcel - unsave it, which also takes it out of every list.
export function DELETE(_req: Request, { params }: Params) {
  return libraryRoute('unsaving a parcel', async (user) => {
    const { county, parcel } = await params
    const ref = await parcelFromUrl(county, parcel, { mustExist: false })
    await unsaveParcel(user.id, ref.countyId, ref.parcelId)
    return new Response(null, { status: 204 })
  })
}
