// The browser's side of app/api/me: the signed-in user's saved parcels, lists
// and notes. Everything here runs in the browser; the queries live in
// lib/server/library.ts.

import { ApiError } from './api-client'
import type { Library, ParcelList, ParcelNote, ParcelSummary } from './types'

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(res.status, payload?.error ?? res.statusText)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

const enc = encodeURIComponent
const parcelPath = (countyId: string, parcelId: string) => `${enc(countyId)}/${enc(parcelId)}`

export const getLibrary = () => request<Library>('GET', '/api/me/library')

/** Summaries of every parcel the user has saved or written a note on, across counties. */
export const getLibraryParcels = () => request<ParcelSummary[]>('GET', '/api/me/library/parcels')

export const saveParcel = (countyId: string, parcelId: string) =>
  request<void>('PUT', `/api/me/saved/${parcelPath(countyId, parcelId)}`)

export const unsaveParcel = (countyId: string, parcelId: string) =>
  request<void>('DELETE', `/api/me/saved/${parcelPath(countyId, parcelId)}`)

export const createList = (name: string) => request<ParcelList>('POST', '/api/me/lists', { name })

export const renameList = (listId: string, name: string) => request<ParcelList>('PATCH', `/api/me/lists/${enc(listId)}`, { name })

export const deleteList = (listId: string) => request<void>('DELETE', `/api/me/lists/${enc(listId)}`)

export const addToList = (listId: string, countyId: string, parcelId: string) =>
  request<void>('PUT', `/api/me/lists/${enc(listId)}/parcels/${parcelPath(countyId, parcelId)}`)

export const removeFromList = (listId: string, countyId: string, parcelId: string) =>
  request<void>('DELETE', `/api/me/lists/${enc(listId)}/parcels/${parcelPath(countyId, parcelId)}`)

export const getNote = (countyId: string, parcelId: string) =>
  request<ParcelNote | null>('GET', `/api/me/notes/${parcelPath(countyId, parcelId)}`)

export const putNote = (countyId: string, parcelId: string, body: string) =>
  request<ParcelNote | null>('PUT', `/api/me/notes/${parcelPath(countyId, parcelId)}`, { body })
