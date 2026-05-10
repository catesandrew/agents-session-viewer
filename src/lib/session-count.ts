import type { Session } from './types'

export function hasKnownMessageCount(session: Pick<Session, 'messageCount' | 'summaryReady'>): boolean {
  return session.messageCount >= 0 && session.summaryReady !== false
}

export function formatSessionMessageCount(
  session: Pick<Session, 'messageCount' | 'summaryReady'>,
): string {
  if (!hasKnownMessageCount(session)) return 'Counting…'
  return `${session.messageCount} ${session.messageCount === 1 ? 'message' : 'messages'}`
}

export function sumKnownMessageCounts(
  sessions: Array<Pick<Session, 'messageCount' | 'summaryReady'>>,
): number {
  return sessions.reduce(
    (sum, session) => sum + (hasKnownMessageCount(session) ? session.messageCount : 0),
    0,
  )
}
