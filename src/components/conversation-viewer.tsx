'use client'

import { ScrollArea } from '@/components/ui/scroll-area'
import type {
  Session,
  NormalizedEvent,
  FavoriteRatings,
  MessageNotes,
  MessageHighlights,
  MessageTodos,
} from '@/lib/types'
import MessageBubble from './message-bubble'
import { Button } from '@/components/ui/button'
import {
  FileDown,
  FileArchive,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  ArrowDownAZ,
  ArrowUpAZ,
  HelpCircle,
  Share2,
  FileCode,
  Star,
  Menu,
  StickyNote,
  Highlighter,
} from 'lucide-react'
import { toast } from 'sonner'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

const KEYWORD_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'your',
  'you',
  'are',
  'was',
  'were',
  'will',
  'should',
  'could',
  'would',
  'have',
  'has',
  'had',
  'can',
  'cant',
  'cannot',
  'not',
  'but',
  'its',
  "it's",
  'into',
  'about',
  'over',
  'under',
  'between',
  'then',
  'than',
  'also',
  'just',
  'them',
  'they',
  'their',
  'there',
  'here',
  'when',
  'where',
  'what',
  'which',
  'who',
  'whom',
  'why',
  'how',
  'been',
  'being',
  'did',
  'does',
  'doing',
  'done',
  'use',
  'using',
  'used',
  'like',
  'some',
  'more',
  'less',
  'very',
  'much',
  'few',
  'many',
  'most',
  'each',
  'per',
  'all',
  'any',
  'none',
  'one',
  'two',
  'three',
  'four',
  'five',
])

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return null
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours % 24 > 0) parts.push(`${hours % 24}h`)
  if (minutes % 60 > 0 && parts.length < 2) parts.push(`${minutes % 60}m`)
  if (!parts.length) parts.push('0m')
  return parts.slice(0, 2).join(' ')
}

function extractTopKeywords(text: string, limit = 6) {
  if (!text) return []
  const counts = new Map<string, number>()
  text
    .split(/[^a-zA-Z0-9_]+/)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length >= 3 && !KEYWORD_STOPWORDS.has(token) && !/^\d+$/.test(token))
    .forEach((token) => {
      counts.set(token, (counts.get(token) || 0) + 1)
    })

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token]) => token)
}

interface ConversationViewerProps {
  session: Session | null
  events: NormalizedEvent[]
  searchQuery?: string
  isGlobalSearch?: boolean
  favorites?: FavoriteRatings
  notes?: MessageNotes
  highlights?: MessageHighlights
  todos?: MessageTodos
  onSetFavorite?: (payload: {
    id: string
    rating: 'up' | 'down' | null
    snapshot?: unknown
  }) => void
  onSetNote?: (payload: { id: string; text: string; snapshot?: unknown }) => void
  onSetHighlight?: (payload: { id: string; enabled: boolean; snapshot?: unknown }) => void
  onSetTodo?: (payload: { id: string; enabled: boolean; snapshot?: unknown }) => void
}

function exportConversationAsMarkdown(session: Session, events: NormalizedEvent[]): string {
  let markdown = `# ${session.title}\n\n`
  markdown += `**Session:** ${session.sessionId}\n`
  markdown += `**Started:** ${session.firstSeen.toLocaleString()}\n`
  if (session.cwd) {
    markdown += `**Working Directory:** ${session.cwd}\n`
  }
  markdown += `\n---\n\n`

  events.forEach((event) => {
    if (event.kind === 'user') {
      markdown += `## User\n\n${event.text}\n\n`
    } else if (event.kind === 'assistant') {
      markdown += `## Assistant\n\n`

      event.blocks.forEach((block) => {
        if (block.type === 'text' && block.text) {
          markdown += `${block.text}\n\n`
        }
      })
    }
    markdown += `---\n\n`
  })

  return markdown
}

function exportConversationAsJson(session: Session, events: NormalizedEvent[]): string {
  const payload = {
    sessionId: session.sessionId,
    title: session.title,
    cwd: session.cwd,
    started: session.firstSeen.toISOString(),
    ended: session.lastSeen.toISOString(),
    messages: events
      .map((event) => {
        if (event.kind === 'user') {
          return {
            role: 'user',
            at: event.at ? event.at.toISOString() : undefined,
            text: event.text,
            metadataText: event.metadataText,
            isMetadataOnly: event.isMetadataOnly,
            sessionId: event.sessionId,
            cwd: event.cwd,
          }
        }
        if (event.kind === 'assistant') {
          return {
            role: 'assistant',
            at: event.at ? event.at.toISOString() : undefined,
            blocks: event.blocks,
            model: event.model,
            usage: event.usage,
            sessionId: event.sessionId,
          }
        }
        return null
      })
      .filter(Boolean),
  }

  return JSON.stringify(payload, null, 2)
}

