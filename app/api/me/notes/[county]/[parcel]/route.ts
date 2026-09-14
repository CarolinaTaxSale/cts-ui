import { LibraryError, getNote, putNote } from '@/lib/server/library'
import { jsonBody, libraryRoute, parcelFromUrl } from '@/lib/server/library-route'

type Params = { params: Promise<{ county: string; parcel: string }> }

// GET /api/me/notes/:county/:parcel - the user's note on a parcel: {body, updatedAt}, or null.
export function GET(_req: Request, { params }: Params) {
  return libraryRoute('loading a note', async (user) => {
    const { county, parcel } = await params
    const ref = await parcelFromUrl(county, parcel, { mustExist: false })
    return Response.json(await getNote(user.id, ref.countyId, ref.parcelId))
  })
}

// PUT /api/me/notes/:county/:parcel {body} - write the note; a blank body deletes
// it. Returns what's stored now, the same shape as GET.
export function PUT(req: Request, { params }: Params) {
  return libraryRoute('saving a note', async (user) => {
    const { county, parcel } = await params
    const { body } = await jsonBody(req)
    if (typeof body !== 'string') throw new LibraryError(400, 'Expected the note as a string.')
    // Clearing a note never needs the parcel to still exist.
    const ref = await parcelFromUrl(county, parcel, { mustExist: body.trim() !== '' })
    return Response.json(await putNote(user.id, ref.countyId, ref.parcelId, body))
  })
}
