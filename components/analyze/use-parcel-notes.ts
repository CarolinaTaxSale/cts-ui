'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLibrary } from '@/components/product/library-context'
import { getNote, putNote } from '@/lib/library-client'
import { parcelKey } from '@/lib/parcel-key'

// Idle time after the last keystroke before an unsaved note autosaves.
const AUTOSAVE_DELAY_MS = Number(process.env.NEXT_PUBLIC_NOTES_AUTOSAVE_DELAY_MS) || 1500

type SaveState = 'idle' | 'saving' | 'error'

// The signed-in user's note on one parcel, for its detail dialog. The notepad
// button lives in the dialog's header and the textarea in its scrollable body,
// so the state lives in their shared parent (parcel-detail-dialog.tsx), which is
// keyed by parcel: a different parcel mounts fresh and loads its own note.
//
// The note is stored per user (app/api/me/notes). It autosaves once typing
// pauses, saves on the button, and saves whatever is left unsaved when the
// dialog closes. Clearing the text deletes the note.
export function useParcelNotes(countyId: string, parcelId: string) {
  const { noteSaved } = useLibrary()
  const [loaded, setLoaded] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesText, setNotesText] = useState('')
  // What the server holds now.
  const [savedText, setSavedText] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveKind, setSaveKind] = useState<'manual' | 'auto'>('manual')
  const autosaveTimer = useRef<number | null>(null)
  // Only the newest request's answer counts; an older one landing late is ignored.
  const requestSeq = useRef(0)
  // The latest text and saved text, for the save-on-close below.
  const latest = useRef({ text: '', saved: '', loaded: false })

  useEffect(() => {
    let cancelled = false
    getNote(countyId, parcelId)
      .then((note) => {
        if (cancelled) return
        const body = note?.body ?? ''
        latest.current = { text: body, saved: body, loaded: true }
        setNotesText(body)
        setSavedText(body)
        // A parcel with a note opens with it showing.
        if (body) setNotesOpen(true)
        setLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        // Still usable: writing a note overwrites whatever couldn't be read.
        latest.current = { text: '', saved: '', loaded: true }
        setLoaded(true)
      })
    return () => { cancelled = true }
  }, [countyId, parcelId])

  const persist = useCallback((text: string, kind: 'manual' | 'auto') => {
    const seq = ++requestSeq.current
    setSaveState('saving')
    putNote(countyId, parcelId, text)
      .then((note) => {
        latest.current.saved = text
        noteSaved(parcelKey(countyId, parcelId), note)
        if (seq !== requestSeq.current) return
        setSavedText(text)
        setSaveKind(kind)
        setSaveState('idle')
      })
      .catch(() => {
        if (seq === requestSeq.current) setSaveState('error')
      })
  }, [countyId, parcelId, noteSaved])

  // Closing the dialog (or moving to another parcel) saves what's left.
  const persistRef = useRef(persist)
  useEffect(() => {
    persistRef.current = persist
  }, [persist])
  useEffect(() => () => {
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
    const { text, saved, loaded: wasLoaded } = latest.current
    if (wasLoaded && text !== saved) persistRef.current(text, 'auto')
  }, [])

  const isEmpty = notesText.trim() === ''
  const isDirty = notesText !== savedText
  const canSave = notesOpen && loaded && saveState !== 'saving' && (isDirty || saveState === 'error')

  const onNotesChange = useCallback((value: string) => {
    setNotesText(value)
    latest.current.text = value
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
    autosaveTimer.current = window.setTimeout(() => {
      autosaveTimer.current = null
      if (latest.current.text !== latest.current.saved) persist(value, 'auto')
    }, AUTOSAVE_DELAY_MS)
  }, [persist])

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
    persist(notesText, 'manual')
  }, [notesOpen, canSave, notesText, persist])

  const hasNote = savedText.trim() !== ''
  const statusLabel = !notesOpen
    ? hasNote ? 'Show notes' : 'Add notes'
    : !loaded
      ? 'Loading notes…'
      : saveState === 'saving'
        ? 'Saving notes…'
        : saveState === 'error'
          ? 'Couldn’t save notes - try again'
          : isDirty
            ? isEmpty ? 'Delete notes' : 'Save notes'
            : isEmpty
              ? 'Start typing below…'
              : `${saveKind === 'manual' ? 'Saved' : 'Autosaved'} notes`

  return { loaded, notesOpen, notesText, isEmpty, isDirty, hasNote, saveState, canSave, statusLabel, onNotesChange, toggle }
}
