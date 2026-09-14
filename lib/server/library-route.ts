import 'server-only'

// The plumbing every /api/me route shares: the signed-in user, the parcel and
// list named in the URL, and turning a LibraryError into its HTTP status.

import { isValidCounty } from '../counties'
import { getCurrentUser } from './auth/session'
import type { SessionUser } from './auth/otp'
import { serverError, unauthorized } from './http'
import { LibraryError } from './library'
import { parcelExists } from './parcels'

export async function libraryRoute(while_: string, handler: (user: SessionUser) => Promise<Response>): Promise<Response> {
  const user = await getCurrentUser()
  if (!user) return unauthorized('Sign in to save parcels.')
  try {
    return await handler(user)
  } catch (err) {
    if (err instanceof LibraryError) return Response.json({ error: err.message }, { status: err.status })
    return serverError(err, while_)
  }
}

/**
 * The county and parcel a URL names. With `mustExist`, the parcel has to be in
 * the parcels schema - true for anything that adds to a library. Removing
 * skips the check, so a parcel that has since left the data can still be
 * cleared out.
 */
export async function parcelFromUrl(county: string, parcel: string, { mustExist }: { mustExist: boolean }) {
  if (!isValidCounty(county)) throw new LibraryError(404, 'Unknown county')
  if (parcel.length === 0 || parcel.length > 64) throw new LibraryError(404, 'Parcel not found')
  if (mustExist && !(await parcelExists(county, parcel))) throw new LibraryError(404, 'Parcel not found')
  return { countyId: county, parcelId: parcel }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A list id from the URL. Anything that isn't a UUID can't name a list, so it's a 404, not a database error. */
export function listIdFromUrl(list: string): string {
  if (!UUID.test(list)) throw new LibraryError(404, 'That list no longer exists.')
  return list.toLowerCase()
}

export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  const body: unknown = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new LibraryError(400, 'Expected a JSON object.')
  return body as Record<string, unknown>
}
