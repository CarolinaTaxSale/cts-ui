'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Idle time after the last keystroke before an unsaved note autosaves.
const AUTOSAVE_DELAY_MS = Number(process.env.NEXT_PUBLIC_NOTES_AUTOSAVE_DELAY_MS) || 5000

// Notes state for the parcel detail dialog. The notepad button lives in the
// dialog's header (parcel-detail-dialog.tsx) and the textarea lives in the
// scrollable body (parcel-detail.tsx) - two different components, so this is
// a hook rather than local state in either one.
//
// The dialog itself stays mounted while the operator switches between
// parcels (only `row`/`detail` change), so a fresh parcel's notes can't rely
// on remounting via a `key` the way this used to - the effect below resets on
// every `parcelId` change instead.
export function useParcelNotes(parcelId: string) {
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesText, setNotesText] = useState('')
  const [lastSavedText, setLastSavedText] = useState('')
  const [saveKind, setSaveKind] = useState<'manual' | 'auto'>('manual')
  const autosaveTimer = useRef<number | null>(null)

  useEffect(() => {
    setNotesOpen(false)
    setNotesText('')
    setLastSavedText('')
    setSaveKind('manual')
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current)
      autosaveTimer.current = null
    }
  }, [parcelId])

  useEffect(() => () => {
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
  }, [])

  const isEmpty = notesText.trim() === ''
  const isDirty = notesText !== lastSavedText
  const canSave = notesOpen && !isEmpty && isDirty

  const saveManually = useCallback(() => {
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current)
      autosaveTimer.current = null
    }
    setLastSavedText(notesText)
    setSaveKind('manual')
  }, [notesText])

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
    if (!notesOpen) { setNotesOpen(true); return }
    if (canSave) saveManually()
  }, [notesOpen, canSave, saveManually])

  const statusLabel = !notesOpen
    ? 'Add notes'
    : isEmpty
      ? 'Start typing below…'
      : isDirty
        ? 'Save notes'
        : `${saveKind === 'manual' ? 'Saved' : 'Autosaved'} notes`

  return { notesOpen, notesText, isEmpty, isDirty, canSave, statusLabel, onNotesChange, toggle }
}
