import 'server-only'

// Cookie plumbing around otp.ts's session tokens. The cookie holds the raw
// token; only its hash is ever stored, so a leaked DB row can't be replayed as
// a cookie.

import { cookies } from 'next/headers'
import { destroySession, getSessionUser, type SessionUser } from './otp'

const SESSION_COOKIE = 'cts_session'
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60

export async function setSessionCookie(token: string) {
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
}

export async function clearSessionCookie() {
  const store = await cookies()
  await destroySession(store.get(SESSION_COOKIE)?.value)
  store.delete(SESSION_COOKIE)
}

/** The signed-in user for this request (Server Components and route handlers), or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies()
  return getSessionUser(store.get(SESSION_COOKIE)?.value)
}