function exportConversationMetadata(session: Session, events: NormalizedEvent[]): string {
  const payload = {
    sessionId: session.sessionId,
    title: session.title,
    cwd: session.cwd,
    started: session.firstSeen.toISOString(),
    ended: session.lastSeen.toISOString(),
    messageCount: session.messageCount,
    filePaths: session.filePaths,
    exportedAt: new Date().toISOString(),
    exportedMessageCount: events.length,
  }

  return JSON.stringify(payload, null, 2)
}

function exportSearchResultsAsMarkdown(events: NormalizedEvent[], query: string): string {
  let markdown = `# Search Results for "${query}"\n\n`
  markdown += `**Total Results:** ${events.length}\n`
  markdown += `\n---\n\n`

  events.forEach((event) => {
    const sessionId = 'sessionId' in event ? event.sessionId : undefined
    if (sessionId) {
      markdown += `**Session:** \`${sessionId}\`\n`
    }
    if (event.at) {
      markdown += `**Time:** ${event.at.toLocaleString()}\n`
    }
    if (sessionId || event.at) {
      markdown += `\n`
    }
    if (event.kind === 'user') {
      markdown += `## User\n\n${event.text}\n\n`
    } else if (event.kind === 'assistant') {
      markdown += `## Assistant\n\n`
      event.blocks.forEach((block) => {
        if (block.type === 'text' && block.text) {
          markdown += `${block.text}\n\n`
        }
      })
    }
    markdown += `---\n\n`
  })

  return markdown
}

function exportSearchResultsAsJson(events: NormalizedEvent[], query: string): string {
  const payload = {
    query,
    results: events
      .map((event) => {
        if (event.kind === 'user') {
          return {
            role: 'user',
            at: event.at ? event.at.toISOString() : undefined,
            text: event.text,
            metadataText: event.metadataText,
            isMetadataOnly: event.isMetadataOnly,
            sessionId: event.sessionId,
          }
        }
        if (event.kind === 'assistant') {
          return {
            role: 'assistant',
            at: event.at ? event.at.toISOString() : undefined,
            blocks: event.blocks,
            model: event.model,
            sessionId: event.sessionId,
          }
        }
        return null
      })
      .filter(Boolean),
  }

  return JSON.stringify(payload, null, 2)
}

