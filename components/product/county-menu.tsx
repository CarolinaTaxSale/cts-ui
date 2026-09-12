'use client'

import Link from 'next/link'
import { Menu } from '@base-ui/react/menu'
import { Check, ChevronDown } from 'lucide-react'
import { countyPath } from '@/lib/counties'
import type { County } from '@/lib/types'

// The county picker in the top bar, in place of admin-ui's county sidebar. Each
// county is a link to its own URL; Base UI's Menu supplies the keyboard
// navigation, focus handling and dismissal.
export function CountyMenu({ counties, active }: { counties: County[]; active: County }) {
  return (
    <Menu.Root>
      <Menu.Trigger className="secondary-button gap-2 data-[popup-open]:bg-muted">
        <span className="font-mono text-xs text-muted-foreground">{active.state}</span>
        {active.name}
        <ChevronDown aria-hidden size={15} className="text-muted-foreground" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="start" className="z-[70] outline-none">
          <Menu.Popup className="panel w-64 origin-[var(--transform-origin)] overflow-hidden py-1 shadow-lg outline-none transition-[opacity,scale] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            {counties.map((county) => {
              const current = county.id === active.id
              return (
                <Menu.LinkItem
                  key={county.id}
                  closeOnClick
                  render={<Link href={countyPath(county)} aria-current={current ? 'page' : undefined} />}
                  className={`flex w-full items-center justify-between px-3 py-2.5 text-sm outline-none data-[highlighted]:bg-muted ${current ? 'font-semibold text-primary' : 'text-foreground'}`}
                >
                  <span>{county.name}</span>
                  {current ? <Check aria-hidden size={15} /> : <span className="font-mono text-xs text-muted-foreground">{county.state}</span>}
                </Menu.LinkItem>
              )
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
