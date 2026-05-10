'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import type {
  Session,
  NormalizedEvent,
  FavoriteRatings,
  MessageNotes,
  MessageHighlights,
  MessageTodos,
  SessionBookmarks,
} from '@/lib/types'
import SessionList from '@/components/session-list'
import SessionDashboard from '@/components/session-dashboard'
import ConversationViewer from '@/components/conversation-viewer'
import SearchPanel from '@/components/search-panel'
import { Button } from '@/components/ui/button'
import {
  RefreshCw,
  Star,
  CheckSquare,
  LayoutGrid,
  LayoutList,
  Database,
  FileDown,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'

export default function Home() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<NormalizedEvent[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [clearSignal, setClearSignal] = useState(0)
  const [favorites, setFavorites] = useState<FavoriteRatings>({})
  const [notes, setNotes] = useState<MessageNotes>({})
  const [highlights, setHighlights] = useState<MessageHighlights>({})
  const [todos, setTodos] = useState<MessageTodos>({})
  const [bookmarks, setBookmarks] = useState<SessionBookmarks>({})
  const [showFavoritesView, setShowFavoritesView] = useState(false)
  const [showTodosView, setShowTodosView] = useState(false)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const selectedSessionIdRef = useRef<string | null>(null)
  const sessionPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fullHistorySessionIdsRef = useRef<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [dataSource, setDataSource] = useState<'codex' | 'openai'>('codex')
  const [openAIPath, setOpenAIPath] = useState<string | null>(null)
  const [monthFilter, setMonthFilter] = useState<string>('all')
  const dataSourceRef = useRef<'codex' | 'openai'>('codex')
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set())
  const [isHydratingAllSessions, setIsHydratingAllSessions] = useState(false)

  useEffect(() => {
    selectedSessionIdRef.current = selectedSession?.sessionId ?? null
  }, [selectedSession])

  useEffect(() => {
    dataSourceRef.current = dataSource
  }, [dataSource])

  const stopWatching = useCallback(async () => {
    if (typeof window === 'undefined' || !(window as any).electron) return
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }
    await (window as any).electron.stopWatching()
    if (sessionPollRef.current) {
      clearInterval(sessionPollRef.current)
      sessionPollRef.current = null
    }
  }, [])

  useEffect(() => {
    loadFavorites()
    return () => {
      stopWatching()
    }
  }, [])

  const normalizeSession = useCallback((s: any): Session => {
    return {
      ...s,
      firstSeen: s.firstSeen ? new Date(s.firstSeen) : new Date(),
      lastSeen: s.lastSeen ? new Date(s.lastSeen) : new Date(),
      hydrated: s.hydrated ?? true,
      summaryReady: s.summaryReady ?? true,
      events: (s.events || []).map((event: any) => ({
        ...event,
        at: event.at ? new Date(event.at) : undefined,
      })),
    }
  }, [])

  const mergeSession = useCallback((incoming: Session, existing?: Session | null): Session => {
    if (!existing || existing.sessionId !== incoming.sessionId) {
      return incoming
    }

    if (incoming.hydrated || !existing.hydrated) {
      return incoming
    }

    return {
      ...incoming,
      events: existing.events,
      hydrated: existing.hydrated,
      summaryReady: existing.summaryReady ?? incoming.summaryReady,
      truncated: existing.truncated ?? incoming.truncated,
      messageCount: incoming.messageCount > 0 ? incoming.messageCount : existing.messageCount,
    }
  }, [])

  async function loadSessions(options?: { silent?: boolean }) {
    if (typeof window === 'undefined' || !(window as any).electron) {
      setIsLoading(false)
      return
    }

    if (!options?.silent) {
      setIsLoading(true)
    }
    const result = await (window as any).electron.readSessions()

    if (result.success) {
      const parsedSessions: Session[] = result.sessions.map((s: any) => normalizeSession(s))

      parsedSessions.sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
      setSessions((prev) => {
        const previousSessions = new Map(prev.map((session) => [session.sessionId, session]))
        return parsedSessions.map((session) => mergeSession(session, previousSessions.get(session.sessionId)))
      })

      const storedSelectedId =
        typeof window !== 'undefined' ? window.localStorage.getItem('selected-session-id') : null
      const currentSelectedId = selectedSessionIdRef.current || storedSelectedId
      if (currentSelectedId) {
        const refreshed = parsedSessions.find((s) => s.sessionId === currentSelectedId)
        if (refreshed) {
          setSelectedSession((current) => mergeSession(refreshed, current))
        }
      }
    }

    if (!options?.silent) {
      setIsLoading(false)
    }
  }

  async function startWatching() {
    if (typeof window === 'undefined' || !(window as any).electron) return

    await stopWatching()
    await (window as any).electron.startWatching()
    unsubscribeRef.current = (window as any).electron.onSessionsChanged((payload: any) => {
      if (dataSourceRef.current !== 'codex') return
      if (!payload?.type) {
        loadSessions({ silent: true })
        return
      }

      if (payload.type === 'session-updated' && payload.session) {
        const updated = normalizeSession(payload.session)
        setSessions((prev) => {
          const existing = prev.find((s) => s.sessionId === updated.sessionId)
          const merged = mergeSession(updated, existing)
          const next = prev.filter((s) => s.sessionId !== updated.sessionId)
          next.push(merged)
          next.sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
          return next
        })

        if (selectedSessionIdRef.current === updated.sessionId) {
          setSelectedSession((current) => mergeSession(updated, current))
        }
        return
      }

      if (payload.type === 'session-removed' && payload.sessionId) {
        setSessions((prev) => prev.filter((s) => s.sessionId !== payload.sessionId))
        if (selectedSessionIdRef.current === payload.sessionId) {
          setSelectedSession(null)
        }
        return
      }

      loadSessions({ silent: true })
    })
  }

  const hydrateSession = useCallback(
    async (sessionId: string, options?: { fullHistory?: boolean }) => {
      if (typeof window === 'undefined' || !(window as any).electron?.readSession) return null
      const result = await (window as any).electron.readSession(sessionId, options)
      if (!result?.success || !result.session) return null
      const updated = normalizeSession(result.session)

      if (options?.fullHistory) {
        fullHistorySessionIdsRef.current.add(sessionId)
      }

      setSessions((prev) => {
        const next = prev.filter((s) => s.sessionId !== updated.sessionId)
        next.push(updated)
        next.sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
        return next
      })

      if (selectedSessionIdRef.current === updated.sessionId) {
        setSelectedSession(updated)
      }

      return updated
    },
    [normalizeSession],
  )

  const pollSelectedSession = useCallback(async () => {
    if (dataSource !== 'codex') return
    const sessionId = selectedSessionIdRef.current
    if (!sessionId) return
    await hydrateSession(sessionId, {
      fullHistory: fullHistorySessionIdsRef.current.has(sessionId),
    })
  }, [dataSource, hydrateSession])

  useEffect(() => {
    if (sessionPollRef.current) {
      clearInterval(sessionPollRef.current)
      sessionPollRef.current = null
    }

    if (!selectedSession || dataSource !== 'codex') return

    sessionPollRef.current = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      pollSelectedSession()
    }, 3000)

    return () => {
      if (sessionPollRef.current) {
        clearInterval(sessionPollRef.current)
        sessionPollRef.current = null
      }
    }
  }, [dataSource, selectedSession, pollSelectedSession])

  useEffect(() => {
    if (dataSource !== 'codex' || !selectedSession || selectedSession.hydrated) return
    void hydrateSession(selectedSession.sessionId, {
      fullHistory: fullHistorySessionIdsRef.current.has(selectedSession.sessionId),
    })
  }, [dataSource, hydrateSession, selectedSession])

  const hydrateAllSessions = useCallback(async () => {
    if (dataSource !== 'codex' || isHydratingAllSessions) return

    const pendingSessionIds = sessions
      .filter((session) => session.hydrated === false)
      .map((session) => session.sessionId)

    if (pendingSessionIds.length === 0) return

    setIsHydratingAllSessions(true)
    try {
      for (const sessionId of pendingSessionIds) {
        await hydrateSession(sessionId, { fullHistory: true })
      }
    } finally {
      setIsHydratingAllSessions(false)
    }
  }, [dataSource, hydrateSession, isHydratingAllSessions, sessions])

  async function loadFavorites() {
    if (typeof window === 'undefined' || !(window as any).electron?.getFavorites) {
      return
    }

    const result = await (window as any).electron.getFavorites()
    if (result?.success && result.favorites) {
      setFavorites(result.favorites.ratings || {})
      setNotes(result.favorites.notes || {})
      setHighlights(result.favorites.highlights || {})
      setTodos(result.favorites.todos || {})
      setBookmarks(result.favorites.bookmarks || {})
    }
  }

  const setFavorite = useCallback(
    async (payload: { id: string; rating: 'up' | 'down' | null; snapshot?: unknown }) => {
      if (typeof window === 'undefined' || !(window as any).electron?.setFavorite) return
      const result = await (window as any).electron.setFavorite(payload)
      if (result?.success && result.favorites) {
        setFavorites(result.favorites.ratings || {})
        setNotes(result.favorites.notes || {})
        setHighlights(result.favorites.highlights || {})
        setTodos(result.favorites.todos || {})
        setBookmarks(result.favorites.bookmarks || {})
      }
    },
    [],
  )

  const setNote = useCallback(async (payload: { id: string; text: string; snapshot?: unknown }) => {
    if (typeof window === 'undefined' || !(window as any).electron?.setNote) return
    const result = await (window as any).electron.setNote(payload)
    if (result?.success && result.favorites) {
      setFavorites(result.favorites.ratings || {})
      setNotes(result.favorites.notes || {})
      setHighlights(result.favorites.highlights || {})
      setTodos(result.favorites.todos || {})
      setBookmarks(result.favorites.bookmarks || {})
    }
  }, [])

  const setHighlight = useCallback(
    async (payload: { id: string; enabled: boolean; snapshot?: unknown }) => {
      if (typeof window === 'undefined' || !(window as any).electron?.setHighlight) return
      const result = await (window as any).electron.setHighlight(payload)
      if (result?.success && result.favorites) {
        setFavorites(result.favorites.ratings || {})
        setNotes(result.favorites.notes || {})
        setHighlights(result.favorites.highlights || {})
        setTodos(result.favorites.todos || {})
        setBookmarks(result.favorites.bookmarks || {})
      }
    },
    [],
  )

  const setTodo = useCallback(
    async (payload: { id: string; enabled: boolean; snapshot?: unknown }) => {
      if (typeof window === 'undefined' || !(window as any).electron?.setTodo) return
      const result = await (window as any).electron.setTodo(payload)
      if (result?.success && result.favorites) {
        setFavorites(result.favorites.ratings || {})
        setNotes(result.favorites.notes || {})
        setHighlights(result.favorites.highlights || {})
        setTodos(result.favorites.todos || {})
        setBookmarks(result.favorites.bookmarks || {})
      }
    },
    [],
  )

  const setBookmark = useCallback(async (payload: { sessionId: string; pinned: boolean }) => {
    if (typeof window === 'undefined' || !(window as any).electron?.setBookmark) return
    const result = await (window as any).electron.setBookmark(payload)
    if (result?.success && result.favorites) {
      setFavorites(result.favorites.ratings || {})
      setNotes(result.favorites.notes || {})
      setHighlights(result.favorites.highlights || {})
      setBookmarks(result.favorites.bookmarks || {})
    }
  }, [])

  const handleSearchChange = useCallback((query: string, results: NormalizedEvent[]) => {
    setSearchQuery(query)
    setSearchResults(results)
  }, [])

  const filteredSessions = useMemo(() => {
    if (monthFilter === 'all') return sessions
    return sessions.filter((session) => {
      const date = session.firstSeen || session.lastSeen
      if (!date) return false
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      return key === monthFilter
    })
  }, [monthFilter, sessions])

  const selectedSessions = useMemo(() => {
    if (selectedSessionIds.size === 0) return []
    return filteredSessions
      .filter((session) => selectedSessionIds.has(session.sessionId))
      .sort((a, b) => a.firstSeen.getTime() - b.firstSeen.getTime())
  }, [filteredSessions, selectedSessionIds])

  const favoriteEvents = useMemo(() => {
    if (!favorites || !filteredSessions.length) return []
    const ids = new Set(Object.keys(favorites).filter((id) => favorites[id]?.rating === 'up'))
    if (ids.size === 0) return []
    return filteredSessions.flatMap((session) =>
      session.events.filter((event) => event.id && ids.has(event.id)),
    )
  }, [favorites, filteredSessions])

  const todoEvents = useMemo(() => {
    if (!todos || !filteredSessions.length) return []
    const ids = new Set(Object.keys(todos).filter((id) => todos[id]?.enabled))
    if (ids.size === 0) return []
    return filteredSessions.flatMap((session) =>
      session.events.filter((event) => event.id && ids.has(event.id)),
    )
  }, [filteredSessions, todos])

  const sessionNoteSnippets = useMemo(() => {
    if (!notes || !filteredSessions.length) return {}
    const snippetMap: Record<string, string> = {}
    filteredSessions.forEach((session) => {
      const noted = session.events.find((event) => event.id && notes[event.id]?.text)
      if (noted?.id) {
        const text = notes[noted.id]?.text || ''
        snippetMap[session.sessionId] = text.length > 80 ? `${text.slice(0, 80).trim()}...` : text
      }
    })
    return snippetMap
  }, [filteredSessions, notes])

  const monthOptions = useMemo(() => {
    const map = new Map<string, string>()
    sessions.forEach((session) => {
      const date = session.firstSeen || session.lastSeen
      if (!date) return
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      if (!map.has(key)) {
        map.set(key, format(new Date(date.getFullYear(), date.getMonth(), 1), 'MMM yyyy'))
      }
    })
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [sessions])

  useEffect(() => {
    if (monthFilter === 'all') return
    const available = new Set(monthOptions.map(([key]) => key))
    if (!available.has(monthFilter)) {
      setMonthFilter('all')
    }
  }, [monthFilter, monthOptions])

  useEffect(() => {
    setSelectedSessionIds(new Set())
    setSelectionMode(false)
  }, [dataSource, monthFilter])

  useEffect(() => {
    setSelectedSessionIds((prev) => {
      if (prev.size === 0) return prev
      const next = new Set<string>()
      sessions.forEach((session) => {
        if (prev.has(session.sessionId)) next.add(session.sessionId)
      })
      return next
    })
  }, [sessions])

  const emptyMessage =
    monthFilter === 'all'
      ? dataSource === 'codex'
        ? 'No sessions found in ~/.codex/sessions.'
        : 'No conversations found in the loaded export.'
      : 'No conversations started in the selected month.'

  const dashboardTitle = dataSource === 'codex' ? 'Sessions' : 'ChatGPT Conversations'
  const dashboardSubtitle =
    dataSource === 'codex'
      ? `Browse ${filteredSessions.length} ${
          filteredSessions.length === 1 ? 'conversation' : 'conversations'
        } from your Codex history.`
      : `Browse ${filteredSessions.length} ${
          filteredSessions.length === 1 ? 'conversation' : 'conversations'
        } from your export.`

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      const isEditable =
        Boolean(target) && (tag === 'input' || tag === 'textarea' || target.isContentEditable)

      if (event.key === '/') {
        event.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
        return
      }

      if (event.key === 'Escape') {
        if (searchQuery) {
          setSearchQuery('')
          setSearchResults([])
          setClearSignal((value) => value + 1)
          if (isEditable) {
            target?.blur()
          }
          return
        }
        if (selectedSession) {
          setSelectedSession(null)
          if (isEditable) {
            target?.blur()
          }
        }
        return
      }

      if (isEditable) return

      if (event.key === 'J' || (event.ctrlKey && event.key.toLowerCase() === 'n')) {
        if (!filteredSessions.length) return
        const currentIndex = selectedSession
          ? filteredSessions.findIndex((session) => session.sessionId === selectedSession.sessionId)
          : -1
        const nextIndex = Math.min(currentIndex + 1, filteredSessions.length - 1)
        setSelectedSession(filteredSessions[nextIndex])
        return
      }

      if (event.key === 'K' || (event.ctrlKey && event.key.toLowerCase() === 'p')) {
        if (!filteredSessions.length) return
        const currentIndex = selectedSession
          ? filteredSessions.findIndex((session) => session.sessionId === selectedSession.sessionId)
          : filteredSessions.length
        const prevIndex = Math.max(currentIndex - 1, 0)
        setSelectedSession(filteredSessions[prevIndex])
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [filteredSessions, searchQuery, selectedSession])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (selectedSession?.sessionId && dataSource === 'codex') {
      window.localStorage.setItem('selected-session-id', selectedSession.sessionId)
    }
  }, [dataSource, selectedSession?.sessionId])

  useEffect(() => {
    if (!selectedSession) return
    const stillVisible = filteredSessions.some(
      (session) => session.sessionId === selectedSession.sessionId,
    )
    if (!stillVisible) {
      setSelectedSession(null)
    }
  }, [filteredSessions, selectedSession])

  useEffect(() => {
    if (dataSource !== 'codex') {
      stopWatching()
      return
    }
    loadSessions()
    startWatching()
  }, [dataSource, stopWatching])

  const resetViews = useCallback(() => {
    setSearchQuery('')
    setSearchResults([])
    setClearSignal((value) => value + 1)
    setShowFavoritesView(false)
    setShowTodosView(false)
  }, [])

  const applyOpenAIResult = useCallback(
    (result: any) => {
      if (result?.success && result.sessions) {
        const parsedSessions: Session[] = result.sessions.map((s: any) => normalizeSession(s))
        parsedSessions.sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
        setSessions(parsedSessions)
        setSelectedSession(null)
        setDataSource('openai')
        setOpenAIPath(result.sourcePath || null)
        resetViews()
        toast.success(
          parsedSessions.length
            ? `Loaded ${parsedSessions.length} conversations from export.`
            : 'Loaded export (no conversations found).',
        )
      } else if (!result?.canceled) {
        toast.error(result?.error || 'Unable to load ChatGPT export.')
      }
    },
    [normalizeSession, resetViews],
  )

  const loadOpenAIExportFile = useCallback(async () => {
    if (typeof window === 'undefined' || !(window as any).electron?.openOpenAIExportFile) {
      toast.error('OpenAI export import requires the Electron app.')
      return
    }
    setIsLoading(true)
    await stopWatching()
    const result = await (window as any).electron.openOpenAIExportFile()
    applyOpenAIResult(result)
    setIsLoading(false)
  }, [applyOpenAIResult, stopWatching])

  const loadOpenAIExportFolder = useCallback(async () => {
    if (typeof window === 'undefined' || !(window as any).electron?.openOpenAIExportFolder) {
      toast.error('OpenAI export import requires the Electron app.')
      return
    }
    setIsLoading(true)
    await stopWatching()
    const result = await (window as any).electron.openOpenAIExportFolder()
    applyOpenAIResult(result)
    setIsLoading(false)
  }, [applyOpenAIResult, stopWatching])

  const loadOpenAIExportDefault = useCallback(async () => {
    if (typeof window === 'undefined' || !(window as any).electron?.openOpenAIExportDefault) {
      toast.error('OpenAI export import requires the Electron app.')
      return
    }
    setIsLoading(true)
    await stopWatching()
    const result = await (window as any).electron.openOpenAIExportDefault()
    applyOpenAIResult(result)
    setIsLoading(false)
  }, [applyOpenAIResult, stopWatching])

  const reloadOpenAIExport = useCallback(async () => {
    if (
      typeof window === 'undefined' ||
      !(window as any).electron?.readOpenAIExport ||
      !openAIPath
    ) {
      return
    }
    setIsLoading(true)
    await stopWatching()
    const result = await (window as any).electron.readOpenAIExport(openAIPath)
    applyOpenAIResult(result)
    setIsLoading(false)
  }, [applyOpenAIResult, openAIPath, stopWatching])

  const switchToCodex = useCallback(async () => {
    resetViews()
    setDataSource('codex')
    setOpenAIPath(null)
    setSelectedSession(null)
  }, [resetViews])

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((value) => {
      if (value) {
        setSelectedSessionIds(new Set())
      }
      return !value
    })
  }, [])

  const toggleSessionSelection = useCallback((sessionId: string) => {
    setSelectedSessionIds((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) {
        next.delete(sessionId)
      } else {
        next.add(sessionId)
      }
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedSessionIds(new Set())
  }, [])

  const selectAllFiltered = useCallback(() => {
    setSelectedSessionIds(new Set(filteredSessions.map((session) => session.sessionId)))
  }, [filteredSessions])

  const hasUnhydratedSessions = useMemo(
    () => dataSource === 'codex' && sessions.some((session) => session.hydrated === false),
    [dataSource, sessions],
  )

  const loadFullSessionHistory = useCallback(async () => {
    if (!selectedSession) return
    await hydrateSession(selectedSession.sessionId, { fullHistory: true })
  }, [hydrateSession, selectedSession])

  const buildSessionMarkdown = useCallback((session: Session) => {
    let markdown = `# ${session.title}\n\n`
    markdown += `**Session:** ${session.sessionId}\n`
    markdown += `**Started:** ${session.firstSeen.toLocaleString()}\n`
    markdown += `**Ended:** ${session.lastSeen.toLocaleString()}\n`
    if (session.cwd) {
      markdown += `**Working Directory:** ${session.cwd}\n`
    }
    markdown += `\n---\n\n`

    session.events.forEach((event) => {
      if (event.kind === 'user') {
        markdown += `## User\n\n${event.text || ''}\n\n`
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
  }, [])

  const exportSelectedMarkdown = useCallback(async () => {
    if (selectedSessions.length === 0) {
      toast.error('Select at least one conversation to export.')
      return
    }
    if (typeof window === 'undefined' || !(window as any).electron?.saveMarkdown) {
      toast.error('Export requires the Electron app.')
      return
    }

    const exportSessions: Session[] = []
    for (const session of selectedSessions) {
      if (dataSource === 'codex' && (!session.hydrated || session.truncated)) {
        const updated = await hydrateSession(session.sessionId, { fullHistory: true })
        exportSessions.push(updated || session)
      } else {
        exportSessions.push(session)
      }
    }

    const label = monthFilter === 'all' ? 'all-months' : monthFilter.replace('-', '_')
    const sourceLabel = dataSource === 'codex' ? 'codex' : 'chatgpt'
    const filename = `${sourceLabel}-${label}-selected`

    let markdown = `# Conversations Export\n\n`
    markdown += `**Source:** ${dataSource === 'codex' ? 'Codex Sessions' : 'ChatGPT Export'}\n`
    markdown += `**Exported:** ${new Date().toLocaleString()}\n`
    markdown += `**Month Filter:** ${monthFilter === 'all' ? 'All months' : monthFilter}\n`
    markdown += `**Conversations:** ${exportSessions.length}\n`
    markdown += `\n---\n\n`

    exportSessions.forEach((session, index) => {
      markdown += buildSessionMarkdown(session)
      if (index < exportSessions.length - 1) {
        markdown += `\n---\n\n`
      }
    })

    const result = await (window as any).electron.saveMarkdown({ filename, content: markdown })
    if (result?.success) {
      toast.success('Saved Markdown')
    } else if (!result?.canceled) {
      toast.error(result?.error || 'Failed to save Markdown')
    }
  }, [buildSessionMarkdown, dataSource, hydrateSession, monthFilter, selectedSessions])

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex h-screen w-full bg-background">
        <Sidebar>
          <SidebarHeader className="border-b border-border">
            <div className="flex items-center justify-between px-2">
              <div className="flex-1">
                <h1 className="text-xl font-semibold text-foreground">
                  {dataSource === 'codex' ? 'Codex Sessions' : 'ChatGPT Export'}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {dataSource === 'codex' ? 'Live from ~/.codex/sessions' : 'Loaded from export'}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (dataSource === 'codex') {
                    loadSessions()
                  } else {
                    reloadOpenAIExport()
                  }
                }}
                disabled={isLoading}
                className="bg-transparent"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SessionList
              sessions={filteredSessions}
              selectedSession={selectedSession}
              onSelectSession={setSelectedSession}
              noteSnippets={sessionNoteSnippets}
              bookmarks={bookmarks}
              onToggleBookmark={setBookmark}
              isLoading={isLoading}
              emptyMessage={emptyMessage}
              selectionMode={selectionMode}
              selectedSessionIds={selectedSessionIds}
              onToggleSelect={toggleSessionSelection}
            />
          </SidebarContent>
        </Sidebar>

        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
            <SidebarTrigger />
            <div className="flex-1">
              <SearchPanel
                sessions={filteredSessions}
                notes={notes}
                onSearchChange={handleSearchChange}
                inputRef={searchInputRef}
                clearSignal={clearSignal}
                hasUnhydratedSessions={hasUnhydratedSessions}
                isHydratingAllSessions={isHydratingAllSessions}
                onLoadAllSessions={hasUnhydratedSessions ? hydrateAllSessions : undefined}
              />
            </div>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger size="sm" className="min-w-[140px]">
                <SelectValue placeholder="All months" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {monthOptions.map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="bg-transparent">
                  <Database className="h-4 w-4 mr-2" />
                  {dataSource === 'codex' ? 'Codex' : 'ChatGPT Export'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Data source</DropdownMenuLabel>
                <DropdownMenuItem
                  disabled={dataSource === 'codex'}
                  onSelect={() => {
                    switchToCodex()
                  }}
                >
                  Codex Sessions
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={loadOpenAIExportFile}>
                  Load conversations.json…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={loadOpenAIExportFolder}>
                  Load export folder…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={loadOpenAIExportDefault}>
                  Load conversations.json in project
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!openAIPath} onSelect={reloadOpenAIExport}>
                  Reload current export
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant={selectionMode ? 'secondary' : 'outline'}
              size="sm"
              className="bg-transparent"
              onClick={toggleSelectionMode}
            >
              <CheckSquare className="w-4 h-4 mr-2" />
              Select
            </Button>
            {selectionMode && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-transparent"
                  onClick={selectAllFiltered}
                >
                  Select all
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="bg-transparent"
                  onClick={clearSelection}
                >
                  Clear
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-transparent"
                  disabled={selectedSessions.length === 0}
                  onClick={exportSelectedMarkdown}
                >
                  <FileDown className="w-4 h-4 mr-2" />
                  Export ({selectedSessions.length})
                </Button>
              </>
            )}
            {!searchQuery && selectedSession == null && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
                title={viewMode === 'list' ? 'Grid view' : 'List view'}
              >
                {viewMode === 'list' ? (
                  <LayoutGrid className="h-4 w-4" />
                ) : (
                  <LayoutList className="h-4 w-4" />
                )}
              </Button>
            )}
            <ThemeToggle />

            <Button
              variant={showFavoritesView ? 'secondary' : 'outline'}
              size="sm"
              className="bg-transparent"
              onClick={() => {
                setShowFavoritesView((value) => !value)
                if (!showFavoritesView) {
                  setSearchQuery('')
                  setSearchResults([])
                  setClearSignal((value) => value + 1)
                  setShowTodosView(false)
                }
              }}
            >
              <Star className="w-4 h-4 mr-2" />
              Favorites
            </Button>

            <Button
              variant={showTodosView ? 'secondary' : 'outline'}
              size="sm"
              className="bg-transparent"
              onClick={() => {
                setShowTodosView((value) => !value)
                if (!showTodosView) {
                  setSearchQuery('')
                  setSearchResults([])
                  setClearSignal((value) => value + 1)
                  setShowFavoritesView(false)
                }
              }}
            >
              <CheckSquare className="w-4 h-4 mr-2" />
              Todos
            </Button>
          </header>

          <div className="flex-1 overflow-auto">
            {showFavoritesView ? (
              <div className="flex h-full flex-col">
                {hasUnhydratedSessions ? (
                  <div className="border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                    Favorites only include loaded histories. Use “Load all histories” for a full
                    corpus view.
                  </div>
                ) : null}
                <div className="min-h-0 flex-1">
                  <ConversationViewer
                    session={null}
                    events={favoriteEvents}
                    searchQuery={'Favorites'}
                    isGlobalSearch={true}
                    favorites={favorites}
                    notes={notes}
                    highlights={highlights}
                    todos={todos}
                    onSetFavorite={setFavorite}
                    onSetNote={setNote}
                    onSetHighlight={setHighlight}
                    onSetTodo={setTodo}
                  />
                </div>
              </div>
            ) : showTodosView ? (
              <div className="flex h-full flex-col">
                {hasUnhydratedSessions ? (
                  <div className="border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                    Todos only include loaded histories. Use “Load all histories” for a full corpus
                    view.
                  </div>
                ) : null}
                <div className="min-h-0 flex-1">
                  <ConversationViewer
                    session={null}
                    events={todoEvents}
                    searchQuery={'Todos'}
                    isGlobalSearch={true}
                    favorites={favorites}
                    notes={notes}
                    highlights={highlights}
                    todos={todos}
                    onSetFavorite={setFavorite}
                    onSetNote={setNote}
                    onSetHighlight={setHighlight}
                    onSetTodo={setTodo}
                  />
                </div>
              </div>
            ) : searchQuery ? (
              <ConversationViewer
                session={null}
                events={searchResults}
                searchQuery={searchQuery}
                isGlobalSearch={true}
                favorites={favorites}
                notes={notes}
                highlights={highlights}
                todos={todos}
                onSetFavorite={setFavorite}
                onSetNote={setNote}
                onSetHighlight={setHighlight}
                onSetTodo={setTodo}
              />
            ) : selectedSession ? (
              selectedSession.hydrated === false ? (
                <div className="flex h-full items-center justify-center gap-3 text-muted-foreground">
                  <Spinner className="h-5 w-5" />
                  <span>Loading conversation…</span>
                </div>
              ) : (
                <div className="flex h-full flex-col">
                  {selectedSession.truncated ? (
                    <div className="border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                      <div className="flex items-center justify-between gap-3">
                        <span>
                          Large session detected. Showing a recent preview to keep the viewer
                          responsive.
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="bg-transparent"
                          onClick={loadFullSessionHistory}
                        >
                          Load full history
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <div className="min-h-0 flex-1">
                    <ConversationViewer
                      session={selectedSession}
                      events={selectedSession.events}
                      isGlobalSearch={false}
                      favorites={favorites}
                      notes={notes}
                      highlights={highlights}
                      todos={todos}
                      onSetFavorite={setFavorite}
                      onSetNote={setNote}
                      onSetHighlight={setHighlight}
                      onSetTodo={setTodo}
                    />
                  </div>
                </div>
              )
            ) : viewMode === 'grid' ? (
              <SessionDashboard
                sessions={filteredSessions}
                selectedSession={selectedSession}
                onSelectSession={setSelectedSession}
                isLoading={isLoading}
                emptyTitle={monthFilter === 'all' ? 'No sessions found' : 'No sessions this month'}
                emptyMessage={emptyMessage}
                title={dashboardTitle}
                subtitle={dashboardSubtitle}
                selectionMode={selectionMode}
                selectedSessionIds={selectedSessionIds}
                onToggleSelect={toggleSessionSelection}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                Select a session to view the conversation
              </div>
            )}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
