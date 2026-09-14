import { deleteList, normalizeListName, renameList } from '@/lib/server/library'
import { jsonBody, libraryRoute, listIdFromUrl } from '@/lib/server/library-route'

type Params = { params: Promise<{ list: string }> }

// PATCH /api/me/lists/:list {name} - rename a list.
export function PATCH(req: Request, { params }: Params) {
  return libraryRoute('renaming a list', async (user) => {
    const listId = listIdFromUrl((await params).list)
    const { name } = await jsonBody(req)
    return Response.json(await renameList(user.id, listId, normalizeListName(name)))
  })
}

// DELETE /api/me/lists/:list - delete a list. Its parcels stay saved.
export function DELETE(_req: Request, { params }: Params) {
  return libraryRoute('deleting a list', async (user) => {
    await deleteList(user.id, listIdFromUrl((await params).list))
    return new Response(null, { status: 204 })
  })
}