function sanitizeFilename(name: string, fallback = 'conversation') {
  const cleaned = name
    .replace(/[\\/:"*?<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || fallback
}

export default function ConversationViewer({
  session,
  events,
  searchQuery,
  isGlobalSearch = false,
  favorites,
  notes,
  highlights,
  todos,
  onSetFavorite,
  onSetNote,
  onSetHighlight,
  onSetTodo,
}: ConversationViewerProps) {
  const [showMetadata, setShowMetadata] = useState(false)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [activeIndex, setActiveIndex] = useState<number>(-1)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [foldingEnabled, setFoldingEnabled] = useState(true)
  const [showHelp, setShowHelp] = useState(false)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [notesOnly, setNotesOnly] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const countBufferRef = useRef('')
  const countTimerRef = useRef<number | null>(null)
  const gPendingRef = useRef(false)
  const gTimerRef = useRef<number | null>(null)
  const zPendingRef = useRef(false)
  const zTimerRef = useRef<number | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const visibleEvents = useMemo(() => {
    let next = events
    if (!showMetadata) {
      next = next.filter((event) => !(event.kind === 'user' && event.isMetadataOnly))
    }
    if (favoritesOnly && favorites) {
      next = next.filter((event) => event.id && favorites[event.id]?.rating === 'up')
    }
    if (notesOnly && notes) {
      next = next.filter((event) => event.id && notes[event.id]?.text?.trim())
    }
    return next
  }, [events, favorites, favoritesOnly, notes, notesOnly, showMetadata])

  const orderedEvents = useMemo(() => {
    if (isGlobalSearch) return visibleEvents
    if (sortOrder === 'asc') return visibleEvents
    return [...visibleEvents].reverse()
  }, [visibleEvents, isGlobalSearch, sortOrder])

  const messageIds = useMemo(() => {
    return orderedEvents.map((event, index) => {
      if (event.id) return event.id
      if (event.uuid) return event.uuid
      const ts = event.at ? event.at.getTime() : 'na'
      const sessionId = 'sessionId' in event ? event.sessionId : undefined
      return `${sessionId || 'session'}-${ts}-${index}`
    })
  }, [orderedEvents])

  const getViewport = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return null
    const viewport =
      container.querySelector('[data-slot="scroll-area-viewport"]') ||
      container.querySelector('[data-radix-scroll-area-viewport]')
    return viewport || (container as HTMLElement)
  }, [])

  const getScrollContainer = useCallback(() => {
    const viewport = getViewport()
    if (viewport && viewport.scrollHeight > viewport.clientHeight + 1) {
      return viewport
    }

    let el = scrollContainerRef.current?.parentElement || null
    while (el && el !== document.body) {
      const style = window.getComputedStyle(el)
      if (
        (style.overflowY === 'auto' ||
          style.overflowY === 'scroll' ||
          style.overflowY === 'overlay') &&
        el.scrollHeight > el.clientHeight + 1
      ) {
        return el
      }
      el = el.parentElement
    }

    return (document.scrollingElement as HTMLElement | null) || viewport
  }, [getViewport])

  const scrollToIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= orderedEvents.length) return
      const id = messageIds[index]
      const target = scrollContainerRef.current?.querySelector(
        `[data-message-id="${id}"]`,
      ) as HTMLElement | null
      if (target) {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
      setActiveIndex(index)
    },
    [messageIds, orderedEvents.length],
  )

  const getMessageText = useCallback((event: NormalizedEvent): string => {
    if (event.kind === 'user') return event.text || ''
    if (event.kind === 'assistant') {
      return event.blocks
        .filter((block) => block.type === 'text' && block.text)
        .map((block) => block.text)
        .join('\n\n')
    }
    return ''
  }, [])

  const summary = useMemo(() => {
    if (!session || isGlobalSearch) return null
    const summaryEvents = events.filter((event) => {
      if (event.kind !== 'user' && event.kind !== 'assistant') return false
      if (event.kind === 'user' && event.isMetadataOnly) return false
      return true
    })

    const firstUser = summaryEvents.find(
      (event) => event.kind === 'user' && event.text && event.text.trim(),
    )
    const lastAssistant = [...summaryEvents]
      .reverse()
      .find((event) => event.kind === 'assistant' && getMessageText(event).trim())

    const firstAt = summaryEvents.find((event) => event.at)?.at || session.firstSeen
    const lastAt = [...summaryEvents].reverse().find((event) => event.at)?.at || session.lastSeen
    const span = firstAt && lastAt ? formatDuration(lastAt.getTime() - firstAt.getTime()) : null

    const combinedText = summaryEvents
      .map((event) => getMessageText(event))
      .filter(Boolean)
      .join('\n')
    const keywords = extractTopKeywords(combinedText)

    return {
      firstUserText: firstUser?.text?.trim() || '',
      lastAssistantText: lastAssistant ? getMessageText(lastAssistant).trim() : '',
      messageCount: summaryEvents.length,
      span,
      keywords,
    }
  }, [events, getMessageText, isGlobalSearch, session])

  const toggleCollapse = useCallback(
    (id: string) => {
      setCollapsedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
        return next
      })
    },
    [setCollapsedIds],
  )

  const collapseCurrent = useCallback(
    (id: string) => {
      setCollapsedIds((prev) => {
        const next = new Set(prev)
        next.add(id)
        return next
      })
    },
    [setCollapsedIds],
  )

  const expandCurrent = useCallback(
    (id: string) => {
      setCollapsedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    },
    [setCollapsedIds],
  )

  const collapseAll = useCallback(() => {
    setCollapsedIds(new Set(messageIds))
  }, [messageIds])

  const expandAll = useCallback(() => {
    setCollapsedIds(new Set())
  }, [])

  const handleCopyAsMarkdown = useCallback(async () => {
    const markdown =
      isGlobalSearch && searchQuery
        ? exportSearchResultsAsMarkdown(orderedEvents, searchQuery)
        : session
          ? exportConversationAsMarkdown(session, orderedEvents)
          : ''

    if (!markdown) return

    try {
      await navigator.clipboard.writeText(markdown)
      toast.success('Copied as Markdown')
    } catch (error) {
      toast.error('Failed to copy')
    }
  }, [isGlobalSearch, orderedEvents, searchQuery, session])

  const handleCopyMessage = useCallback(
    async (event: NormalizedEvent) => {
      const text = getMessageText(event)
      if (!text) return
      try {
        await navigator.clipboard.writeText(text)
        toast.success('Copied message')
      } catch (error) {
        toast.error('Failed to copy message')
      }
    },
    [getMessageText],
  )

  const handleExportMarkdown = useCallback(async () => {
    if (typeof window === 'undefined' || !(window as any).electron) return
    const baseName = isGlobalSearch
      ? sanitizeFilename(`search-${searchQuery || 'results'}`, 'search-results')
      : sanitizeFilename(session?.title || 'conversation')
    const content =
      isGlobalSearch && searchQuery
        ? exportSearchResultsAsMarkdown(orderedEvents, searchQuery)
        : session
          ? exportConversationAsMarkdown(session, orderedEvents)
          : ''
    if (!content) return

    const result = await (window as any).electron.saveMarkdown({ filename: baseName, content })
    if (result?.success) {
      toast.success('Saved Markdown')
    } else if (!result?.canceled) {
      toast.error(result?.error || 'Failed to save Markdown')
    }
  }, [isGlobalSearch, orderedEvents, searchQuery, session])

  const handleExportJson = useCallback(async () => {
    if (typeof window === 'undefined' || !(window as any).electron) return
    const baseName = isGlobalSearch
      ? sanitizeFilename(`search-${searchQuery || 'results'}`, 'search-results')
      : sanitizeFilename(session?.title || 'conversation')
    const content =
      isGlobalSearch && searchQuery
        ? exportSearchResultsAsJson(orderedEvents, searchQuery)
        : session
          ? exportConversationAsJson(session, orderedEvents)
          : ''
    if (!content) return

    const result = await (window as any).electron.saveJson({ filename: baseName, content })
    if (result?.success) {
      toast.success('Saved JSON')
    } else if (!result?.canceled) {
      toast.error(result?.error || 'Failed to save JSON')
    }
  }, [isGlobalSearch, orderedEvents, searchQuery, session])

  const handleExportZip = useCallback(async () => {
    if (typeof window === 'undefined' || !(window as any).electron) return
    if (!session || isGlobalSearch) return
    const baseName = sanitizeFilename(session?.title || 'conversation')
    const markdown = exportConversationAsMarkdown(session, orderedEvents)
    const json = exportConversationAsJson(session, orderedEvents)
    const metadata = exportConversationMetadata(session, orderedEvents)
    if (!markdown || !json) return

    const result = await (window as any).electron.saveZip({
      filename: baseName,
      files: [
        { name: `${baseName}.md`, content: markdown },
        { name: `${baseName}.json`, content: json },
        { name: `${baseName}.metadata.json`, content: metadata },
      ],
    })
    if (result?.success) {
      toast.success('Saved ZIP bundle')
    } else if (!result?.canceled) {
      toast.error(result?.error || 'Failed to save ZIP bundle')
    }
  }, [isGlobalSearch, orderedEvents, session])

  const handleShareConversation = useCallback(async () => {
    if (typeof window === 'undefined' || !(window as any).electron) return
    const baseName = isGlobalSearch
      ? sanitizeFilename(`search-${searchQuery || 'results'}`, 'search-results')
      : sanitizeFilename(session?.title || 'conversation')
    const content =
      isGlobalSearch && searchQuery
        ? exportSearchResultsAsMarkdown(orderedEvents, searchQuery)
        : session
          ? exportConversationAsMarkdown(session, orderedEvents)
          : ''
    if (!content) return

    const result = await (window as any).electron.shareFile({
      filename: baseName,
      extension: 'md',
      content,
    })
    if (result?.success) {
      return
    } else {
      toast.error(result?.error || 'Share failed')
    }
  }, [isGlobalSearch, orderedEvents, searchQuery, session])

  const hasMetadata = events.some((event) => event.kind === 'user' && event.metadataText)

  useEffect(() => {
    if (!session || isGlobalSearch) {
      setActiveIndex(orderedEvents.length > 0 ? 0 : -1)
      return
    }
    if (typeof window === 'undefined') return
    const key = `active-message:${session.sessionId}`
    const storedId = window.localStorage.getItem(key)
    if (!storedId) {
      setActiveIndex(orderedEvents.length > 0 ? 0 : -1)
      return
    }
    const index = messageIds.findIndex((id) => id === storedId)
    if (index >= 0) {
      setActiveIndex(index)
    } else {
      setActiveIndex(orderedEvents.length > 0 ? 0 : -1)
    }
  }, [isGlobalSearch, messageIds, orderedEvents.length, session])

  useEffect(() => {
    const key = `collapsed:${isGlobalSearch ? 'search' : session?.sessionId || 'none'}`
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as string[]
        setCollapsedIds(new Set(parsed))
      } catch {
        setCollapsedIds(new Set())
      }
    } else {
      setCollapsedIds(new Set())
    }
  }, [isGlobalSearch, session?.sessionId])

  useEffect(() => {
    const key = `collapsed:${isGlobalSearch ? 'search' : session?.sessionId || 'none'}`
    if (typeof window === 'undefined') return
    window.localStorage.setItem(key, JSON.stringify(Array.from(collapsedIds)))
  }, [collapsedIds, isGlobalSearch, session?.sessionId])

  useEffect(() => {
    if (typeof window === 'undefined' || !session || isGlobalSearch) return
    const key = `sort-order:${session.sessionId}`
    const stored = window.localStorage.getItem(key)
    if (stored === 'asc' || stored === 'desc') {
      setSortOrder(stored)
    }
  }, [isGlobalSearch, session?.sessionId])

  useEffect(() => {
    if (typeof window === 'undefined' || !session || isGlobalSearch) return
    const key = `sort-order:${session.sessionId}`
    window.localStorage.setItem(key, sortOrder)
  }, [isGlobalSearch, session, sortOrder])

  useEffect(() => {
    if (typeof window === 'undefined' || !session || isGlobalSearch) return
    if (activeIndex < 0) return
    const id = messageIds[activeIndex]
    if (!id) return
    const key = `active-message:${session.sessionId}`
    window.localStorage.setItem(key, id)
  }, [activeIndex, isGlobalSearch, messageIds, session])

  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).electron?.onMenuAction) return
    const unsubscribe = (window as any).electron.onMenuAction((payload: { action: string }) => {
      if (payload.action === 'export-markdown') {
        handleExportMarkdown()
      } else if (payload.action === 'export-json') {
        handleExportJson()
      } else if (payload.action === 'export-zip') {
        handleExportZip()
      } else if (payload.action === 'share-markdown') {
        handleShareConversation()
      }
    })
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [handleExportJson, handleExportMarkdown, handleExportZip, handleShareConversation])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      const isEditable =
        Boolean(target) && (tag === 'input' || tag === 'textarea' || target.isContentEditable)
      if (
        event.key === 'Shift' ||
        event.key === 'Control' ||
        event.key === 'Alt' ||
        event.key === 'Meta'
      ) {
        return
      }

      const key = event.key
      if (key === '?' || (key === '/' && event.shiftKey)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (isEditable) {
          target?.blur()
        }
        setShowHelp((value) => !value)
        return
      }
      if (isEditable) {
        const lowerKey = key.toLowerCase()
        const allow =
          key === 'Escape' ||
          (event.ctrlKey && (lowerKey === 'd' || lowerKey === 'u')) ||
          (event.ctrlKey && (lowerKey === 'n' || lowerKey === 'p'))
        if (!allow) return
        if (key === 'Escape') {
          target?.blur()
        }
      }
      if (/^\d$/.test(key)) {
        countBufferRef.current = `${countBufferRef.current}${key}`
        if (countTimerRef.current) window.clearTimeout(countTimerRef.current)
        countTimerRef.current = window.setTimeout(() => {
          countBufferRef.current = ''
        }, 1000)
        return
      }

      const count = countBufferRef.current ? Number.parseInt(countBufferRef.current, 10) : 1
      countBufferRef.current = ''
      const hasEvents = orderedEvents.length > 0
      const currentIndex = activeIndex >= 0 ? activeIndex : hasEvents ? 0 : -1
      if (activeIndex < 0 && hasEvents) {
        setActiveIndex(0)
      }

      if (key === 'g') {
        if (gPendingRef.current) {
          gPendingRef.current = false
          if (gTimerRef.current) window.clearTimeout(gTimerRef.current)
          const viewport = getScrollContainer()
          if (viewport) viewport.scrollTo({ top: 0, behavior: 'smooth' })
          if (orderedEvents.length > 0) {
            scrollToIndex(0)
          }
          return
        }
        gPendingRef.current = true
        if (gTimerRef.current) window.clearTimeout(gTimerRef.current)
        gTimerRef.current = window.setTimeout(() => {
          gPendingRef.current = false
        }, 500)
        return
      }

      if (key === 'z' || key === 'Z') {
        zPendingRef.current = true
        if (zTimerRef.current) window.clearTimeout(zTimerRef.current)
        zTimerRef.current = window.setTimeout(() => {
          zPendingRef.current = false
        }, 600)
        return
      }

      if (zPendingRef.current) {
        zPendingRef.current = false
        if (zTimerRef.current) window.clearTimeout(zTimerRef.current)

        if (key === 'c' || key === 'C') {
          if (currentIndex >= 0) {
            collapseCurrent(messageIds[currentIndex])
          }
          return
        }

        if (key === 'o' || key === 'O') {
          if (currentIndex >= 0) {
            expandCurrent(messageIds[currentIndex])
          }
          return
        }

        if (key === 'a') {
          if (currentIndex >= 0) {
            toggleCollapse(messageIds[currentIndex])
          }
          return
        }

        if (key === 'A') {
          if (collapsedIds.size === orderedEvents.length) {
            expandAll()
          } else {
            collapseAll()
          }
          return
        }

        if (key === 'M') {
          collapseAll()
          return
        }

        if (key === 'R') {
          expandAll()
          return
        }

        if (key === 'i') {
          setFoldingEnabled((value) => !value)
          return
        }

        if (key === 'j') {
          scrollToIndex(
            Math.min((currentIndex >= 0 ? currentIndex : 0) + count, orderedEvents.length - 1),
          )
          return
        }
        if (key === 'k') {
          scrollToIndex(Math.max((currentIndex >= 0 ? currentIndex : 0) - count, 0))
          return
        }
      }

      if (key === 'G') {
        const viewport = getScrollContainer()
        if (viewport) viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' })
        if (orderedEvents.length > 0) {
          scrollToIndex(orderedEvents.length - 1)
        }
        return
      }

      if (key === 'j') {
        event.preventDefault()
        scrollToIndex(
          Math.min((currentIndex >= 0 ? currentIndex : 0) + count, orderedEvents.length - 1),
        )
        return
      }
      if (key === 'k') {
        event.preventDefault()
        scrollToIndex(Math.max((currentIndex >= 0 ? currentIndex : 0) - count, 0))
        return
      }

      if (key.toLowerCase() === 'y' && !event.shiftKey) {
        event.preventDefault()
        if (currentIndex >= 0) {
          handleCopyMessage(orderedEvents[currentIndex])
        }
        return
      }

      if (key.toLowerCase() === 'y' && event.shiftKey) {
        handleCopyAsMarkdown()
        return
      }

      if (
        key === ' ' ||
        key === 'Spacebar' ||
        key === 'Space' ||
        (key === 'PageDown' && !event.shiftKey)
      ) {
        event.preventDefault()
        const viewport = getScrollContainer()
        if (viewport) viewport.scrollBy({ top: viewport.clientHeight * 0.8, behavior: 'smooth' })
        return
      }

      if (event.ctrlKey && key.toLowerCase() === 'd') {
        event.preventDefault()
        const viewport = getScrollContainer()
        if (viewport) viewport.scrollBy({ top: viewport.clientHeight * 0.5, behavior: 'smooth' })
        return
      }
      if (event.ctrlKey && key.toLowerCase() === 'u') {
        event.preventDefault()
        const viewport = getScrollContainer()
        if (viewport) viewport.scrollBy({ top: -viewport.clientHeight * 0.5, behavior: 'smooth' })
      }
    }

    document.addEventListener('keydown', handler, { capture: true })
    return () => document.removeEventListener('keydown', handler, { capture: true })
  }, [
    activeIndex,
    getScrollContainer,
    handleCopyAsMarkdown,
    handleCopyMessage,
    collapsedIds.size,
    messageIds,
    orderedEvents,
    scrollToIndex,
    toggleCollapse,
    collapseCurrent,
    expandCurrent,
    collapseAll,
    expandAll,
    showHelp,
  ])

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex-1 min-w-0">
          {isGlobalSearch ? (
            <>
              <h2 className="text-lg font-semibold text-foreground">Search Results</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {orderedEvents.length} {orderedEvents.length === 1 ? 'result' : 'results'} found for
                "{searchQuery}"
              </p>
            </>
          ) : session ? (
            <>
              <h2 className="text-lg font-semibold text-foreground truncate">{session.title}</h2>
              <div className="flex items-center gap-4 mt-1">
                <p className="text-sm text-muted-foreground truncate">
                  {session.cwd || 'No working directory'}
                </p>
                <span className="text-xs text-muted-foreground">
                  {session.messageCount} {session.messageCount === 1 ? 'message' : 'messages'}
                </span>
              </div>
            </>
          ) : null}
        </div>
        <div className="flex gap-2 ml-4 shrink-0">
          <Sheet open={actionsOpen} onOpenChange={setActionsOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="bg-transparent">
                <Menu className="w-4 h-4 mr-2" />
                Actions
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80">
              <SheetHeader>
                <SheetTitle>Conversation Actions</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-4 flex flex-col gap-2">
                <Dialog open={showHelp} onOpenChange={setShowHelp}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-transparent w-full justify-start"
                      onClick={() => setActionsOpen(false)}
                    >
                      <HelpCircle className="w-4 h-4 mr-2" />
                      Shortcuts
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Keyboard Shortcuts</DialogTitle>
                      <DialogDescription>Use ? to toggle this help overlay.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 text-sm">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="font-medium text-foreground">Navigation</div>
                        <div className="text-muted-foreground">
                          j/k, 5j/5k, gg/G, Ctrl+d/u, Space
                        </div>
                        <div className="font-medium text-foreground">Sessions</div>
                        <div className="text-muted-foreground">J/K or Ctrl+n/p</div>
                        <div className="font-medium text-foreground">Search</div>
                        <div className="text-muted-foreground">/ focus, Esc clear</div>
                        <div className="font-medium text-foreground">Clipboard</div>
                        <div className="text-muted-foreground">y message, Y conversation</div>
                      </div>
                      <div>
                        <div className="font-medium text-foreground">Folding</div>
                        <div className="text-muted-foreground mt-1">
                          zc (close), zo (open), za (toggle), zi (enable/disable)
                          <br />
                          zC/zO/zA (recursive), zM (close all), zR (open all)
                          <br />
                          zj/zk (next/prev message)
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                {!isGlobalSearch && (
                  <Button
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    variant="outline"
                    size="sm"
                    className="bg-transparent w-full justify-start"
                  >
                    {sortOrder === 'asc' ? (
                      <ArrowDownAZ className="w-4 h-4 mr-2" />
                    ) : (
                      <ArrowUpAZ className="w-4 h-4 mr-2" />
                    )}
                    {sortOrder === 'asc' ? 'Oldest First' : 'Newest First'}
                  </Button>
                )}
                {favorites && (
                  <Button
                    onClick={() => setFavoritesOnly((value) => !value)}
                    variant={favoritesOnly ? 'secondary' : 'outline'}
                    size="sm"
                    className="bg-transparent w-full justify-start"
                  >
                    <Star className="w-4 h-4 mr-2" />
                    Favorites Only
                  </Button>
                )}
                {notes && (
                  <Button
                    onClick={() => setNotesOnly((value) => !value)}
                    variant={notesOnly ? 'secondary' : 'outline'}
                    size="sm"
                    className="bg-transparent w-full justify-start"
                  >
                    <StickyNote className="w-4 h-4 mr-2" />
                    Notes Only
                  </Button>
                )}
                {orderedEvents.length > 0 && (
                  <Button
                    onClick={collapsedIds.size === orderedEvents.length ? expandAll : collapseAll}
                    variant="outline"
                    size="sm"
                    className="bg-transparent w-full justify-start"
                  >
                    {collapsedIds.size === orderedEvents.length ? (
                      <>
                        <ChevronDown className="w-4 h-4 mr-2" />
                        Expand all
                      </>
                    ) : (
                      <>
                        <ChevronUp className="w-4 h-4 mr-2" />
                        Collapse all
                      </>
                    )}
                  </Button>
                )}
                {hasMetadata && (
                  <Button
                    onClick={() => setShowMetadata(!showMetadata)}
                    variant="outline"
                    size="sm"
                    className="bg-transparent w-full justify-start"
                  >
                    {showMetadata ? (
                      <EyeOff className="w-4 h-4 mr-2" />
                    ) : (
                      <Eye className="w-4 h-4 mr-2" />
                    )}
                    {showMetadata ? 'Hide' : 'Show'} Metadata
                  </Button>
                )}
                <Button
                  onClick={() => {
                    setActionsOpen(false)
                    handleShareConversation()
                  }}
                  variant="outline"
                  size="sm"
                  className="bg-transparent w-full justify-start"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </Button>
                <Button
                  onClick={() => {
                    setActionsOpen(false)
                    handleExportJson()
                  }}
                  variant="outline"
                  size="sm"
                  className="bg-transparent w-full justify-start"
                >
                  <FileCode className="w-4 h-4 mr-2" />
                  Export JSON
                </Button>
                {!isGlobalSearch && (
                  <Button
                    onClick={() => {
                      setActionsOpen(false)
                      handleExportZip()
                    }}
                    variant="outline"
                    size="sm"
                    className="bg-transparent w-full justify-start"
                  >
                    <FileArchive className="w-4 h-4 mr-2" />
                    Export ZIP bundle
                  </Button>
                )}
                <Button
                  onClick={() => {
                    setActionsOpen(false)
                    handleCopyAsMarkdown()
                  }}
                  variant="outline"
                  size="sm"
                  className="bg-transparent w-full justify-start"
                >
                  <FileDown className="w-4 h-4 mr-2" />
                  Copy as Markdown
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <div ref={scrollContainerRef} className="flex-1">
        <ScrollArea className="h-full">
          <div className="p-6 space-y-6 max-w-5xl">
            {summary && (
              <div className="rounded-xl border border-border bg-card/40 p-4 shadow-sm">
                <div className="text-sm font-semibold text-foreground">Session summary</div>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">First user prompt</div>
                    <p className="mt-1 text-sm text-foreground line-clamp-3">
                      {summary.firstUserText || 'No user prompt found.'}
                    </p>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">
                      Last assistant message
                    </div>
                    <p className="mt-1 text-sm text-foreground line-clamp-3">
                      {summary.lastAssistantText || 'No assistant reply found.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span>{summary.messageCount} messages</span>
                    {summary.span && <span>Span: {summary.span}</span>}
                  </div>
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">Top keywords</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {summary.keywords.length ? (
                        summary.keywords.map((keyword) => (
                          <span
                            key={keyword}
                            className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                          >
                            {keyword}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">No keywords</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {orderedEvents.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">
                {isGlobalSearch ? 'No results found' : 'No conversation events found'}
              </div>
            ) : (
              orderedEvents.map((event, index) => {
                const id = messageIds[index]
                const collapsed = foldingEnabled && collapsedIds.has(id)
                const rating = favorites && event.id ? favorites[event.id]?.rating : undefined
                const noteText = notes && event.id ? notes[event.id]?.text : undefined
                const isHighlighted =
                  highlights && event.id ? highlights[event.id]?.enabled : undefined
                const isTodo = todos && event.id ? todos[event.id]?.enabled : undefined
                return (
                  <div key={id} data-message-id={id}>
                    <MessageBubble
                      event={event}
                      showMetadata={showMetadata}
                      collapsed={collapsed}
                      isActive={index === activeIndex}
                      note={noteText}
                      highlighted={Boolean(isHighlighted)}
                      todo={Boolean(isTodo)}
                      onToggleCollapse={() => toggleCollapse(id)}
                      onActivate={() => setActiveIndex(index)}
                      favoriteRating={rating}
                      onSetFavorite={(nextRating) => {
                        if (!onSetFavorite || !event.id) return
                        let snapshot: unknown
                        if (event.kind === 'user') {
                          snapshot = {
                            role: 'user',
                            text: event.text,
                            at: event.at ? event.at.toISOString() : undefined,
                            sessionId: event.sessionId,
                            cwd: event.cwd,
                          }
                        } else if (event.kind === 'assistant') {
                          snapshot = {
                            role: 'assistant',
                            blocks: event.blocks,
                            at: event.at ? event.at.toISOString() : undefined,
                            sessionId: event.sessionId,
                            model: event.model,
                          }
                        } else {
                          return
                        }
                        onSetFavorite({ id: event.id, rating: nextRating, snapshot })
                      }}
                      onSetTodo={(enabled) => {
                        if (!onSetTodo || !event.id) return
                        let snapshot: unknown
                        if (event.kind === 'user') {
                          snapshot = {
                            role: 'user',
                            text: event.text,
                            at: event.at ? event.at.toISOString() : undefined,
                            sessionId: event.sessionId,
                            cwd: event.cwd,
                          }
                        } else if (event.kind === 'assistant') {
                          snapshot = {
                            role: 'assistant',
                            blocks: event.blocks,
                            at: event.at ? event.at.toISOString() : undefined,
                            sessionId: event.sessionId,
                            model: event.model,
                          }
                        } else {
                          return
                        }
                        onSetTodo({ id: event.id, enabled, snapshot })
                      }}
                      onSetNote={(text) => {
                        if (!onSetNote || !event.id) return
                        let snapshot: unknown
                        if (event.kind === 'user') {
                          snapshot = {
                            role: 'user',
                            text: event.text,
                            at: event.at ? event.at.toISOString() : undefined,
                            sessionId: event.sessionId,
                            cwd: event.cwd,
                          }
                        } else if (event.kind === 'assistant') {
                          snapshot = {
                            role: 'assistant',
                            blocks: event.blocks,
                            at: event.at ? event.at.toISOString() : undefined,
                            sessionId: event.sessionId,
                            model: event.model,
                          }
                        } else {
                          return
                        }
                        onSetNote({ id: event.id, text, snapshot })
                      }}
                      onSetHighlight={(enabled) => {
                        if (!onSetHighlight || !event.id) return
                        let snapshot: unknown
                        if (event.kind === 'user') {
                          snapshot = {
                            role: 'user',
                            text: event.text,
                            at: event.at ? event.at.toISOString() : undefined,
                            sessionId: event.sessionId,
                            cwd: event.cwd,
                          }
                        } else if (event.kind === 'assistant') {
                          snapshot = {
                            role: 'assistant',
                            blocks: event.blocks,
                            at: event.at ? event.at.toISOString() : undefined,
                            sessionId: event.sessionId,
                            model: event.model,
                          }
                        } else {
                          return
                        }
                        onSetHighlight({ id: event.id, enabled, snapshot })
                      }}
                    />
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
