'use client'

import { useEffect, useState } from 'react'
import type { NormalizedEvent } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from '@/components/ui/card'
import {
  Copy,
  Check,
  User,
  Bot,
  Share2,
  ThumbsUp,
  ThumbsDown,
  StickyNote,
  Highlighter,
  Hash,
  CheckSquare,
} from 'lucide-react'
import { toast } from 'sonner'
import MarkdownRenderer from './markdown-renderer'
import { Textarea } from '@/components/ui/textarea'

interface MessageBubbleProps {
  event: NormalizedEvent
  showMetadata?: boolean
  collapsed?: boolean
  isActive?: boolean
  onToggleCollapse?: () => void
  onActivate?: () => void
  favoriteRating?: 'up' | 'down'
  onSetFavorite?: (rating: 'up' | 'down' | null) => void
  note?: string
  highlighted?: boolean
  onSetNote?: (text: string) => void
  onSetHighlight?: (enabled: boolean) => void
  todo?: boolean
  onSetTodo?: (enabled: boolean) => void
}

function getFirstLine(text: string): string {
  const line = text.split('\n')[0] || ''
  return line.trim()
}

function getAssistantPreview(event: NormalizedEvent): string {
  if (event.kind !== 'assistant') return ''
  const firstText = event.blocks.find((block) => block.type === 'text' && block.text)?.text || ''
  return getFirstLine(firstText)
}

