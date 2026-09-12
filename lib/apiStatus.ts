'use client'

// Shared "can we reach the orchestrator right now?" signal. The API client
// (lib/api.ts) reports the outcome of every request here; the app chrome
// subscribes so one unreachable service shows a single banner instead of a
// red error block on every view.

import { useEffect, useState } from 'react'

export type ApiStatus = 'unknown' | 'reachable' | 'unreachable'

const STATUS_CHANGED_EVENT = 'ctsui:api-status-changed'

let status: ApiStatus = 'unknown'

export function getApiStatus(): ApiStatus {
  return status
}

function setStatus(next: ApiStatus) {
  if (next === status) return
  status = next
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(STATUS_CHANGED_EVENT))
}

// A response - even a 4xx/5xx - means the service answered, so it's reachable.
export function reportApiReachable() {
  setStatus('reachable')
}

// Only a thrown fetch or a 504 from the proxy (orchestrator down, offline)
// counts as unreachable.
export function reportApiUnreachable() {
  setStatus('unreachable')
}

export function useApiStatus(): ApiStatus {
  const [value, setValue] = useState<ApiStatus>(status)
  useEffect(() => {
    setValue(status)
    const sync = () => setValue(getApiStatus())
    window.addEventListener(STATUS_CHANGED_EVENT, sync)
    return () => window.removeEventListener(STATUS_CHANGED_EVENT, sync)
  }, [])
  return value
}
