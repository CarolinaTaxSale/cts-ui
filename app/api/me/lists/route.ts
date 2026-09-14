import { createList, normalizeListName } from '@/lib/server/library'
import { jsonBody, libraryRoute } from '@/lib/server/library-route'

// POST /api/me/lists {name} - create a list. 409 when the user already has one
// by that name (case-insensitive) or is at the list limit.
export function POST(req: Request) {
  return libraryRoute('creating a list', async (user) => {
    const { name } = await jsonBody(req)
    return Response.json(await createList(user.id, normalizeListName(name)), { status: 201 })
  })
}
