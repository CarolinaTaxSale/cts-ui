'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Idle time after the last keystroke before an unsaved note autosaves.
const AUTOSAVE_DELAY_MS = Number(process.env.NEXT_PUBLIC_NOTES_AUTOSAVE_DELAY_MS) || 5000

// Notes state for one parcel's detail dialog. The notepad button lives in the
// dialog's header and the textarea in its scrollable body, so the state lives
// in their shared parent (parcel-detail-dialog.tsx), which is keyed by parcel:
// a different parcel mounts fresh and starts with an empty draft.
export function useParcelNotes() {
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesText, setNotesText] = useState('')
  const [lastSavedText, setLastSavedText] = useState('')
  const [saveKind, setSaveKind] = useState<'manual' | 'auto'>('manual')
  const autosaveTimer = useRef<number | null>(null)

  useEffect(() => () => {
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
  }, [])

  const isEmpty = notesText.trim() === ''
  const isDirty = notesText !== lastSavedText
  const canSave = notesOpen && !isEmpty && isDirty

  const onNotesChange = useCallback((value: string) => {
    setNotesText(value)
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
    autosaveTimer.current = window.setTimeout(() => {
      autosaveTimer.current = null
      setLastSavedText((prevSaved) => {
        if (value.trim() === '' || value === prevSaved) return prevSaved
        setSaveKind('auto')
        return value
      })
    }, AUTOSAVE_DELAY_MS)
  }, [])

  const toggle = useCallback(() => {
    if (!notesOpen) {
      setNotesOpen(true)
      return
    }
    if (!canSave) return
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current)
      autosaveTimer.current = null
    }
    setLastSavedText(notesText)
    setSaveKind('manual')
  }, [notesOpen, canSave, notesText])

  const statusLabel = !notesOpen
    ? 'Add notes'
    : isEmpty
      ? 'Start typing below…'
      : isDirty
        ? 'Save notes'
        : `${saveKind === 'manual' ? 'Saved' : 'Autosaved'} notes`

  return { notesOpen, notesText, isEmpty, isDirty, canSave, statusLabel, onNotesChange, toggle }
}
