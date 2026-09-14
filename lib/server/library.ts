import 'server-only'

// A signed-in user's library: the parcels they save, the lists they sort them
// into, and their notes. Reads and writes the `consumer_app` schema
// (migrations/0002) over the `cts_ui_app` role; every query is scoped to the
// user id from the session, never to an id the client sent.

import type { Library, NoteSummary, ParcelList, ParcelNote, SavedParcel } from '../types'
import { authDb } from './db'

// What one account can keep. Generous for real use; they bound what a script
// holding a session can make the database store.
export const MAX_SAVED_PARCELS = 5000
export const MAX_LISTS = 100
export const MAX_LIST_NAME_LENGTH = 60
export const MAX_NOTE_LENGTH = 20000
const NOTE_PREVIEW_LENGTH = 280

export class LibraryError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message)
    this.name = 'LibraryError'
  }
}

const UNIQUE_VIOLATION = '23505'
const FOREIGN_KEY_VIOLATION = '23503'
const pgCode = (err: unknown) => (err as { code?: string } | null)?.code

const toIso = (value: Date | string) => (value instanceof Date ? value : new Date(value)).toISOString()

export async function getLibrary(userId: string): Promise<Library> {
  const sql = authDb()
  const [saved, lists, items, notes] = await Promise.all([
    sql<{ countyId: string; parcelId: string; savedAt: Date }[]>`
      select county_id as "countyId", parcel_id as "parcelId", saved_at as "savedAt"
      from consumer_app.saved_parcels where user_id = ${userId}
      order by saved_at desc
    `,
    sql<{ id: string; name: string; createdAt: Date }[]>`
      select id, name, created_at as "createdAt"
      from consumer_app.parcel_lists where user_id = ${userId}
      order by created_at, name
    `,
    sql<{ listId: string; countyId: string; parcelId: string }[]>`
      select list_id as "listId", county_id as "countyId", parcel_id as "parcelId"
      from consumer_app.parcel_list_items where user_id = ${userId}
      order by added_at
    `,
    sql<{ countyId: string; parcelId: string; preview: string; updatedAt: Date }[]>`
      select county_id as "countyId", parcel_id as "parcelId", left(body, ${NOTE_PREVIEW_LENGTH}) as preview, updated_at as "updatedAt"
      from consumer_app.parcel_notes where user_id = ${userId}
      order by updated_at desc
    `,
  ])

  const listIdsByParcel = new Map<string, string[]>()
  for (const item of items) {
    const key = `${item.countyId}:${item.parcelId}`
    listIdsByParcel.set(key, [...(listIdsByParcel.get(key) ?? []), item.listId])
  }

  return {
    saved: saved.map<SavedParcel>((s) => ({
      countyId: s.countyId,
      parcelId: s.parcelId,
      savedAt: toIso(s.savedAt),
      listIds: listIdsByParcel.get(`${s.countyId}:${s.parcelId}`) ?? [],
    })),
    lists: lists.map<ParcelList>((l) => ({ id: l.id, name: l.name, createdAt: toIso(l.createdAt) })),
    notes: notes.map<NoteSummary>((n) => ({ countyId: n.countyId, parcelId: n.parcelId, preview: n.preview, updatedAt: toIso(n.updatedAt) })),
  }
}

// --- saved parcels ---

export async function saveParcel(userId: string, countyId: string, parcelId: string): Promise<void> {
  await authDb().begin(async (tx) => {
    // Serializes one user's saves, so two racing past the cap check can't both land.
    await tx`select pg_advisory_xact_lock(hashtext(${`saved:${userId}`}))`
    const [{ count }] = await tx<{ count: number }[]>`
      select count(*)::int as count from consumer_app.saved_parcels where user_id = ${userId}
    `
    if (count >= MAX_SAVED_PARCELS) {
      const [existing] = await tx`
        select 1 from consumer_app.saved_parcels
        where user_id = ${userId} and county_id = ${countyId} and parcel_id = ${parcelId}
      `
      if (existing) return
      throw new LibraryError(409, `You can save up to ${MAX_SAVED_PARCELS.toLocaleString()} parcels. Unsave some to make room.`)
    }
    await tx`
      insert into consumer_app.saved_parcels (user_id, county_id, parcel_id)
      values (${userId}, ${countyId}, ${parcelId})
      on conflict do nothing
    `
  })
}

/** Unsaving also takes the parcel out of every list (the foreign key cascades). Its note stays. */
export async function unsaveParcel(userId: string, countyId: string, parcelId: string): Promise<void> {
  await authDb()`
    delete from consumer_app.saved_parcels
    where user_id = ${userId} and county_id = ${countyId} and parcel_id = ${parcelId}
  `
}

// --- lists ---

