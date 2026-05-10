import type { CodexRolloutLine, NormalizedEvent } from './types'

const USER_REQUEST_MARKER = 'My request for Codex:'
const HIDDEN_METADATA_BLOCK_RE = /^<(subagent_notification|skill|turn_aborted|hook_prompt)\b/i

function hashString(input: string): string {
  let hash = 5381
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) + hash + input.charCodeAt(i)
  }
  return (hash >>> 0).toString(36)
}

function buildEventId(
  kind: string,
  sessionId: string | undefined,
  timestamp: string | undefined,
  content: string,
) {
  const base = `${kind}|${sessionId || ''}|${timestamp || ''}|${content || ''}`
  return `${kind}_${hashString(base)}`
}

function coerceRole(value: unknown): 'user' | 'assistant' | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined

  if (normalized === 'user' || normalized === 'human') return 'user'
  if (normalized === 'assistant' || normalized === 'ai') return 'assistant'

  if (normalized.startsWith('user_')) return 'user'
  if (normalized.startsWith('assistant_')) return 'assistant'

  if (normalized.includes('user') && normalized.includes('message')) return 'user'
  if (normalized.includes('human') && normalized.includes('message')) return 'user'
  if (normalized.includes('assistant') && normalized.includes('message')) return 'assistant'

  return undefined
}

function resolveRole(line: CodexRolloutLine): 'user' | 'assistant' | undefined {
  const payload = (line as any).payload
  const message = (line.message as any) || (payload?.type === 'message' ? payload : undefined)

  return (
    coerceRole(message?.role) ||
    coerceRole(message?.message?.role) ||
    coerceRole(payload?.role) ||
    coerceRole(payload?.message?.role) ||
    coerceRole((line as any).role) ||
    coerceRole(line.type)
  )
}

function resolveClaudeRole(line: any): 'user' | 'assistant' | undefined {
  return (
    coerceRole(line?.role) ||
    coerceRole(line?.author) ||
    coerceRole(line?.sender) ||
    coerceRole(line?.type)
  )
}

function resolveContent(line: CodexRolloutLine, message: any): unknown {
  if (message?.content !== undefined) return message.content
  if (message?.message?.content !== undefined) return message.message.content

  const payload = (line as any).payload
  if (payload?.content !== undefined) return payload.content
  if (payload?.message?.content !== undefined) return payload.message.content

  if ((line as any).content !== undefined) return (line as any).content
  if ((line as any).message?.content !== undefined) return (line as any).message.content

  return undefined
}

function resolveClaudeContent(line: any): unknown {
  if (line?.content !== undefined) return line.content
  if (line?.message?.content !== undefined) return line.message.content
  if (line?.delta?.text !== undefined) return line.delta.text
  if (line?.delta?.content !== undefined) return line.delta.content
  if (line?.output_text !== undefined) return line.output_text
  if (line?.input_text !== undefined) return line.input_text
  if (line?.text !== undefined) return line.text
  if (line?.completion !== undefined) return line.completion
  return undefined
}

function resolveSessionId(line: any): string | undefined {
  return (
    line?.sessionId || line?.session_id || line?.conversation_id || line?.thread_id || line?.chat_id
  )
}

function resolveTimestamp(line: any): string | undefined {
  return line?.timestamp || line?.created_at || line?.createdAt || line?.time
}

function isClaudeLine(line: any): boolean {
  if (!line || typeof line !== 'object') return false
  if (line.conversation_id || line.session_id || line.thread_id || line.chat_id) return true
  if (typeof line.model === 'string' && line.model.toLowerCase().includes('claude')) return true
  if (line.type === 'message' && line.role && line.content !== undefined && !line.message)
    return true
  if (line.author || line.sender) return true
  return false
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const obj = content as any
    if (typeof obj.text === 'string') return obj.text
    if (typeof obj.content === 'string') return obj.content
    if (typeof obj.input_text === 'string') return obj.input_text
    if (typeof obj.output_text === 'string') return obj.output_text
    if (typeof obj.completion === 'string') return obj.completion
    if (typeof obj.delta?.text === 'string') return obj.delta.text
    if (typeof obj.delta?.content === 'string') return obj.delta.content
  }
  if (!Array.isArray(content)) return ''

  return content
    .filter((block: any) => block?.type !== 'tool_result')
    .map((block: any) => {
      if (typeof block?.text === 'string') return block.text
      if (typeof block?.content === 'string') return block.content
      if (typeof block?.input_text === 'string') return block.input_text
      if (typeof block?.output_text === 'string') return block.output_text
      if (block?.content && typeof block.content === 'object') {
        if (typeof block.content.text === 'string') return block.content.text
        if (typeof block.content.content === 'string') return block.content.content
      }
      return ''
    })
    .filter((blockText: string) => blockText.trim())
    .join('\n\n')
}

