'use client'

import { formatDistanceToNow } from 'date-fns'
import type { Session } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { MessageSquare, Clock, FileText, Sparkles, Check } from 'lucide-react'
import { formatSessionMessageCount } from '@/lib/session-count'

interface SessionDashboardProps {
  sessions: Session[]
  selectedSession: Session | null
  onSelectSession: (session: Session) => void
  isLoading: boolean
  emptyTitle?: string
  emptyMessage?: string
  title?: string
  subtitle?: string
  selectionMode?: boolean
  selectedSessionIds?: Set<string>
  onToggleSelect?: (sessionId: string) => void
}

function SessionTileSkeleton() {
  return (
    <Card className="h-full border-border/40 bg-card/50">
      <CardHeader className="gap-3 pb-4">
        <div className="space-y-2.5">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2 opacity-50" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex gap-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-7 w-20" />
        </div>
        <Skeleton className="h-4 w-36 opacity-50" />
      </CardContent>
    </Card>
  )
}

function SessionTile({
  session,
  isSelected,
  isExportSelected,
  selectionMode,
  onSelect,
  onToggleSelect,
}: {
  session: Session
  isSelected: boolean
  isExportSelected: boolean
  selectionMode: boolean
  onSelect: () => void
  onToggleSelect: () => void
}) {
  const hasMultipleFiles = session.filePaths.length > 1
  const countLabel = formatSessionMessageCount(session)

  return (
    <button
      type="button"
      onClick={selectionMode ? onToggleSelect : onSelect}
      className={cn(
        'group relative rounded-xl text-left transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'hover:scale-[1.02] active:scale-[0.98]',
      )}
      aria-pressed={isSelected}
    >
      <Card
        className={cn(
          'h-full border-2 transition-all duration-200',
          'bg-card/80 backdrop-blur-sm',
          'hover:border-primary/60 hover:bg-card hover:shadow-xl hover:shadow-primary/10',
          'dark:bg-card/60 dark:hover:bg-card/80 dark:hover:shadow-primary/5',
          isSelected && 'border-primary bg-card shadow-xl shadow-primary/20 dark:shadow-primary/10',
          selectionMode && isExportSelected && 'border-primary/80 bg-primary/5',
        )}
      >
        {selectionMode && (
          <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
            <Checkbox
              checked={isExportSelected}
              onCheckedChange={onToggleSelect}
              onClick={(event) => event.stopPropagation()}
              className="h-5 w-5"
            />
          </div>
        )}
        {selectionMode && isExportSelected && (
          <div className="absolute left-4 top-4 z-10 flex items-center gap-1 rounded-full bg-primary/90 px-2 py-1 text-xs font-semibold text-primary-foreground">
            <Check className="h-3 w-3" />
            Selected
          </div>
        )}
        <CardHeader className="gap-4 pb-4">
          <div className="min-w-0">
            <CardTitle className="line-clamp-4 text-base font-bold leading-snug tracking-tight text-foreground">
              {session.title}
            </CardTitle>
            {session.cwd && (
              <CardDescription className="mt-2 line-clamp-1 text-xs font-medium text-muted-foreground/80">
                {session.cwd}
              </CardDescription>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className={cn(
                'gap-1.5 border font-semibold shadow-sm',
                isSelected && 'border-primary/30 bg-primary/10 text-primary',
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="text-xs">{countLabel}</span>
            </Badge>
            {hasMultipleFiles && (
              <Badge
                variant="outline"
                className={cn(
                  'gap-1.5 border-border/60 font-medium shadow-sm',
                  isSelected && 'border-primary/30 bg-primary/5 text-primary/90',
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                <span className="text-xs">{session.filePaths.length} files</span>
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground/90">
            <Clock className="h-4 w-4" />
            <span>{formatDistanceToNow(session.lastSeen, { addSuffix: true })}</span>
          </div>
        </CardContent>

        <div
          className={cn(
            'pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-200',
            'bg-gradient-to-br from-primary/10 via-primary/5 to-transparent',
            'group-hover:opacity-100',
          )}
        />
      </Card>
    </button>
  )
}

export default function SessionDashboard({
  sessions,
  selectedSession,
  onSelectSession,
  isLoading,
  emptyTitle = 'No sessions found',
  emptyMessage = 'No sessions found for the selected source.',
  title = 'Sessions',
  subtitle = 'Browse your conversations.',
  selectionMode = false,
  selectedSessionIds = new Set(),
  onToggleSelect,
}: SessionDashboardProps) {
  if (isLoading) {
    return (
      <div className="h-full overflow-auto p-8">
        <div className="mb-8">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="mt-3 h-5 w-96" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 12 }).map((_, index) => (
            <SessionTileSkeleton key={index} />
          ))}
        </div>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <div className="rounded-full bg-muted/50 p-6">
          <MessageSquare className="h-16 w-16 text-muted-foreground/40" />
        </div>
        <h3 className="mt-6 text-xl font-semibold">{emptyTitle}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-8">
        <header className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
          <p className="mt-3 text-base text-muted-foreground">
            {subtitle ||
              `Browse ${sessions.length} ${
                sessions.length === 1 ? 'conversation' : 'conversations'
              }.`}
          </p>
        </header>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {sessions.map((session) => (
            <SessionTile
              key={session.sessionId}
              session={session}
              isSelected={selectedSession?.sessionId === session.sessionId}
              isExportSelected={selectedSessionIds.has(session.sessionId)}
              selectionMode={selectionMode}
              onSelect={() => onSelectSession(session)}
              onToggleSelect={() => onToggleSelect?.(session.sessionId)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