export function normalizeListName(input: unknown): string {
  const name = typeof input === 'string' ? input.trim().replace(/\s+/g, ' ') : ''
  if (!name) throw new LibraryError(400, 'Give the list a name.')
  if (name.length > MAX_LIST_NAME_LENGTH) throw new LibraryError(400, `List names can be up to ${MAX_LIST_NAME_LENGTH} characters.`)
  return name
}

const nameTaken = (name: string) => new LibraryError(409, `You already have a list called "${name}".`)

export async function createList(userId: string, name: string): Promise<ParcelList> {
  try {
    return await authDb().begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${`lists:${userId}`}))`
      const [{ count }] = await tx<{ count: number }[]>`
        select count(*)::int as count from consumer_app.parcel_lists where user_id = ${userId}
      `
      if (count >= MAX_LISTS) throw new LibraryError(409, `You can have up to ${MAX_LISTS} lists.`)
      const [list] = await tx<{ id: string; name: string; createdAt: Date }[]>`
        insert into consumer_app.parcel_lists (user_id, name) values (${userId}, ${name})
        returning id, name, created_at as "createdAt"
      `
      return { id: list.id, name: list.name, createdAt: toIso(list.createdAt) }
    })
  } catch (err) {
    if (pgCode(err) === UNIQUE_VIOLATION) throw nameTaken(name)
    throw err
  }
}

export async function renameList(userId: string, listId: string, name: string): Promise<ParcelList> {
  try {
    const [list] = await authDb()<{ id: string; name: string; createdAt: Date }[]>`
      update consumer_app.parcel_lists set name = ${name}
      where id = ${listId} and user_id = ${userId}
      returning id, name, created_at as "createdAt"
    `
    if (!list) throw new LibraryError(404, 'That list no longer exists.')
    return { id: list.id, name: list.name, createdAt: toIso(list.createdAt) }
  } catch (err) {
    if (pgCode(err) === UNIQUE_VIOLATION) throw nameTaken(name)
    throw err
  }
}

/** Deleting a list leaves its parcels saved. */
export async function deleteList(userId: string, listId: string): Promise<void> {
  await authDb()`delete from consumer_app.parcel_lists where id = ${listId} and user_id = ${userId}`
}

/** Adding a parcel to a list saves it first, if it isn't already. */
export async function addToList(userId: string, listId: string, countyId: string, parcelId: string): Promise<void> {
  const [list] = await authDb()`select 1 from consumer_app.parcel_lists where id = ${listId} and user_id = ${userId}`
  if (!list) throw new LibraryError(404, 'That list no longer exists.')
  await saveParcel(userId, countyId, parcelId)
  try {
    await authDb()`
      insert into consumer_app.parcel_list_items (list_id, user_id, county_id, parcel_id)
      values (${listId}, ${userId}, ${countyId}, ${parcelId})
      on conflict do nothing
    `
  } catch (err) {
    // The list was deleted, or the parcel unsaved, in between.
    if (pgCode(err) === FOREIGN_KEY_VIOLATION) throw new LibraryError(409, 'That changed in another window. Refresh and try again.')
    throw err
  }
}

export async function removeFromList(userId: string, listId: string, countyId: string, parcelId: string): Promise<void> {
  await authDb()`
    delete from consumer_app.parcel_list_items
    where list_id = ${listId} and user_id = ${userId} and county_id = ${countyId} and parcel_id = ${parcelId}
  `
}

// --- notes ---

export async function getNote(userId: string, countyId: string, parcelId: string): Promise<ParcelNote | null> {
  const [note] = await authDb()<{ body: string; updatedAt: Date }[]>`
    select body, updated_at as "updatedAt" from consumer_app.parcel_notes
    where user_id = ${userId} and county_id = ${countyId} and parcel_id = ${parcelId}
  `
  return note ? { body: note.body, updatedAt: toIso(note.updatedAt) } : null
}

/** Writes the note, or deletes it when `body` is blank. Returns what's stored now. */
export async function putNote(userId: string, countyId: string, parcelId: string, body: string): Promise<ParcelNote | null> {
  if (body.length > MAX_NOTE_LENGTH) throw new LibraryError(400, `Notes can be up to ${MAX_NOTE_LENGTH.toLocaleString()} characters.`)
  const sql = authDb()
  if (body.trim() === '') {
    await sql`
      delete from consumer_app.parcel_notes
      where user_id = ${userId} and county_id = ${countyId} and parcel_id = ${parcelId}
    `
    return null
  }
  const [note] = await sql<{ body: string; updatedAt: Date }[]>`
    insert into consumer_app.parcel_notes (user_id, county_id, parcel_id, body)
    values (${userId}, ${countyId}, ${parcelId}, ${body})
    on conflict (user_id, county_id, parcel_id) do update set body = excluded.body, updated_at = now()
    returning body, updated_at as "updatedAt"
  `
  return { body: note.body, updatedAt: toIso(note.updatedAt) }
}
