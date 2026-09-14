'use client'

import { useState, type FormEvent } from 'react'
import { Popover } from '@base-ui/react/popover'
import { ListPlus } from 'lucide-react'
import { useLibrary } from '@/components/product/library-context'

// "Add to list" for one parcel: tick the lists it belongs in, or name a new
// one. Ticking a list saves the parcel if it isn't saved yet. A Popover rather
// than a Menu, since it holds a text field.
export function ListMenu({ parcelKey }: { parcelKey: string }) {
  const { library, listIdsByKey, setInList, createList } = useLibrary()
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lists = library?.lists ?? []
  const memberOf = listIdsByKey.get(parcelKey) ?? []
  const inCount = lists.filter((l) => memberOf.includes(l.id)).length

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || creating) return
    setCreating(true)
    setError(null)
    try {
      const list = await createList(name)
      setInList(list.id, parcelKey, true)
      setName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t create that list.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Popover.Root onOpenChange={(open) => { if (!open) setError(null) }}>
      <Popover.Trigger
        disabled={!library}
        className="secondary-button h-9 px-3 disabled:opacity-50 data-[popup-open]:bg-muted"
        aria-label={inCount ? `In ${inCount} ${inCount === 1 ? 'list' : 'lists'}` : 'Add to list'}
      >
        <ListPlus aria-hidden size={16} />
        <span className="hidden sm:inline">{inCount ? `In ${inCount} ${inCount === 1 ? 'list' : 'lists'}` : 'Add to list'}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" className="z-[70] outline-none">
          <Popover.Popup className="panel w-72 origin-[var(--transform-origin)] overflow-hidden shadow-lg outline-none transition-[opacity,scale] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <Popover.Title className="border-b border-border px-3.5 py-2.5 text-sm font-semibold">Save to lists</Popover.Title>
            {lists.length === 0 ? (
              <p className="px-3.5 py-3 text-sm text-muted-foreground">No lists yet. Name one below to start sorting your saved parcels.</p>
            ) : (
              <ul className="max-h-64 overflow-y-auto py-1">
                {lists.map((list) => (
                  <li key={list.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={memberOf.includes(list.id)}
                        onChange={(e) => setInList(list.id, parcelKey, e.target.checked)}
                        className="h-4 w-4 accent-[var(--primary)]"
                      />
                      <span className="min-w-0 truncate">{list.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={submit} className="border-t border-border p-2.5">
              <div className="flex gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  placeholder="New list, e.g. Redemptions"
                  aria-label="New list name"
                  className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:border-primary"
                />
                <button type="submit" disabled={!name.trim() || creating} className="primary-button h-9 px-3 disabled:opacity-50">
                  Add
                </button>
              </div>
              {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
            </form>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
