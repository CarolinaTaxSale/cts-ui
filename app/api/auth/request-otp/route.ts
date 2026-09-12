import { requestOtp } from '@/lib/otp'

// A very generous per-IP limit, entirely to blunt a script hammering this
// route - not real abuse protection (that needs a durable store, not this
// process's memory). Good enough until this app sees real traffic.
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 5
const hits = new Map<string, number[]>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > MAX_PER_WINDOW
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (rateLimited(ip)) {
    return Response.json({ error: 'Too many requests - try again in a minute.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  try {
    await requestOtp(email)
  } catch (err) {
    console.error('requestOtp failed', err)
    return Response.json({ error: 'Something went wrong sending your code. Try again.' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
