import type { County } from './api'

// Server-only: call this from Server Components, before any request exists to
// proxy relative to. Fetches the orchestrator directly via ORCHESTRATOR_URL -
// the same var the /api/orchestrator proxy route reads - rather than going
// through that proxy.
export async function getCountiesServer(): Promise<County[]> {
  const base = (process.env.ORCHESTRATOR_URL || 'http://localhost:3100').replace(/\/+$/, '')
  try {
    const res = await fetch(`${base}/counties`, { cache: 'no-store' })
    if (!res.ok) return []
    return (await res.json()) as County[]
  } catch {
    return []
  }
}
