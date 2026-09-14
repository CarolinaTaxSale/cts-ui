import { getLibrary } from '@/lib/server/library'
import { libraryRoute } from '@/lib/server/library-route'

// GET /api/me/library - everything the signed-in user keeps: saved parcels
// (with the lists each is in), their lists, and a preview of each note.
export function GET() {
  return libraryRoute('loading a library', async (user) => Response.json(await getLibrary(user.id)))
}
