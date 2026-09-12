'use client'

import { useEffect, type RefObject } from 'react'

// `refs` intentionally isn't in the effect's dependency array: the RefObject
// wrappers themselves (from useRef) are referentially stable, only the array
// literal passed in isn't, and re-subscribing the listener on every render
// would be pure waste.
export function useClickOutside(active: boolean, refs: RefObject<HTMLElement | null>[], onOutside: () => void) {
  useEffect(() => {
    if (!active) return
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (refs.some((ref) => ref.current?.contains(target))) return
      onOutside()
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, onOutside])
}
