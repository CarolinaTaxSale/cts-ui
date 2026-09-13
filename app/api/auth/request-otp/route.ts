import { requestOtp } from '@/lib/server/auth/otp'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function waitText(seconds: number): string {
  const minutes = Math.ceil(seconds / 60)
  return minutes <= 1 ? 'a minute' : `${minutes} minutes`
}

// Throttled per email address in the database (lib/server/auth/otp.ts), which
// holds across restarts and replicas. Per-IP limits belong at the edge in front
// of this app: an address read from X-Forwarded-For here can be forged.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  let result
  try {
    result = await requestOtp(email)
  } catch (err) {
    console.error('requestOtp failed', err)
    return Response.json({ error: 'Something went wrong sending your code. Try again.' }, { status: 500 })
  }

  if (!result.ok) {
    return Response.json(
      { error: `Too many codes requested for this address. Try again in ${waitText(result.retryAfterSeconds)}.` },
      { status: 429, headers: { 'retry-after': String(result.retryAfterSeconds) } },
    )
  }
  return Response.json({ ok: true })
}