function extractBlocksFromContent(
  content: unknown,
): Array<{ type: string; text?: string; thinking?: string }> {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }]
  }
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const text = extractTextFromContent(content)
    return text ? [{ type: 'text', text }] : []
  }
  if (!Array.isArray(content)) return []

  const blocks: Array<{ type: string; text?: string; thinking?: string }> = []
  content.forEach((block: any) => {
    if (block?.type === 'thinking' && block.thinking) {
      blocks.push({ type: 'thinking', thinking: block.thinking })
      return
    }
    if (block?.type === 'tool_result') return

    if (typeof block?.text === 'string') {
      blocks.push({ type: 'text', text: block.text })
      return
    }
    if (typeof block?.input_text === 'string') {
      blocks.push({ type: 'text', text: block.input_text })
      return
    }
    if (typeof block?.output_text === 'string') {
      blocks.push({ type: 'text', text: block.output_text })
      return
    }
    if (typeof block?.content === 'string') {
      blocks.push({ type: 'text', text: block.content })
      return
    }
    if (block?.content && typeof block.content === 'object') {
      if (typeof block.content.text === 'string') {
        blocks.push({ type: 'text', text: block.content.text })
        return
      }
      if (typeof block.content.content === 'string') {
        blocks.push({ type: 'text', text: block.content.content })
        return
      }
    }
  })
  return blocks
}

function extractUserMetadata(text: string): {
  cleanText: string
  metadataText: string
  isMetadataOnly: boolean
} {
  const trimmed = text.trim()
  if (!trimmed) return { cleanText: '', metadataText: '', isMetadataOnly: false }

  const markerIndex = trimmed.indexOf(USER_REQUEST_MARKER)
  if (markerIndex !== -1) {
    const metadataText = trimmed.slice(0, markerIndex).trim()
    const cleanText = trimmed.slice(markerIndex + USER_REQUEST_MARKER.length).trim()
    return {
      cleanText,
      metadataText,
      isMetadataOnly: !cleanText && Boolean(metadataText),
    }
  }

  // Check if entire text is just metadata
  if (
    /^<environment_context>/i.test(trimmed) ||
    /^#?\s*Context from my IDE setup:/i.test(trimmed) ||
    /^#?\s*AGENTS\.md instructions/i.test(trimmed) ||
    /^<INSTRUCTIONS>/i.test(trimmed) ||
    HIDDEN_METADATA_BLOCK_RE.test(trimmed)
  ) {
    return { cleanText: '', metadataText: trimmed, isMetadataOnly: true }
  }

  return { cleanText: trimmed, metadataText: '', isMetadataOnly: false }
}

function isAssistantMetaEvent(event: NormalizedEvent): boolean {
  if (event.kind !== 'assistant') return false

  const rawPayload = (event.raw as any)?.payload
  if (rawPayload?.phase === 'commentary') return true

  const text = event.blocks
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text)
    .join('\n\n')
    .trim()

  if (!text) return false
  if (HIDDEN_METADATA_BLOCK_RE.test(text)) return true
  return false
}

export function parseJSONL(content: string): CodexRolloutLine[] {
  return content
    .split('\n')
    .filter((line) => line.trim())
    .map((line, lineNumber) => {
      try {
        return JSON.parse(line) as CodexRolloutLine
      } catch (error) {
        console.error(`Failed to parse line ${lineNumber}:`, error)
        return null
      }
    })
    .filter((line): line is CodexRolloutLine => line !== null)
}

