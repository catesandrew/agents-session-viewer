'use client'

import { useEffect, useRef } from 'react'
import { formatDistanceToNow } from 'date-fns'
import type { Session } from '@/lib/types'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { MessageSquare, Pin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatSessionMessageCount } from '@/lib/session-count'

interface SessionListProps {
  sessions: Session[]
  selectedSession: Session | null
  onSelectSession: (session: Session) => void
  noteSnippets?: Record<string, string>
  bookmarks?: Record<string, { pinned: boolean; updatedAt?: string }>
  onToggleBookmark?: (payload: { sessionId: string; pinned: boolean }) => void
  isLoading: boolean
  emptyMessage?: string
  selectionMode?: boolean
  selectedSessionIds?: Set<string>
  onToggleSelect?: (sessionId: string) => void
}

export default function SessionList({
  sessions,
  selectedSession,
  onSelectSession,
  noteSnippets = {},
  bookmarks = {},
  onToggleBookmark,
  isLoading,
  emptyMessage = 'No sessions found.',
  selectionMode = false,
  selectedSessionIds = new Set(),
  onToggleSelect,
}: SessionListProps) {
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!selectedSession) return
    const container = listRef.current
    if (!container) return
    const target = container.querySelector(
      `[data-session-id="${CSS.escape(selectedSession.sessionId)}"]`,
    )
    if (target) {
      target.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedSession?.sessionId])

  if (isLoading) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {Array.from({ length: 5 }).map((_, i) => (
              <SidebarMenuItem key={i}>
                <div className="space-y-2 p-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-sm text-muted-foreground text-center">{emptyMessage}</p>
      </div>
    )
  }

  const pinnedSessions = sessions.filter((session) => bookmarks[session.sessionId]?.pinned)
  const regularSessions = sessions.filter((session) => !bookmarks[session.sessionId]?.pinned)

  const renderSession = (session: Session) => {
    const sessionKey = session.sessionId
    const isSelected = selectedSession?.sessionId === session.sessionId
    const isExportSelected = selectedSessionIds.has(session.sessionId)
    const isPinned = bookmarks[session.sessionId]?.pinned

    const handleClick = () => {
      if (selectionMode) {
        onToggleSelect?.(session.sessionId)
        return
      }
      onSelectSession(session)
    }

    return (
      <SidebarMenuItem key={sessionKey}>
        <SidebarMenuButton
          onClick={handleClick}
          isActive={!selectionMode && isSelected}
          className={cn('w-full h-auto py-2', selectionMode && isExportSelected && 'bg-accent/50')}
          data-session-id={session.sessionId}
        >
          {selectionMode ? (
            <Checkbox
              checked={isExportSelected}
              onCheckedChange={() => onToggleSelect?.(session.sessionId)}
              onClick={(event) => event.stopPropagation()}
              className="mr-2 mt-0.5"
            />
          ) : (
            <MessageSquare className="w-4 h-4 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium break-words">{session.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-muted-foreground">
                {formatSessionMessageCount(session)}
              </p>
              {session.filePaths.length > 1 && (
                <>
                  <span className="text-xs text-muted-foreground">•</span>
                  <p className="text-xs text-muted-foreground">{session.filePaths.length} files</p>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(session.lastSeen, { addSuffix: true })}
            </p>
            {noteSnippets[session.sessionId] && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                Note: {noteSnippets[session.sessionId]}
              </p>
            )}
          </div>
        </SidebarMenuButton>
        <SidebarMenuAction
          type="button"
          title={isPinned ? 'Unpin session' : 'Pin session'}
          onClick={(event) => {
            event.stopPropagation()
            if (!onToggleBookmark) return
            onToggleBookmark({ sessionId: session.sessionId, pinned: !isPinned })
          }}
          className={isPinned ? 'text-primary' : undefined}
          showOnHover
        >
          <Pin className="h-4 w-4" />
        </SidebarMenuAction>
      </SidebarMenuItem>
    )
  }

  return (
    <SidebarGroup>
      <SidebarGroupContent ref={listRef}>
        <SidebarMenu>
          {pinnedSessions.length > 0 && (
            <>
              <SidebarMenuItem>
                <div className="px-2 pb-1 text-xs font-medium uppercase text-muted-foreground">
                  Pinned
                </div>
              </SidebarMenuItem>
              {pinnedSessions.map(renderSession)}
              <SidebarMenuItem>
                <div className="px-2 pt-3 pb-1 text-xs font-medium uppercase text-muted-foreground">
                  All Sessions
                </div>
              </SidebarMenuItem>
            </>
          )}
          {regularSessions.map(renderSession)}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
