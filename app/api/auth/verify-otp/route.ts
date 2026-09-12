import { verifyOtp } from '@/lib/otp'
import { setSessionCookie } from '@/lib/session'

const CODE_RE = /^\d{6}$/

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  const code = typeof body?.code === 'string' ? body.code.trim() : ''
  if (!email || !CODE_RE.test(code)) {
    return Response.json({ error: 'Enter the 6-digit code from your email.' }, { status: 400 })
  }

  let result
  try {
    result = await verifyOtp(email, code)
  } catch (err) {
    console.error('verifyOtp failed', err)
    return Response.json({ error: 'Something went wrong verifying your code. Try again.' }, { status: 500 })
  }

  if (!result.ok) {
    const message = result.reason === 'too_many_attempts'
      ? 'Too many incorrect attempts. Request a new code.'
      : "That code is incorrect or has expired."
    return Response.json({ error: message }, { status: 400 })
  }

  await setSessionCookie(result.sessionToken)
  return Response.json({ ok: true })
}