export function normalizeEvents(lines: CodexRolloutLine[]): NormalizedEvent[] {
  const normalized = lines
    .map<NormalizedEvent | null>((line) => {
      const timestampValue = resolveTimestamp(line) || line.timestamp
      const timestamp = timestampValue ? new Date(timestampValue) : undefined
      const payload = (line as any).payload
      const message = (line.message as any) || (payload?.type === 'message' ? payload : undefined)
      const sessionId = resolveSessionId(line) || line.sessionId

      const normalizeCodexEvent = (): NormalizedEvent | null => {
        const role = resolveRole(line)
        const content = resolveContent(line, message)

        if (role === 'user') {
          const rawText = extractTextFromContent(content)
          const { cleanText, metadataText, isMetadataOnly } = extractUserMetadata(rawText)
          const id =
            line.uuid || buildEventId('user', sessionId, timestampValue, rawText || cleanText)

          return {
            kind: 'user' as const,
            id,
            uuid: line.uuid,
            at: timestamp,
            sessionId,
            cwd: line.cwd,
            text: cleanText,
            metadataText,
            isMetadataOnly,
            raw: line,
          }
        }

        if (role === 'assistant') {
          const blocks = extractBlocksFromContent(content)
          const blockText = blocks
            .filter((block) => block.type === 'text' && block.text)
            .map((block) => block.text)
            .join('\n\n')
          const id = line.uuid || buildEventId('assistant', sessionId, timestampValue, blockText)

          return {
            kind: 'assistant' as const,
            id,
            uuid: line.uuid,
            at: timestamp,
            sessionId,
            model: message?.model,
            blocks,
            usage: message?.usage,
            raw: line,
          }
        }

        return null
      }

      const normalizeClaudeEvent = (): NormalizedEvent | null => {
        const role = resolveClaudeRole(line)
        const content = resolveClaudeContent(line)
        const model = (line as any).model || (line as any).message?.model

        if (role === 'user') {
          const rawText = extractTextFromContent(content)
          const { cleanText, metadataText, isMetadataOnly } = extractUserMetadata(rawText)
          const id =
            line.uuid || buildEventId('user', sessionId, timestampValue, rawText || cleanText)

          return {
            kind: 'user' as const,
            id,
            uuid: line.uuid,
            at: timestamp,
            sessionId,
            cwd: line.cwd,
            text: cleanText,
            metadataText,
            isMetadataOnly,
            raw: line,
          }
        }

        if (role === 'assistant') {
          const blocks = extractBlocksFromContent(content)
          const blockText = blocks
            .filter((block) => block.type === 'text' && block.text)
            .map((block) => block.text)
            .join('\n\n')
          const id = line.uuid || buildEventId('assistant', sessionId, timestampValue, blockText)

          return {
            kind: 'assistant' as const,
            id,
            uuid: line.uuid,
            at: timestamp,
            sessionId,
            model,
            blocks,
            raw: line,
          }
        }

        return null
      }

      let normalizedEvent = isClaudeLine(line) ? normalizeClaudeEvent() : normalizeCodexEvent()
      if (!normalizedEvent) {
        normalizedEvent = normalizeClaudeEvent() || normalizeCodexEvent()
      }

      if (normalizedEvent) return normalizedEvent

      return {
        kind: 'other' as const,
        id: line.uuid || buildEventId('other', sessionId, timestampValue, line.type || ''),
        uuid: line.uuid,
        at: timestamp,
        type: line.type,
        raw: line,
      }
    })
    .filter((event): event is NormalizedEvent => event !== null)

  return normalized
}

export function filterConversationEvents(events: NormalizedEvent[]): NormalizedEvent[] {
  return events.filter((event) => {
    // Filter out non-conversation types
    if (event.kind === 'other') return false

    // Filter out sidechain events
    if (event.raw?.isSidechain === true) return false

    // Filter out injected metadata-only user envelopes
    if (event.kind === 'user' && event.isMetadataOnly) return false

    // Filter out empty user messages
    if (event.kind === 'user' && !event.text.trim() && !event.metadataText?.trim()) return false

    // Filter out assistant commentary/meta updates
    if (isAssistantMetaEvent(event)) return false

    // Filter out assistant messages with no text blocks
    if (event.kind === 'assistant' && event.blocks.filter((b) => b.type === 'text').length === 0)
      return false

    return true
  })
}

export function extractSearchableText(event: NormalizedEvent): string {
  if (event.kind === 'user') {
    return event.text
  }

  if (event.kind === 'assistant') {
    return event.blocks
      .filter((block) => block.type === 'text' && block.text)
      .map((block) => block.text!)
      .join(' ')
  }

  return ''
}
