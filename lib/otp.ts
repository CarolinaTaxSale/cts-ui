// Email-only OTP sign-in: request a 6-digit code, verify it, get a session.
// Codes and sessions live in the `consumer_auth` schema on pdo-db (see
// lib/db.ts and migrations/0001_consumer_auth.sql) - never in memory, so a
// code survives a redeploy/restart and works the same across every replica.

import { createHash, randomBytes, randomInt } from 'node:crypto'
import { authDb } from './db'
import { sendOtpEmail } from './email'

const OTP_TTL_MINUTES = 10
const OTP_LENGTH = 6
const MAX_VERIFY_ATTEMPTS = 5
const SESSION_TTL_DAYS = 30

// A per-request salt would need its own column to verify against later, and
// buys nothing here: the secret being hashed is a 6-digit code the caller
// already rate-limits attempts on (MAX_VERIFY_ATTEMPTS) and that expires in
// OTP_TTL_MINUTES, not a password reused across sites. sha256 keeps a stolen
// otp_codes row from being read back as a plaintext code at a glance.
function hashCode(email: string, code: string): string {
  return createHash('sha256').update(`${email.toLowerCase()}:${code}`).digest('hex')
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function requestOtp(emailInput: string): Promise<void> {
  const email = emailInput.trim().toLowerCase()
  const code = randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0')
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000)

  await authDb`
    insert into consumer_auth.otp_codes (email, code_hash, expires_at)
    values (${email}, ${hashCode(email, code)}, ${expiresAt})
  `
  await sendOtpEmail(email, code)
}

export type VerifyOtpResult =
  | { ok: true; sessionToken: string; expiresAt: Date }
  | { ok: false; reason: 'invalid_or_expired' | 'too_many_attempts' }

export async function verifyOtp(emailInput: string, code: string): Promise<VerifyOtpResult> {
  const email = emailInput.trim().toLowerCase()

  return authDb.begin(async (tx) => {
    const [pending] = await tx`
      select id, code_hash, attempt_count
      from consumer_auth.otp_codes
      where email = ${email} and consumed_at is null and expires_at > now()
      order by created_at desc
      limit 1
      for update
    `
    if (!pending) return { ok: false, reason: 'invalid_or_expired' } as const
    if (pending.attempt_count >= MAX_VERIFY_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' } as const

    if (pending.code_hash !== hashCode(email, code)) {
      await tx`update consumer_auth.otp_codes set attempt_count = attempt_count + 1 where id = ${pending.id}`
      return { ok: false, reason: 'invalid_or_expired' } as const
    }

    await tx`update consumer_auth.otp_codes set consumed_at = now() where id = ${pending.id}`

    const [user] = await tx`
      insert into consumer_auth.users (email) values (${email})
      on conflict (email) do update set email = excluded.email
      returning id
    `

    const sessionToken = randomBytes(32).toString('base64url')
    const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60_000)
    await tx`
      insert into consumer_auth.sessions (user_id, token_hash, expires_at)
      values (${user.id}, ${hashToken(sessionToken)}, ${sessionExpiresAt})
    `

    return { ok: true, sessionToken, expiresAt: sessionExpiresAt } as const
  })
}

export type SessionUser = { id: string; email: string }

export async function getSessionUser(sessionToken: string | undefined): Promise<SessionUser | null> {
  if (!sessionToken) return null
  const [row] = await authDb`
    select u.id, u.email
    from consumer_auth.sessions s
    join consumer_auth.users u on u.id = s.user_id
    where s.token_hash = ${hashToken(sessionToken)} and s.expires_at > now()
    limit 1
  `
  return row ? { id: row.id, email: row.email } : null
}

export async function destroySession(sessionToken: string | undefined): Promise<void> {
  if (!sessionToken) return
  await authDb`delete from consumer_auth.sessions where token_hash = ${hashToken(sessionToken)}`
}
