import 'server-only'

// Email-only OTP sign-in: request a 6-digit code, verify it, get a session.
// Codes and sessions live in the `consumer_auth` schema, never in memory, so a
// code survives a restart and works the same on every replica.

import { createHash, randomBytes, randomInt } from 'node:crypto'
import { authDb } from '../db'
import { sendOtpEmail } from './email'

const OTP_TTL_MINUTES = 10
const OTP_LENGTH = 6
const MAX_VERIFY_ATTEMPTS = 5
const SESSION_TTL_DAYS = 30

// Every code request sends a real email, so these bound what anyone can make
// this app send to one address - not just what one client can request.
const RESEND_COOLDOWN_SECONDS = 60
const MAX_CODES_PER_HOUR = 5

// A per-request salt would need its own column to verify against, and buys
// nothing here: the secret is a 6-digit code with MAX_VERIFY_ATTEMPTS tries that
// expires in OTP_TTL_MINUTES, not a password reused across sites. Hashing keeps
// a leaked otp_codes row from being read back as a working code.
function hashCode(email: string, code: string): string {
  return createHash('sha256').update(`${email}:${code}`).digest('hex')
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

const normalizeEmail = (email: string) => email.trim().toLowerCase()

export type RequestOtpResult = { ok: true } | { ok: false; retryAfterSeconds: number }

export async function requestOtp(emailInput: string): Promise<RequestOtpResult> {
  const email = normalizeEmail(emailInput)
  const sql = authDb()

  // Served by otp_codes_email_idx (email, created_at desc). Two requests racing
  // past this check can both send; the limits stay bounded either way.
  const [recent] = await sql<{ codes: number; secondsSinceLatest: number | null; secondsUntilSlotFrees: number | null }[]>`
    select
      count(*)::int as codes,
      extract(epoch from now() - max(created_at))::int as "secondsSinceLatest",
      extract(epoch from min(created_at) + interval '1 hour' - now())::int as "secondsUntilSlotFrees"
    from consumer_auth.otp_codes
    where email = ${email} and created_at > now() - interval '1 hour'
  `
  if (recent && recent.secondsSinceLatest !== null && recent.secondsSinceLatest < RESEND_COOLDOWN_SECONDS) {
    return { ok: false, retryAfterSeconds: RESEND_COOLDOWN_SECONDS - recent.secondsSinceLatest }
  }
  if (recent && recent.codes >= MAX_CODES_PER_HOUR) {
    return { ok: false, retryAfterSeconds: Math.max(1, recent.secondsUntilSlotFrees ?? 3600) }
  }

  const code = randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0')
  await sql`
    insert into consumer_auth.otp_codes (email, code_hash, expires_at)
    values (${email}, ${hashCode(email, code)}, ${new Date(Date.now() + OTP_TTL_MINUTES * 60_000)})
  `
  await sendOtpEmail(email, code, OTP_TTL_MINUTES)
  return { ok: true }
}

export type VerifyOtpResult =
  | { ok: true; sessionToken: string; expiresAt: Date }
  | { ok: false; reason: 'invalid_or_expired' | 'too_many_attempts' }

export async function verifyOtp(emailInput: string, code: string): Promise<VerifyOtpResult> {
  const email = normalizeEmail(emailInput)

  return authDb().begin(async (tx) => {
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
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60_000)
    await tx`
      insert into consumer_auth.sessions (user_id, token_hash, expires_at)
      values (${user.id}, ${hashToken(sessionToken)}, ${expiresAt})
    `
    return { ok: true, sessionToken, expiresAt } as const
  })
}

export type SessionUser = { id: string; email: string }

export async function getSessionUser(sessionToken: string | undefined): Promise<SessionUser | null> {
  if (!sessionToken) return null
  const [row] = await authDb()<SessionUser[]>`
    select u.id, u.email
    from consumer_auth.sessions s
    join consumer_auth.users u on u.id = s.user_id
    where s.token_hash = ${hashToken(sessionToken)} and s.expires_at > now()
    limit 1
  `
  return row ?? null
}

export async function destroySession(sessionToken: string | undefined): Promise<void> {
  if (!sessionToken) return
  await authDb()`delete from consumer_auth.sessions where token_hash = ${hashToken(sessionToken)}`
}
