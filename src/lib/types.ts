export type CodexRolloutLine = {
  type?: string
  uuid?: string
  parentUuid?: string | null
  timestamp?: string
  sessionId?: string
  cwd?: string
  version?: string
  gitBranch?: string
  isSidechain?: boolean
  userType?: string
  message?: {
    role?: string
    content?:
      | string
      | Array<{
          type: string
          text?: string
          thinking?: string
          tool_use_id?: string
          content?: string
        }>
    model?: string
    id?: string
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_read_input_tokens?: number
      cache_creation_input_tokens?: number
    }
  }
  payload?: {
    type?: string
    role?: string
    content?:
      | string
      | Array<{
          type: string
          text?: string
          thinking?: string
          tool_use_id?: string
          content?: string
        }>
    message?: string
  }
  toolUseResult?: unknown
  [k: string]: unknown
}

export type NormalizedEvent =
  | {
      kind: 'user'
      id?: string
      uuid?: string
      at?: Date
      sessionId?: string
      cwd?: string
      text: string
      metadataText?: string
      isMetadataOnly?: boolean
      raw?: CodexRolloutLine
    }
  | {
      kind: 'assistant'
      id?: string
      uuid?: string
      at?: Date
      sessionId?: string
      model?: string
      blocks: Array<{ type: string; text?: string; thinking?: string }>
      usage?: {
        input_tokens?: number
        output_tokens?: number
        cache_read_input_tokens?: number
        cache_creation_input_tokens?: number
      }
      raw?: CodexRolloutLine
    }
  | {
      kind: 'other'
      id?: string
      uuid?: string
      at?: Date
      type?: string
      raw?: CodexRolloutLine
    }

export type FavoriteRatings = Record<
  string,
  {
    rating: 'up' | 'down'
    updatedAt?: string
    snapshot?: unknown
  }
>

export type MessageNotes = Record<
  string,
  {
    text: string
    updatedAt?: string
    snapshot?: unknown
  }
>

export type MessageHighlights = Record<
  string,
  {
    enabled: boolean
    updatedAt?: string
    snapshot?: unknown
  }
>

export type MessageTodos = Record<
  string,
  {
    enabled: boolean
    updatedAt?: string
    snapshot?: unknown
  }
>

export type SessionBookmarks = Record<
  string,
  {
    pinned: boolean
    updatedAt?: string
  }
>

export type Session = {
  sessionId: string
  title: string // First user message or cwd/date fallback
  cwd?: string
  firstSeen: Date
  lastSeen: Date
  filePaths: string[] // Multiple files can belong to same session
  events: NormalizedEvent[]
  messageCount: number
  summaryReady?: boolean
  hydrated?: boolean
  truncated?: boolean
}

export type SessionFile = {
  path: string
  name: string
  content: string
  modified: Date
}
