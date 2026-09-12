'use client'

import { useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useClickOutside } from '@/components/product/use-click-outside'
import type { County } from '@/lib/api'

// Replaces admin-ui's always-visible county sidebar with a single dropdown -
// this app has exactly one screen (the Analyze experience), so there's no
// tab bar or other county-scoped navigation to keep a sidebar around for.
export function CountyDropdown({ counties, active, onSelect }: { counties: County[]; active: County; onSelect: (county: County) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(open, [ref], () => setOpen(false))

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="secondary-button gap-2"
      >
        <span className="font-mono text-xs text-muted-foreground">{active.state}</span>
        {active.name}
        <ChevronDown size={15} className="text-muted-foreground" />
      </button>
      {open && (
        <div role="listbox" className="panel absolute left-0 top-[calc(100%+0.5rem)] z-50 w-64 overflow-hidden py-1 shadow-lg">
          {counties.map((county) => (
            <button
              key={county.id}
              role="option"
              aria-selected={county.id === active.id}
              onClick={() => { onSelect(county); setOpen(false) }}
              className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition hover:bg-muted ${county.id === active.id ? 'font-semibold text-primary' : 'text-foreground'}`}
            >
              <span>{county.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{county.state}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
