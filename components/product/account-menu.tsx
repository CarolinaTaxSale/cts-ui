'use client'

import { useRouter } from 'next/navigation'
import { Menu } from '@base-ui/react/menu'
import { LogOut } from 'lucide-react'

// The signed-in user's menu in the top bar. Base UI's Menu supplies the
// keyboard navigation, focus handling and dismissal.
export function AccountMenu({ email }: { email: string }) {
  const router = useRouter()

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
    router.refresh()
  }

  return (
    <Menu.Root>
      <Menu.Trigger aria-label="Account" className="avatar">
        {email[0]?.toUpperCase() ?? '?'}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="end" className="z-[70] outline-none">
          <Menu.Popup className="panel w-64 origin-[var(--transform-origin)] overflow-hidden py-1 shadow-lg outline-none transition-[opacity,scale] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <Menu.Group>
              <Menu.GroupLabel className="truncate border-b border-border px-3.5 py-2.5 text-sm font-medium text-foreground">{email}</Menu.GroupLabel>
              <Menu.Item
                onClick={signOut}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-muted-foreground outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground"
              >
                <LogOut aria-hidden size={15} /> Sign out
              </Menu.Item>
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
