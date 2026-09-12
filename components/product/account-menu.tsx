'use client'

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { useClickOutside } from '@/components/product/use-click-outside'

export function AccountMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(open, [ref], () => setOpen(false))

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
    router.refresh()
  }

  const initial = email[0]?.toUpperCase() ?? '?'

  return (
    <div ref={ref} className="relative">
      <button aria-label="Account" onClick={() => setOpen((o) => !o)} className="avatar">{initial}</button>
      {open && typeof window !== 'undefined' && createPortal(
        <div onClick={() => setOpen(false)} className="fixed inset-0 z-[2000]">
          <div
            onClick={(e) => e.stopPropagation()}
            className="panel absolute right-5 top-16 w-64 overflow-hidden py-1 shadow-lg sm:right-8"
          >
            <p className="truncate border-b border-border px-3.5 py-2.5 text-sm font-medium">{email}</p>
            <button onClick={signOut} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground">
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