function sanitizeFilename(name: string, fallback = 'message') {
  const cleaned = name
    .replace(/[\\/:"*?<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || fallback
}

export default function MessageBubble({
  event,
  showMetadata = false,
  collapsed = false,
  isActive = false,
  onToggleCollapse,
  onActivate,
  favoriteRating,
  onSetFavorite,
  note,
  highlighted = false,
  onSetNote,
  onSetHighlight,
  todo = false,
  onSetTodo,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false)
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState(note || '')

  const currentNote = note || ''

  useEffect(() => {
    if (!isEditingNote) {
      setNoteDraft(currentNote)
    }
  }, [currentNote, isEditingNote])

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast.error('Failed to copy')
    }
  }

  const copySessionCommand = async (sessionId?: string) => {
    if (!sessionId) return
    const command = `codex resume ${sessionId}`
    try {
      await navigator.clipboard.writeText(command)
      toast.success('Copied session resume command')
    } catch (error) {
      toast.error('Failed to copy session')
    }
  }

  const handleShare = async (filename: string, content: string) => {
    if (!content || typeof window === 'undefined' || !(window as any).electron?.shareFile) return
    const result = await (window as any).electron.shareFile({ filename, extension: 'md', content })
    if (result?.success) {
      return
    } else {
      toast.error(result?.error || 'Share failed')
    }
  }

  const handleContextMenu = async (
    eventPayload: NormalizedEvent,
    markdown: string,
    json: string,
  ) => {
    if (typeof window === 'undefined' || !(window as any).electron?.showContextMenu) return
    const filename = sanitizeFilename(
      `${eventPayload.kind}-${eventPayload.at ? eventPayload.at.toISOString() : 'message'}`,
      'message',
    )
    await (window as any).electron.showContextMenu({ filename, markdown, json })
  }

  if (event.kind === 'user') {
    const hasText = event.text && event.text.trim().length > 0
    const hasMetadata = showMetadata && event.metadataText && event.metadataText.trim().length > 0
    const preview = hasText ? getFirstLine(event.text) : 'Metadata'

    const markdown = `## User\n\n${event.text}\n\n`
    const json = JSON.stringify(
      {
        role: 'user',
        at: event.at ? event.at.toISOString() : undefined,
        text: event.text,
        metadataText: event.metadataText,
        isMetadataOnly: event.isMetadataOnly,
        sessionId: event.sessionId,
        cwd: event.cwd,
      },
      null,
      2,
    )
    const filename = sanitizeFilename(
      `${event.kind}-${event.at ? event.at.toISOString() : 'message'}`,
      'message',
    )

    return (
      <Card
        className={`group ${isActive ? 'ring-2 ring-ring' : ''} ${highlighted ? 'border-primary/60 shadow-[0_0_0_1px_rgba(79,70,229,0.35)]' : ''}`}
        onClick={onActivate}
        onContextMenu={(e) => {
          e.preventDefault()
          handleContextMenu(event, markdown, json)
        }}
      >
        <CardHeader>
          <div className="flex items-center gap-3 w-full">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <CardTitle className="text-sm">User</CardTitle>
              {event.at && (
                <CardDescription className="text-xs">{event.at.toLocaleString()}</CardDescription>
              )}
            </div>
            <CardAction className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleCollapse?.()
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {collapsed ? 'Expand' : 'Collapse'}
              </Button>
              {event.sessionId && (
                <Button
                  size="sm"
                  variant="ghost"
                  title="Copy session resume command"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation()
                    copySessionCommand(event.sessionId)
                  }}
                >
                  <Hash className="w-4 h-4" />
                </Button>
              )}
              <Button
                size="sm"
                variant={favoriteRating === 'up' ? 'secondary' : 'ghost'}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                  onSetFavorite?.(favoriteRating === 'up' ? null : 'up')
                }}
              >
                <ThumbsUp className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant={favoriteRating === 'down' ? 'secondary' : 'ghost'}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                  onSetFavorite?.(favoriteRating === 'down' ? null : 'down')
                }}
              >
                <ThumbsDown className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant={currentNote ? 'secondary' : 'ghost'}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                  setNoteDraft(currentNote)
                  setIsEditingNote((value) => !value)
                }}
              >
                <StickyNote className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant={highlighted ? 'secondary' : 'ghost'}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                  onSetHighlight?.(!highlighted)
                }}
              >
                <Highlighter className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant={todo ? 'secondary' : 'ghost'}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                  onSetTodo?.(!todo)
                }}
              >
                <CheckSquare className="w-4 h-4" />
              </Button>
            </CardAction>
          </div>
        </CardHeader>
        {!collapsed && (
          <CardContent className="space-y-4">
            {currentNote && !isEditingNote && (
              <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                Note: {currentNote}
              </div>
            )}
            {isEditingNote && (
              <div className="space-y-2">
                <Textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Add a note…"
                  className="min-h-[72px]"
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      onSetNote?.(noteDraft.trim())
                      setIsEditingNote(false)
                    }}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsEditingNote(false)
                      setNoteDraft(currentNote)
                    }}
                  >
                    Cancel
                  </Button>
                  {currentNote && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        onSetNote?.('')
                        setIsEditingNote(false)
                        setNoteDraft('')
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            )}
            {hasMetadata && (
              <div className="bg-secondary/50 rounded-lg p-4 text-sm overflow-x-auto">
                <div className="text-xs text-muted-foreground font-medium mb-2">Metadata</div>
                <MarkdownRenderer>{event.metadataText ?? ''}</MarkdownRenderer>
              </div>
            )}
            {hasText && (
              <div className="bg-muted rounded-lg p-4 relative group/content overflow-x-auto">
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-2 right-2 opacity-0 group-hover/content:opacity-100 transition-opacity z-10"
                  onClick={() => copyToClipboard(event.text)}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-2 right-10 opacity-0 group-hover/content:opacity-100 transition-opacity z-10"
                  onClick={() => handleShare(filename, markdown)}
                >
                  <Share2 className="w-4 h-4" />
                </Button>
                <MarkdownRenderer>{event.text}</MarkdownRenderer>
              </div>
            )}
          </CardContent>
        )}
        {collapsed && (
          <CardContent>
            <div
              className="text-sm text-muted-foreground cursor-pointer hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation()
                onToggleCollapse?.()
              }}
            >
              {preview || (event.at ? event.at.toLocaleString() : 'Collapsed')}
            </div>
          </CardContent>
        )}
      </Card>
    )
  }

  if (event.kind === 'assistant') {
    const allText = event.blocks
      .filter((block) => block.type === 'text' && block.text)
      .map((block) => block.text)
      .join('\n\n')
    const preview = getAssistantPreview(event)

    const markdown = `## Assistant\n\n${allText}\n\n`
    const json = JSON.stringify(
      {
        role: 'assistant',
        at: event.at ? event.at.toISOString() : undefined,
        text: allText,
        blocks: event.blocks,
        model: event.model,
        sessionId: event.sessionId,
      },
      null,
      2,
    )
    const filename = sanitizeFilename(
      `${event.kind}-${event.at ? event.at.toISOString() : 'message'}`,
      'message',
    )

    return (
      <Card
        className={`group ${isActive ? 'ring-2 ring-ring' : ''} ${highlighted ? 'border-primary/60 shadow-[0_0_0_1px_rgba(79,70,229,0.35)]' : ''}`}
        onClick={onActivate}
        onContextMenu={(e) => {
          e.preventDefault()
          handleContextMenu(event, markdown, json)
        }}
      >
        <CardHeader>
          <div className="flex items-center gap-3 w-full">
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-accent-foreground" />
            </div>
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <CardTitle className="text-sm">Assistant</CardTitle>
              {event.model && (
                <CardDescription className="text-xs font-mono truncate">
                  {event.model}
                </CardDescription>
              )}
              {event.at && (
                <CardDescription className="text-xs">{event.at.toLocaleString()}</CardDescription>
              )}
            </div>
            <CardAction className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleCollapse?.()
                }}
                className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap"
              >
                {collapsed ? 'Expand' : 'Collapse'}
              </Button>
              {event.sessionId && (
                <Button
                  size="sm"
                  variant="ghost"
                  title="Copy session resume command"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation()
                    copySessionCommand(event.sessionId)
                  }}
                >
                  <Hash className="w-4 h-4" />
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => copyToClipboard(allText)}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => handleShare(filename, markdown)}
              >
                <Share2 className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant={favoriteRating === 'up' ? 'secondary' : 'ghost'}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                  onSetFavorite?.(favoriteRating === 'up' ? null : 'up')
                }}
              >
                <ThumbsUp className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant={favoriteRating === 'down' ? 'secondary' : 'ghost'}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                  onSetFavorite?.(favoriteRating === 'down' ? null : 'down')
                }}
              >
                <ThumbsDown className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant={currentNote ? 'secondary' : 'ghost'}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                  setNoteDraft(currentNote)
                  setIsEditingNote((value) => !value)
                }}
              >
                <StickyNote className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant={highlighted ? 'secondary' : 'ghost'}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                  onSetHighlight?.(!highlighted)
                }}
              >
                <Highlighter className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant={todo ? 'secondary' : 'ghost'}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                  onSetTodo?.(!todo)
                }}
              >
                <CheckSquare className="w-4 h-4" />
              </Button>
            </CardAction>
          </div>
        </CardHeader>
        {!collapsed && (
          <CardContent className="space-y-4">
            {currentNote && !isEditingNote && (
              <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                Note: {currentNote}
              </div>
            )}
            {isEditingNote && (
              <div className="space-y-2">
                <Textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Add a note…"
                  className="min-h-[72px]"
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      onSetNote?.(noteDraft.trim())
                      setIsEditingNote(false)
                    }}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsEditingNote(false)
                      setNoteDraft(currentNote)
                    }}
                  >
                    Cancel
                  </Button>
                  {currentNote && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        onSetNote?.('')
                        setIsEditingNote(false)
                        setNoteDraft('')
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            )}
            {event.blocks.map((block, index) => {
              if (block.type === 'thinking' && block.thinking) {
                return (
                  <details
                    key={index}
                    className="bg-secondary/50 rounded-lg p-4 text-sm overflow-x-auto"
                  >
                    <summary className="cursor-pointer text-muted-foreground font-medium">
                      Thinking...
                    </summary>
                    <div className="mt-2 text-secondary-foreground whitespace-pre-wrap break-words">
                      {block.thinking}
                    </div>
                  </details>
                )
              }
              if (block.type === 'text' && block.text) {
                return (
                  <div
                    key={index}
                    className="bg-card border border-border rounded-lg p-4 overflow-x-auto"
                  >
                    <MarkdownRenderer>{block.text ?? ''}</MarkdownRenderer>
                  </div>
                )
              }
              return null
            })}
            {event.usage && (
              <div className="text-xs text-muted-foreground font-mono">
                {event.usage.input_tokens} in · {event.usage.output_tokens} out
                {event.usage.cache_read_input_tokens && event.usage.cache_read_input_tokens > 0 && (
                  <span> · {event.usage.cache_read_input_tokens} cached</span>
                )}
              </div>
            )}
          </CardContent>
        )}
        {collapsed && (
          <CardContent>
            <div
              className="text-sm text-muted-foreground cursor-pointer hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation()
                onToggleCollapse?.()
              }}
            >
              {preview || (event.at ? event.at.toLocaleString() : 'Collapsed')}
            </div>
          </CardContent>
        )}
      </Card>
    )
  }

  return null
}
