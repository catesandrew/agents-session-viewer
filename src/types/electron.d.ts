export interface ElectronAPI {
  getCodexPath: () => Promise<string>
  readSessions: () => Promise<{
    success: boolean
    sessions?: Array<{
      sessionId: string
      title: string
      cwd?: string
      firstSeen: string
      lastSeen: string
      filePaths: string[]
      events: Array<{
        id?: string
        kind: 'user' | 'assistant'
        uuid?: string
        at?: string
        sessionId?: string
        cwd?: string
        text?: string
        metadataText?: string
        isMetadataOnly?: boolean
        model?: string
        blocks?: Array<{ type: string; text?: string; thinking?: string }>
        usage?: {
          input_tokens?: number
          output_tokens?: number
          cache_read_input_tokens?: number
          cache_creation_input_tokens?: number
        }
        isSidechain?: boolean
      }>
      messageCount: number
    }>
    error?: string
  }>
  openOpenAIExportFile: () => Promise<{
    success: boolean
    canceled?: boolean
    sessions?: Array<{
      sessionId: string
      title: string
      cwd?: string
      firstSeen: string
      lastSeen: string
      filePaths: string[]
      events: Array<{
        id?: string
        kind: 'user' | 'assistant'
        uuid?: string
        at?: string
        sessionId?: string
        cwd?: string
        text?: string
        metadataText?: string
        isMetadataOnly?: boolean
        model?: string
        blocks?: Array<{ type: string; text?: string; thinking?: string }>
        usage?: {
          input_tokens?: number
          output_tokens?: number
          cache_read_input_tokens?: number
          cache_creation_input_tokens?: number
        }
        isSidechain?: boolean
      }>
      messageCount: number
    }>
    sourcePath?: string
    error?: string
  }>
  openOpenAIExportFolder: () => Promise<{
    success: boolean
    canceled?: boolean
    sessions?: Array<{
      sessionId: string
      title: string
      cwd?: string
      firstSeen: string
      lastSeen: string
      filePaths: string[]
      events: Array<{
        id?: string
        kind: 'user' | 'assistant'
        uuid?: string
        at?: string
        sessionId?: string
        cwd?: string
        text?: string
        metadataText?: string
        isMetadataOnly?: boolean
        model?: string
        blocks?: Array<{ type: string; text?: string; thinking?: string }>
        usage?: {
          input_tokens?: number
          output_tokens?: number
          cache_read_input_tokens?: number
          cache_creation_input_tokens?: number
        }
        isSidechain?: boolean
      }>
      messageCount: number
    }>
    sourcePath?: string
    error?: string
  }>
  openOpenAIExportDefault: () => Promise<{
    success: boolean
    canceled?: boolean
    sessions?: Array<{
      sessionId: string
      title: string
      cwd?: string
      firstSeen: string
      lastSeen: string
      filePaths: string[]
      events: Array<{
        id?: string
        kind: 'user' | 'assistant'
        uuid?: string
        at?: string
        sessionId?: string
        cwd?: string
        text?: string
        metadataText?: string
        isMetadataOnly?: boolean
        model?: string
        blocks?: Array<{ type: string; text?: string; thinking?: string }>
        usage?: {
          input_tokens?: number
          output_tokens?: number
          cache_read_input_tokens?: number
          cache_creation_input_tokens?: number
        }
        isSidechain?: boolean
      }>
      messageCount: number
    }>
    sourcePath?: string
    error?: string
  }>
  readOpenAIExport: (filePath: string) => Promise<{
    success: boolean
    sessions?: Array<{
      sessionId: string
      title: string
      cwd?: string
      firstSeen: string
      lastSeen: string
      filePaths: string[]
      events: Array<{
        id?: string
        kind: 'user' | 'assistant'
        uuid?: string
        at?: string
        sessionId?: string
        cwd?: string
        text?: string
        metadataText?: string
        isMetadataOnly?: boolean
        model?: string
        blocks?: Array<{ type: string; text?: string; thinking?: string }>
        usage?: {
          input_tokens?: number
          output_tokens?: number
          cache_read_input_tokens?: number
          cache_creation_input_tokens?: number
        }
        isSidechain?: boolean
      }>
      messageCount: number
    }>
    sourcePath?: string
    error?: string
  }>
  readSession: (sessionId: string) => Promise<{
    success: boolean
    session?: {
      sessionId: string
      title: string
      cwd?: string
      firstSeen: string
      lastSeen: string
      filePaths: string[]
      events: Array<{
        id?: string
        kind: 'user' | 'assistant'
        uuid?: string
        at?: string
        sessionId?: string
        cwd?: string
        text?: string
        metadataText?: string
        isMetadataOnly?: boolean
        model?: string
        blocks?: Array<{ type: string; text?: string; thinking?: string }>
        usage?: {
          input_tokens?: number
          output_tokens?: number
          cache_read_input_tokens?: number
          cache_creation_input_tokens?: number
        }
        isSidechain?: boolean
      }>
      messageCount: number
    }
    error?: string
  }>
  startWatching: () => Promise<{ success: boolean }>
  stopWatching: () => Promise<{ success: boolean }>
  onSessionsChanged: (
    callback: (payload?: { type: string; session?: unknown; sessionId?: string }) => void,
  ) => () => void
  saveMarkdown: (payload: { filename: string; content: string }) => Promise<{
    success: boolean
    canceled?: boolean
    filePath?: string
    error?: string
  }>
  saveJson: (payload: { filename: string; content: string }) => Promise<{
    success: boolean
    canceled?: boolean
    filePath?: string
    error?: string
  }>
  saveZip: (payload: {
    filename: string
    files: Array<{ name: string; content: string }>
  }) => Promise<{
    success: boolean
    canceled?: boolean
    filePath?: string
    error?: string
  }>
  shareFile: (payload: { filename: string; extension: string; content: string }) => Promise<{
    success: boolean
    filePath?: string
    shareShown?: boolean
    error?: string
  }>
  showContextMenu: (payload: { filename: string; markdown: string; json: string }) => Promise<{
    success: boolean
  }>
  onMenuAction: (callback: (payload: { action: string }) => void) => () => void
  getFavorites: () => Promise<{
    success: boolean
    favorites?: {
      version: number
      ratings: Record<string, { rating: 'up' | 'down'; updatedAt?: string; snapshot?: unknown }>
      notes?: Record<string, { text: string; updatedAt?: string; snapshot?: unknown }>
      highlights?: Record<string, { enabled: boolean; updatedAt?: string; snapshot?: unknown }>
      todos?: Record<string, { enabled: boolean; updatedAt?: string; snapshot?: unknown }>
      bookmarks?: Record<string, { pinned: boolean; updatedAt?: string }>
    }
    error?: string
  }>
  setFavorite: (payload: {
    id: string
    rating: 'up' | 'down' | null
    snapshot?: unknown
  }) => Promise<{
    success: boolean
    favorites?: {
      version: number
      ratings: Record<string, { rating: 'up' | 'down'; updatedAt?: string; snapshot?: unknown }>
      notes?: Record<string, { text: string; updatedAt?: string; snapshot?: unknown }>
      highlights?: Record<string, { enabled: boolean; updatedAt?: string; snapshot?: unknown }>
      todos?: Record<string, { enabled: boolean; updatedAt?: string; snapshot?: unknown }>
      bookmarks?: Record<string, { pinned: boolean; updatedAt?: string }>
    }
    error?: string
  }>
  setNote: (payload: { id: string; text: string; snapshot?: unknown }) => Promise<{
    success: boolean
    favorites?: {
      version: number
      ratings: Record<string, { rating: 'up' | 'down'; updatedAt?: string; snapshot?: unknown }>
      notes?: Record<string, { text: string; updatedAt?: string; snapshot?: unknown }>
      highlights?: Record<string, { enabled: boolean; updatedAt?: string; snapshot?: unknown }>
      todos?: Record<string, { enabled: boolean; updatedAt?: string; snapshot?: unknown }>
      bookmarks?: Record<string, { pinned: boolean; updatedAt?: string }>
    }
    error?: string
  }>
  setHighlight: (payload: { id: string; enabled: boolean; snapshot?: unknown }) => Promise<{
    success: boolean
    favorites?: {
      version: number
      ratings: Record<string, { rating: 'up' | 'down'; updatedAt?: string; snapshot?: unknown }>
      notes?: Record<string, { text: string; updatedAt?: string; snapshot?: unknown }>
      highlights?: Record<string, { enabled: boolean; updatedAt?: string; snapshot?: unknown }>
      todos?: Record<string, { enabled: boolean; updatedAt?: string; snapshot?: unknown }>
      bookmarks?: Record<string, { pinned: boolean; updatedAt?: string }>
    }
    error?: string
  }>
  setTodo: (payload: { id: string; enabled: boolean; snapshot?: unknown }) => Promise<{
    success: boolean
    favorites?: {
      version: number
      ratings: Record<string, { rating: 'up' | 'down'; updatedAt?: string; snapshot?: unknown }>
      notes?: Record<string, { text: string; updatedAt?: string; snapshot?: unknown }>
      highlights?: Record<string, { enabled: boolean; updatedAt?: string; snapshot?: unknown }>
      todos?: Record<string, { enabled: boolean; updatedAt?: string; snapshot?: unknown }>
      bookmarks?: Record<string, { pinned: boolean; updatedAt?: string }>
    }
    error?: string
  }>
  setBookmark: (payload: { sessionId: string; pinned: boolean }) => Promise<{
    success: boolean
    favorites?: {
      version: number
      ratings: Record<string, { rating: 'up' | 'down'; updatedAt?: string; snapshot?: unknown }>
      notes?: Record<string, { text: string; updatedAt?: string; snapshot?: unknown }>
      highlights?: Record<string, { enabled: boolean; updatedAt?: string; snapshot?: unknown }>
      todos?: Record<string, { enabled: boolean; updatedAt?: string; snapshot?: unknown }>
      bookmarks?: Record<string, { pinned: boolean; updatedAt?: string }>
    }
    error?: string
  }>
}

declare global {
  interface Window {
    electron?: ElectronAPI
  }
}
