'use client'

import { useState, useEffect, useMemo } from 'react'
import type { RefObject } from 'react'
import Fuse from 'fuse.js'
import type { Session, NormalizedEvent, MessageNotes } from '@/lib/types'
import { Input } from '@/components/ui/input'
import { Search, StickyNote, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { sumKnownMessageCounts } from '@/lib/session-count'

interface SearchPanelProps {
  sessions: Session[]
  notes?: MessageNotes
  onSearchChange: (query: string, results: NormalizedEvent[]) => void
  inputRef?: RefObject<HTMLInputElement | null>
  clearSignal?: number
  hasUnhydratedSessions?: boolean
  isHydratingAllSessions?: boolean
  onLoadAllSessions?: () => void
}

function extractSearchableText(event: NormalizedEvent): string {
  if (event.kind === 'user') {
    return event.text || ''
  }
  if (event.kind === 'assistant') {
    return event.blocks
      .filter((block) => block.type === 'text' && block.text)
      .map((block) => block.text!)
      .join(' ')
  }
  return ''
}

const MAX_RESULTS = 500

export default function SearchPanel({
  sessions,
  notes,
  onSearchChange,
  inputRef,
  clearSignal,
  hasUnhydratedSessions = false,
  isHydratingAllSessions = false,
  onLoadAllSessions,
}: SearchPanelProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [resultCount, setResultCount] = useState(0)
  const [notesOnly, setNotesOnly] = useState(false)

  const messageItems = useMemo(() => {
    return sessions.flatMap((session) =>
      session.events
        .filter((event) => !(event.kind === 'user' && event.isMetadataOnly))
        .map((event) => ({
          event,
          searchableText: extractSearchableText(event),
          sessionTitle: session.title,
          sessionId: session.sessionId,
        })),
    )
  }, [sessions])

  const noteItems = useMemo(() => {
    if (!notes) return []
    const eventById = new Map<string, NormalizedEvent>()
    sessions.forEach((session) => {
      session.events.forEach((event) => {
        if (event.id) eventById.set(event.id, event)
      })
    })
    return Object.entries(notes)
      .map(([id, note]) => {
        const event = eventById.get(id)
        if (!event) return null
        if (event.kind === 'user' && event.isMetadataOnly) return null
        const text = note?.text || ''
        if (!text.trim()) return null
        return {
          event,
          searchableText: text,
        }
      })
      .filter(Boolean) as Array<{ event: NormalizedEvent; searchableText: string }>
  }, [notes, sessions])

  const messageFuse = useMemo(() => {
    return new Fuse(messageItems, {
      keys: [{ name: 'searchableText', weight: 1.0 }],
      threshold: 0.3,
      includeScore: true,
      ignoreLocation: true,
    })
  }, [messageItems])

  const noteFuse = useMemo(() => {
    return new Fuse(noteItems, {
      keys: [{ name: 'searchableText', weight: 1.0 }],
      threshold: 0.3,
      includeScore: true,
      ignoreLocation: true,
    })
  }, [noteItems])

  useEffect(() => {
    if (!searchQuery.trim()) {
      onSearchChange('', [])
      setResultCount(0)
      return
    }

    const handle = setTimeout(() => {
      const results = notesOnly ? noteFuse.search(searchQuery) : messageFuse.search(searchQuery)
      setResultCount(results.length)
      const resultEvents = results.slice(0, MAX_RESULTS).map((result) => result.item.event)
      onSearchChange(searchQuery, resultEvents)
    }, 150)

    return () => clearTimeout(handle)
  }, [searchQuery, messageFuse, noteFuse, notesOnly, onSearchChange])

  useEffect(() => {
    if (clearSignal === undefined) return
    setSearchQuery('')
  }, [clearSignal])

  const clearSearch = () => {
    setSearchQuery('')
  }

  const totalMessages = sumKnownMessageCounts(sessions)
  const totalNotes = noteItems.length
  const placeholder = hasUnhydratedSessions
    ? `Search loaded history (${notesOnly ? totalNotes : totalMessages} ${notesOnly ? 'notes' : 'messages'})...`
    : `Search ${notesOnly ? totalNotes : totalMessages} ${notesOnly ? 'notes' : 'messages'}...`

  return (
    <div className="flex items-center gap-3 flex-1">
      <div className="relative flex-1 max-w-2xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 pr-10 h-9"
          ref={inputRef}
        />
        {searchQuery && (
          <Button
            size="sm"
            variant="ghost"
            onClick={clearSearch}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
      {notes && (
        <Button
          type="button"
          size="sm"
          variant={notesOnly ? 'secondary' : 'outline'}
          className="bg-transparent"
          onClick={() => setNotesOnly((value) => !value)}
        >
          <StickyNote className="w-4 h-4 mr-2" />
          Notes
        </Button>
      )}
      {hasUnhydratedSessions && onLoadAllSessions && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="bg-transparent"
          onClick={onLoadAllSessions}
          disabled={isHydratingAllSessions}
        >
          {isHydratingAllSessions ? 'Loading histories…' : 'Load all histories'}
        </Button>
      )}
      {searchQuery && (
        <p className="text-xs text-muted-foreground whitespace-nowrap">
          {resultCount} {resultCount === 1 ? 'result' : 'results'}
          {resultCount > MAX_RESULTS && ` (top ${MAX_RESULTS})`}
        </p>
      )}
    </div>
  )
}
