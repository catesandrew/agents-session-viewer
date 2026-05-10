const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require("electron")
const path = require("path")
const fs = require("fs").promises
const archiver = require("archiver")
const chokidar = require("chokidar")
const os = require("os")
const readline = require("readline")
const { createReadStream, createWriteStream } = require("fs")

let mainWindow
let fileWatcher
let pendingChangeTimer
const fileCache = new Map()
const sessionFiles = new Map()
const fileDebounceTimers = new Map()
const summaryCache = new Map()
let isAppReady = false
const FAVORITES_FILE = path.join(app.getPath("userData"), "favorites.json")
const SUMMARY_CACHE_FILE = path.join(app.getPath("userData"), "session-summary-cache.json")
const SUMMARY_SCAN_MAX_LINES = 40
const LARGE_SESSION_THRESHOLD_BYTES = 16 * 1024 * 1024
const RECENT_SESSION_READ_BYTES = 8 * 1024 * 1024
const RECENT_SESSION_MAX_EVENTS = 400
const HIDDEN_METADATA_BLOCK_RE = /^<(subagent_notification|skill|turn_aborted|hook_prompt)\b/i
let summaryCacheLoaded = false
let pendingSummarySave = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#0a0a0a",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  })

  const devURL = process.env.ELECTRON_START_URL || (app.isPackaged ? null : "http://localhost:3000")
  const startURL = devURL || `file://${path.join(__dirname, "../out/index.html")}`
  mainWindow.loadURL(startURL)

  if (process.env.ELECTRON_START_URL) {
    mainWindow.webContents.openDevTools()
  }
}

app.whenReady().then(() => {
  isAppReady = true
  createWindow()
  if (process.platform === "darwin") {
    Menu.setApplicationMenu(buildAppMenu())
  }
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

function sanitizeFilename(name, fallback = "codex-export") {
  if (typeof name !== "string" || !name.trim()) return fallback
  const cleaned = name.replace(/[\\/:"*?<>|]+/g, "-").replace(/\s+/g, " ").trim()
  return cleaned || fallback
}

function getSessionKey(file) {
  return file.sessionId || file.name
}

function updateSessionFiles(sessionKey, filePath, remove = false) {
  if (!sessionKey) return
  let set = sessionFiles.get(sessionKey)
  if (!set) {
    if (remove) return
    set = new Set()
    sessionFiles.set(sessionKey, set)
  }
  if (remove) {
    set.delete(filePath)
    if (set.size === 0) sessionFiles.delete(sessionKey)
    return
  }
  set.add(filePath)
}

function primeCaches(files) {
  fileCache.clear()
  sessionFiles.clear()
  files.forEach((file) => {
    const sessionKey = getSessionKey(file)
    fileCache.set(file.path, { ...file, sessionKey })
    updateSessionFiles(sessionKey, file.path, false)
  })
}

function truncateTitle(text, fallback) {
  const trimmed = typeof text === "string" ? text.trim() : ""
  if (!trimmed) return fallback
  return trimmed.substring(0, 80) + (trimmed.length > 80 ? "..." : "")
}

function buildSessionFromCache(sessionKey) {
  const paths = sessionFiles.get(sessionKey)
  if (!paths || paths.size === 0) return null

  const session = {
    sessionId: sessionKey,
    title: "",
    cwd: undefined,
    firstSeen: undefined,
    lastSeen: undefined,
    filePaths: [],
    events: [],
    messageCount: 0,
    summaryReady: true,
    hydrated: true,
    previewTitle: "",
    truncated: false,
  }
  let hasPendingSummary = false

  paths.forEach((filePath) => {
    const file = fileCache.get(filePath)
    if (!file) return
    session.filePaths.push(file.path)
    if (!session.cwd && file.cwd) {
      session.cwd = file.cwd
    }
    if (file.hydrated === false) {
      session.hydrated = false
    }
    if (file.summaryReady === false) {
      session.summaryReady = false
      hasPendingSummary = true
    }
    if (file.truncated === true) {
      session.truncated = true
    }
    if (file.previewTitle && !session.previewTitle) {
      session.previewTitle = file.previewTitle
    }
    if (file.hydrated === true) {
      const events = file.events.filter(filterConversationEvent)
      session.events.push(...events)
    } else if (typeof file.messageCount === "number" && file.messageCount >= 0) {
      session.messageCount += file.messageCount
    }

    if (!session.firstSeen || new Date(file.firstSeen).getTime() < new Date(session.firstSeen).getTime()) {
      session.firstSeen = file.firstSeen
    }
    if (!session.lastSeen || new Date(file.lastSeen).getTime() > new Date(session.lastSeen).getTime()) {
      session.lastSeen = file.lastSeen
    }
  })

  session.events.sort((a, b) => {
    const aTime = a.at ? new Date(a.at).getTime() : 0
    const bTime = b.at ? new Date(b.at).getTime() : 0
    return aTime - bTime
  })

  session.events = session.events.map((event) =>
    event.sessionId ? event : { ...event, sessionId: session.sessionId },
  )

  const firstEventTime = session.events[0]?.at || session.firstSeen
  const lastEventTime = session.events[session.events.length - 1]?.at || session.lastSeen
  session.firstSeen = firstEventTime
  session.lastSeen = lastEventTime
  if (session.events.length > 0) {
    session.messageCount = session.events.filter((event) => !(event.kind === "user" && event.isMetadataOnly)).length
  } else if (hasPendingSummary) {
    session.messageCount = -1
  }

  const firstUserMessage = session.events.find((e) => e.kind === "user" && e.text)?.text || ""
  if (firstUserMessage) {
    session.title = truncateTitle(firstUserMessage, session.sessionId)
  } else if (session.previewTitle) {
    session.title = session.previewTitle
  } else if (session.cwd) {
    session.title = path.basename(session.cwd)
  } else {
    session.title = session.sessionId
  }

  delete session.previewTitle
  return session
}

function sendSessionUpdate(sessionKey) {
  if (!mainWindow) return
  const session = buildSessionFromCache(sessionKey)
  if (!session) {
    mainWindow.webContents.send("sessions-changed", { type: "session-removed", sessionId: sessionKey })
    return
  }
  mainWindow.webContents.send("sessions-changed", { type: "session-updated", session })
}

async function buildFileInfo(filePath, options = {}) {
  const stats = await fs.stat(filePath)
  const full = options.full === true

  if (full) {
    const shouldTruncate = options.allowTruncate !== false && stats.size > LARGE_SESSION_THRESHOLD_BYTES
    const { events, meta } = shouldTruncate
      ? await parseRecentJSONLFile(filePath, options.summaryMeta)
      : await parseJSONLFile(filePath)
    const filteredEvents = events.filter(filterConversationEvent)
    const firstUserMessage = filteredEvents.find((event) => event.kind === "user" && event.text)?.text || ""
    return {
      path: filePath,
      name: path.basename(filePath),
      modified: stats.mtime.toISOString(),
      sessionId: meta.sessionId,
      cwd: meta.cwd,
      firstSeen: meta.startedAt || filteredEvents[0]?.at || stats.mtime.toISOString(),
      lastSeen: stats.mtime.toISOString(),
      events,
      hydrated: true,
      summaryReady: true,
      truncated: shouldTruncate,
      messageCount: filteredEvents.filter((event) => !(event.kind === "user" && event.isMetadataOnly)).length,
      previewTitle: truncateTitle(firstUserMessage, ""),
    }
  }

  if (!summaryCacheLoaded) {
    await loadSummaryCache()
  }

  const cachedSummary = getCachedSummary(filePath, stats)
  if (cachedSummary) {
    return {
      path: filePath,
      name: path.basename(filePath),
      modified: stats.mtime.toISOString(),
      sessionId: cachedSummary.sessionId,
      cwd: cachedSummary.cwd,
      firstSeen: cachedSummary.firstSeen || stats.mtime.toISOString(),
      lastSeen: stats.mtime.toISOString(),
      events: [],
      hydrated: false,
      summaryReady: true,
      truncated: false,
      messageCount: cachedSummary.messageCount,
      previewTitle: cachedSummary.previewTitle || "",
    }
  }

  const { meta, previewTitle } = await parseJSONLFileSummary(filePath)
  return {
    path: filePath,
    name: path.basename(filePath),
    modified: stats.mtime.toISOString(),
    sessionId: meta.sessionId,
    cwd: meta.cwd,
    firstSeen: meta.startedAt || stats.mtime.toISOString(),
    lastSeen: stats.mtime.toISOString(),
    events: [],
    hydrated: false,
    summaryReady: false,
    truncated: false,
    messageCount: -1,
    previewTitle,
  }
}

function hashString(input) {
  let hash = 5381
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) + hash + input.charCodeAt(i)
  }
  return (hash >>> 0).toString(36)
}

function buildEventId(kind, sessionId, timestamp, content) {
  const base = `${kind}|${sessionId || ""}|${timestamp || ""}|${content || ""}`
  return `${kind}_${hashString(base)}`
}

async function loadFavorites() {
  try {
    const raw = await fs.readFile(FAVORITES_FILE, "utf8")
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === "object") {
      return {
        version: parsed.version ?? 1,
        ratings: parsed.ratings ?? {},
        notes: parsed.notes ?? {},
        highlights: parsed.highlights ?? {},
        todos: parsed.todos ?? {},
        bookmarks: parsed.bookmarks ?? {},
      }
    }
  } catch (error) {
    return { version: 1, ratings: {}, notes: {}, highlights: {}, todos: {}, bookmarks: {} }
  }
  return { version: 1, ratings: {}, notes: {}, highlights: {}, todos: {}, bookmarks: {} }
}

async function saveFavorites(data) {
  await fs.mkdir(path.dirname(FAVORITES_FILE), { recursive: true })
  await fs.writeFile(FAVORITES_FILE, JSON.stringify(data, null, 2), "utf8")
}

async function loadSummaryCache() {
  if (summaryCacheLoaded) return
  summaryCacheLoaded = true

  try {
    const raw = await fs.readFile(SUMMARY_CACHE_FILE, "utf8")
    const parsed = JSON.parse(raw)
    Object.entries(parsed?.entries || {}).forEach(([filePath, entry]) => {
      summaryCache.set(filePath, entry)
    })
  } catch (error) {
    summaryCache.clear()
  }
}

function getCachedSummary(filePath, stats) {
  const entry = summaryCache.get(filePath)
  if (!entry) return null
  if (entry.size !== stats.size) return null
  if (entry.modified !== stats.mtime.toISOString()) return null
  return entry
}

function scheduleSummaryCacheSave() {
  if (pendingSummarySave) return
  pendingSummarySave = setTimeout(async () => {
    pendingSummarySave = null
    const entries = Object.fromEntries(summaryCache.entries())
    await fs.mkdir(path.dirname(SUMMARY_CACHE_FILE), { recursive: true })
    await fs.writeFile(SUMMARY_CACHE_FILE, JSON.stringify({ entries }, null, 2), "utf8")
  }, 250)
}

function updateSummaryCache(filePath, stats, summary) {
  summaryCache.set(filePath, {
    size: stats.size,
    modified: stats.mtime.toISOString(),
    sessionId: summary.sessionId,
    cwd: summary.cwd,
    firstSeen: summary.firstSeen,
    messageCount: summary.messageCount,
    previewTitle: summary.previewTitle,
  })
  scheduleSummaryCacheSave()
}
function showShareSheet(filePath) {
  if (process.platform !== "darwin" || !mainWindow) return false

  const sharingItem = {
    filePath,
    filePaths: [filePath],
  }

  try {
    if (typeof mainWindow.showShareMenu === "function") {
      mainWindow.showShareMenu(sharingItem)
      return true
    }
  } catch (error) {
    console.error("[v0] showShareMenu (window) failed:", error)
  }

  try {
    if (mainWindow.webContents && typeof mainWindow.webContents.showShareMenu === "function") {
      mainWindow.webContents.showShareMenu(sharingItem)
      return true
    }
  } catch (error) {
    console.error("[v0] showShareMenu (webContents) failed:", error)
  }

  try {
    const shareMenu = Menu.buildFromTemplate([
      {
        role: "shareMenu",
        sharingItem,
      },
    ])
    shareMenu.popup({ window: mainWindow })
    return true
  } catch (error) {
    console.error("[v0] shareMenu popup failed:", error)
  }

  return false
}

async function saveTextFile({ title, defaultName, extension, content }) {
  if (!mainWindow) return { success: false, error: "Window not ready" }

  const safeName = sanitizeFilename(defaultName)
  const defaultPath = path.join(app.getPath("documents"), `${safeName}.${extension}`)
  const result = await dialog.showSaveDialog(mainWindow, {
    title,
    defaultPath,
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
  })

  if (result.canceled || !result.filePath) {
    return { success: false, canceled: true }
  }

  await fs.writeFile(result.filePath, content, "utf8")
  if (process.platform === "darwin") {
    shell.showItemInFolder(result.filePath)
  }
  return { success: true, filePath: result.filePath }
}

async function saveZipFile({ title, defaultName, files }) {
  if (!mainWindow) return { success: false, error: "Window not ready" }

  const safeName = sanitizeFilename(defaultName)
  const defaultPath = path.join(app.getPath("documents"), `${safeName}.zip`)
  const result = await dialog.showSaveDialog(mainWindow, {
    title,
    defaultPath,
    filters: [{ name: "ZIP", extensions: ["zip"] }],
  })

  if (result.canceled || !result.filePath) {
    return { success: false, canceled: true }
  }

  const outputPath = result.filePath.endsWith(".zip") ? result.filePath : `${result.filePath}.zip`

  await new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath)
    const archive = archiver("zip", { zlib: { level: 9 } })

    output.on("close", resolve)
    output.on("error", reject)
    archive.on("warning", (error) => {
      if (error.code === "ENOENT") {
        console.warn("[v0] Zip warning:", error)
        return
      }
      reject(error)
    })
    archive.on("error", reject)

    archive.pipe(output)
    const safeFiles = Array.isArray(files) ? files : []
    safeFiles.forEach((file) => {
      if (!file?.name) return
      const content = typeof file.content === "string" ? file.content : ""
      archive.append(content, { name: file.name })
    })
    archive.finalize()
  })

  if (process.platform === "darwin") {
    shell.showItemInFolder(outputPath)
  }
  return { success: true, filePath: outputPath }
}

async function shareTempFile({ defaultName, extension, content }) {
  const safeName = sanitizeFilename(defaultName)
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-share-"))
  const filePath = path.join(tempDir, `${safeName}.${extension}`)
  await fs.writeFile(filePath, content, "utf8")

  if (process.platform === "darwin") {
    const shareShown = showShareSheet(filePath)
    if (!shareShown) {
      shell.showItemInFolder(filePath)
    }
    return { success: true, filePath, shareShown }
  }

  return { success: true, filePath, shareShown: false }
}

function buildAppMenu() {
  if (process.platform !== "darwin") {
    return Menu.buildFromTemplate([])
  }

  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "Export as Markdown",
          accelerator: "Command+S",
          click: () => mainWindow?.webContents.send("menu-action", { action: "export-markdown" }),
        },
        {
          label: "Export as JSON",
          accelerator: "Command+Shift+S",
          click: () => mainWindow?.webContents.send("menu-action", { action: "export-json" }),
        },
        {
          label: "Export session as ZIP",
          click: () => mainWindow?.webContents.send("menu-action", { action: "export-zip" }),
        },
        {
          label: "Share…",
          accelerator: "Command+E",
          click: () => mainWindow?.webContents.send("menu-action", { action: "share-markdown" }),
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forcereload" },
        { role: "toggledevtools" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      role: "window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Open Codex Sessions Folder",
          click: () => shell.openPath(path.join(os.homedir(), ".codex", "sessions")),
        },
      ],
    },
  ]

  return Menu.buildFromTemplate(template)
}

// IPC Handlers for file system access
ipcMain.handle("get-codex-path", () => {
  return path.join(os.homedir(), ".codex", "sessions")
})

const USER_REQUEST_MARKER = "My request for Codex:"

function coerceRole(value) {
  if (typeof value !== "string") return undefined
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined

  if (normalized === "user" || normalized === "human") return "user"
  if (normalized === "assistant" || normalized === "ai") return "assistant"

  if (normalized.startsWith("user_")) return "user"
  if (normalized.startsWith("assistant_")) return "assistant"

  if (normalized.includes("user") && normalized.includes("message")) return "user"
  if (normalized.includes("human") && normalized.includes("message")) return "user"
  if (normalized.includes("assistant") && normalized.includes("message")) return "assistant"

  return undefined
}

function resolveRole(line) {
  const payload = line.payload
  const message = line.message || (payload && payload.type === "message" ? payload : undefined)

  return (
    coerceRole(message?.role) ||
    coerceRole(message?.message?.role) ||
    coerceRole(payload?.role) ||
    coerceRole(payload?.message?.role) ||
    coerceRole(line.role) ||
    coerceRole(line.type)
  )
}

function resolveClaudeRole(line) {
  return (
    coerceRole(line?.role) ||
    coerceRole(line?.author) ||
    coerceRole(line?.sender) ||
    coerceRole(line?.type)
  )
}

function resolveContent(line, message) {
  if (message?.content !== undefined) return message.content
  if (message?.message?.content !== undefined) return message.message.content

  const payload = line.payload
  if (payload?.content !== undefined) return payload.content
  if (payload?.message?.content !== undefined) return payload.message.content

  if (line?.content !== undefined) return line.content
  if (line?.message?.content !== undefined) return line.message.content

  return undefined
}

function resolveClaudeContent(line) {
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

function resolveSessionId(line, meta) {
  return (
    line?.sessionId ||
    line?.session_id ||
    line?.conversation_id ||
    line?.thread_id ||
    line?.chat_id ||
    meta?.sessionId
  )
}

function resolveTimestamp(line) {
  return line?.timestamp || line?.created_at || line?.createdAt || line?.time
}

function isClaudeLine(line) {
  if (!line || typeof line !== "object") return false
  if (line.conversation_id || line.session_id || line.thread_id || line.chat_id) return true
  if (typeof line.model === "string" && line.model.toLowerCase().includes("claude")) return true
  if (line.type === "message" && line.role && line.content !== undefined && !line.message) return true
  if (line.author || line.sender) return true
  return false
}

function splitUserText(text) {
  const trimmed = (text || "").trim()
  if (!trimmed) return { text: "", metadataText: "", isMetadataOnly: false }

  const markerIndex = trimmed.indexOf(USER_REQUEST_MARKER)
  if (markerIndex !== -1) {
    const metadataText = trimmed.slice(0, markerIndex).trim()
    const requestText = trimmed.slice(markerIndex + USER_REQUEST_MARKER.length).trim()
    return {
      text: requestText,
      metadataText,
      isMetadataOnly: !requestText && !!metadataText,
    }
  }

  if (/^<environment_context>/i.test(trimmed)) {
    return { text: "", metadataText: trimmed, isMetadataOnly: true }
  }
  if (/^#?\s*Context from my IDE setup:/i.test(trimmed)) {
    return { text: "", metadataText: trimmed, isMetadataOnly: true }
  }
  if (/^#?\s*AGENTS\.md instructions/i.test(trimmed)) {
    return { text: "", metadataText: trimmed, isMetadataOnly: true }
  }
  if (/^<INSTRUCTIONS>/i.test(trimmed)) {
    return { text: "", metadataText: trimmed, isMetadataOnly: true }
  }
  if (HIDDEN_METADATA_BLOCK_RE.test(trimmed)) {
    return { text: "", metadataText: trimmed, isMetadataOnly: true }
  }

  return { text: trimmed, metadataText: "", isMetadataOnly: false }
}

function isAssistantMetaEvent(event) {
  if (event.kind !== "assistant") return false

  const rawPayload = event.raw?.payload
  if (rawPayload?.phase === "commentary") return true

  const text = event.blocks
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n\n")
    .trim()

  if (!text) return false
  if (HIDDEN_METADATA_BLOCK_RE.test(text)) return true
  return false
}

function extractTextFromContent(content) {
  if (typeof content === "string") return content
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const obj = content
    if (typeof obj.text === "string") return obj.text
    if (typeof obj.content === "string") return obj.content
    if (typeof obj.input_text === "string") return obj.input_text
    if (typeof obj.output_text === "string") return obj.output_text
    if (typeof obj.completion === "string") return obj.completion
    if (typeof obj.delta?.text === "string") return obj.delta.text
    if (typeof obj.delta?.content === "string") return obj.delta.content
  }
  if (!Array.isArray(content)) return ""

  return content
    .filter((block) => block?.type !== "tool_result")
    .map((block) => {
      if (typeof block?.text === "string") return block.text
      if (typeof block?.content === "string") return block.content
      if (typeof block?.input_text === "string") return block.input_text
      if (typeof block?.output_text === "string") return block.output_text
      if (block?.content && typeof block.content === "object") {
        if (typeof block.content.text === "string") return block.content.text
        if (typeof block.content.content === "string") return block.content.content
      }
      return ""
    })
    .filter((blockText) => blockText.trim())
    .join("\n\n")
}

function extractBlocksFromContent(content) {
  if (typeof content === "string") {
    return [{ type: "text", text: content }]
  }
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const text = extractTextFromContent(content)
    return text ? [{ type: "text", text }] : []
  }
  if (!Array.isArray(content)) return []

  const blocks = []
  content.forEach((block) => {
    if (block?.type === "thinking" && block.thinking) {
      blocks.push({ type: "thinking", thinking: block.thinking })
      return
    }
    if (block?.type === "tool_result") return

    if (typeof block?.text === "string") {
      blocks.push({ type: "text", text: block.text })
      return
    }
    if (typeof block?.input_text === "string") {
      blocks.push({ type: "text", text: block.input_text })
      return
    }
    if (typeof block?.output_text === "string") {
      blocks.push({ type: "text", text: block.output_text })
      return
    }
    if (typeof block?.content === "string") {
      blocks.push({ type: "text", text: block.content })
      return
    }
    if (block?.content && typeof block.content === "object") {
      if (typeof block.content.text === "string") {
        blocks.push({ type: "text", text: block.content.text })
        return
      }
      if (typeof block.content.content === "string") {
        blocks.push({ type: "text", text: block.content.content })
      }
    }
  })
  return blocks
}

function normalizeEvent(line, meta) {
  const timestampValue = resolveTimestamp(line) || line.timestamp
  const timestamp = timestampValue ? new Date(timestampValue).toISOString() : undefined
  const payload = line.payload
  const message = line.message || (payload && payload.type === "message" ? payload : undefined)
  const sessionId = resolveSessionId(line, meta)
  const cwd = line.cwd || meta.cwd
  const isSidechain = line.isSidechain === true

  const normalizeCodexEvent = () => {
    const role = resolveRole(line)
    const content = resolveContent(line, message)

    if (role === "user") {
      const rawText = extractTextFromContent(content)
      const { text, metadataText, isMetadataOnly } = splitUserText(rawText)
      const id = line.uuid || buildEventId("user", sessionId, timestamp, rawText || text)
      return {
        id,
        kind: "user",
        uuid: line.uuid,
        at: timestamp,
        sessionId,
        cwd,
        text,
        metadataText,
        isMetadataOnly,
        isSidechain,
        raw: line,
      }
    }

    if (role === "assistant") {
      const blocks = extractBlocksFromContent(content)
      const blockText = blocks
        .filter((block) => block.type === "text" && block.text)
        .map((block) => block.text)
        .join("\n\n")
      const id = line.uuid || buildEventId("assistant", sessionId, timestamp, blockText)
      return {
        id,
        kind: "assistant",
        uuid: line.uuid,
        at: timestamp,
        sessionId,
        model: message?.model,
        blocks,
        usage: message?.usage,
        isSidechain,
        raw: line,
      }
    }

    return null
  }

  const normalizeClaudeEvent = () => {
    const role = resolveClaudeRole(line)
    const content = resolveClaudeContent(line)
    const model = line?.model || line?.message?.model

    if (role === "user") {
      const rawText = extractTextFromContent(content)
      const { text, metadataText, isMetadataOnly } = splitUserText(rawText)
      const id = line.uuid || buildEventId("user", sessionId, timestamp, rawText || text)
      return {
        id,
        kind: "user",
        uuid: line.uuid,
        at: timestamp,
        sessionId,
        cwd,
        text,
        metadataText,
        isMetadataOnly,
        isSidechain,
        raw: line,
      }
    }

    if (role === "assistant") {
      const blocks = extractBlocksFromContent(content)
      const blockText = blocks
        .filter((block) => block.type === "text" && block.text)
        .map((block) => block.text)
        .join("\n\n")
      const id = line.uuid || buildEventId("assistant", sessionId, timestamp, blockText)
      return {
        id,
        kind: "assistant",
        uuid: line.uuid,
        at: timestamp,
        sessionId,
        model,
        blocks,
        isSidechain,
        raw: line,
      }
    }

    return null
  }

  let normalized = isClaudeLine(line) ? normalizeClaudeEvent() : normalizeCodexEvent()
  if (!normalized) {
    normalized = normalizeClaudeEvent() || normalizeCodexEvent()
  }

  return normalized
}

async function parseJSONLFile(filePath) {
  const events = []
  const meta = {
    sessionId: undefined,
    cwd: undefined,
    startedAt: undefined,
  }

  const fileStream = createReadStream(filePath)
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Number.POSITIVE_INFINITY,
  })

  let lineNumber = 0
  for await (const line of rl) {
    lineNumber++
    if (!line.trim()) continue

    try {
      const parsed = JSON.parse(line)

      if (parsed.type === "session_meta" && parsed.payload) {
        meta.sessionId = parsed.payload.id || meta.sessionId
        meta.cwd = parsed.payload.cwd || meta.cwd
        meta.startedAt = parsed.payload.timestamp || parsed.timestamp || meta.startedAt
        continue
      }

      if (!meta.sessionId) {
        meta.sessionId =
          parsed.sessionId ||
          parsed.session_id ||
          parsed.conversation_id ||
          parsed.thread_id ||
          parsed.chat_id ||
          meta.sessionId
      }
      if (!meta.startedAt) {
        meta.startedAt = parsed.created_at || parsed.createdAt || parsed.timestamp || meta.startedAt
      }
      if (!meta.cwd && parsed.cwd) {
        meta.cwd = parsed.cwd
      }

      const normalized = normalizeEvent(parsed, meta)
      if (normalized) {
        events.push(normalized)
      }
    } catch (error) {
      console.error(`[v0] Failed to parse line ${lineNumber} in ${filePath}:`, error.message)
    }
  }

  return { events, meta }
}

async function parseJSONLFileSummary(filePath) {
  const meta = {
    sessionId: undefined,
    cwd: undefined,
    startedAt: undefined,
  }
  let previewTitle = ""

  const fileStream = createReadStream(filePath)
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Number.POSITIVE_INFINITY,
  })

  let lineNumber = 0
  try {
    for await (const line of rl) {
      lineNumber++
      if (!line.trim()) continue

      try {
        const parsed = JSON.parse(line)

        if (parsed.type === "session_meta" && parsed.payload) {
          meta.sessionId = parsed.payload.id || meta.sessionId
          meta.cwd = parsed.payload.cwd || meta.cwd
          meta.startedAt = parsed.payload.timestamp || parsed.timestamp || meta.startedAt
          if (previewTitle) break
          continue
        }

        if (!meta.sessionId) {
          meta.sessionId =
            parsed.sessionId ||
            parsed.session_id ||
            parsed.conversation_id ||
            parsed.thread_id ||
            parsed.chat_id ||
            meta.sessionId
        }
        if (!meta.startedAt) {
          meta.startedAt = parsed.created_at || parsed.createdAt || parsed.timestamp || meta.startedAt
        }
        if (!meta.cwd && parsed.cwd) {
          meta.cwd = parsed.cwd
        }

        const normalized = normalizeEvent(parsed, meta)
        if (!previewTitle && normalized?.kind === "user" && normalized.text) {
          previewTitle = truncateTitle(normalized.text, "")
          break
        }
      } catch (error) {
        console.error(`[v0] Failed to parse summary line ${lineNumber} in ${filePath}:`, error.message)
      }

      if (lineNumber >= SUMMARY_SCAN_MAX_LINES && (meta.sessionId || meta.cwd || previewTitle)) {
        break
      }
    }
  } finally {
    rl.close()
    fileStream.destroy()
  }

  return { meta, previewTitle }
}

async function countSessionSummary(filePath, seedMeta = {}) {
  const meta = {
    sessionId: seedMeta.sessionId,
    cwd: seedMeta.cwd,
    startedAt: seedMeta.startedAt,
  }
  let previewTitle = seedMeta.previewTitle || ""
  let messageCount = 0

  const fileStream = createReadStream(filePath)
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Number.POSITIVE_INFINITY,
  })

  try {
    for await (const line of rl) {
      if (!line.trim()) continue

      try {
        const parsed = JSON.parse(line)

        if (parsed.type === "session_meta" && parsed.payload) {
          meta.sessionId = parsed.payload.id || meta.sessionId
          meta.cwd = parsed.payload.cwd || meta.cwd
          meta.startedAt = parsed.payload.timestamp || parsed.timestamp || meta.startedAt
          continue
        }

        if (!meta.sessionId) {
          meta.sessionId =
            parsed.sessionId ||
            parsed.session_id ||
            parsed.conversation_id ||
            parsed.thread_id ||
            parsed.chat_id ||
            meta.sessionId
        }
        if (!meta.startedAt) {
          meta.startedAt = parsed.created_at || parsed.createdAt || parsed.timestamp || meta.startedAt
        }
        if (!meta.cwd && parsed.cwd) {
          meta.cwd = parsed.cwd
        }

        const normalized = normalizeEvent(parsed, meta)
        if (!normalized || !filterConversationEvent(normalized)) continue

        if (!previewTitle && normalized.kind === "user" && normalized.text) {
          previewTitle = truncateTitle(normalized.text, "")
        }

        messageCount += 1
      } catch (error) {
        console.error(`[v0] Failed to count summary line in ${filePath}:`, error.message)
      }
    }
  } finally {
    rl.close()
    fileStream.destroy()
  }

  return {
    sessionId: meta.sessionId,
    cwd: meta.cwd,
    firstSeen: meta.startedAt,
    messageCount,
    previewTitle,
  }
}

async function parseRecentJSONLFile(filePath, summaryMeta = {}) {
  const stats = await fs.stat(filePath)
  const start = Math.max(0, stats.size - RECENT_SESSION_READ_BYTES)
  const bytesToRead = stats.size - start
  const handle = await fs.open(filePath, "r")

  try {
    const buffer = Buffer.alloc(bytesToRead)
    await handle.read(buffer, 0, bytesToRead, start)

    let text = buffer.toString("utf8")
    if (start > 0) {
      const firstNewline = text.indexOf("\n")
      text = firstNewline === -1 ? "" : text.slice(firstNewline + 1)
    }

    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)

    const meta = {
      sessionId: summaryMeta.sessionId,
      cwd: summaryMeta.cwd,
      startedAt: summaryMeta.startedAt,
    }
    const events = []

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line)

        if (parsed.type === "session_meta" && parsed.payload) {
          meta.sessionId = parsed.payload.id || meta.sessionId
          meta.cwd = parsed.payload.cwd || meta.cwd
          meta.startedAt = parsed.payload.timestamp || parsed.timestamp || meta.startedAt
          continue
        }

        if (!meta.sessionId) {
          meta.sessionId =
            parsed.sessionId ||
            parsed.session_id ||
            parsed.conversation_id ||
            parsed.thread_id ||
            parsed.chat_id ||
            meta.sessionId
        }
        if (!meta.startedAt) {
          meta.startedAt = parsed.created_at || parsed.createdAt || parsed.timestamp || meta.startedAt
        }
        if (!meta.cwd && parsed.cwd) {
          meta.cwd = parsed.cwd
        }

        const normalized = normalizeEvent(parsed, meta)
        if (normalized) {
          events.push(normalized)
        }
      } catch (error) {
        console.error(`[v0] Failed to parse recent line in ${filePath}:`, error.message)
      }
    }

    return { events: events.slice(-RECENT_SESSION_MAX_EVENTS), meta }
  } finally {
    await handle.close()
  }
}

async function warmSummaryCounts(files) {
  for (const file of files) {
    if (file.hydrated === true || file.summaryReady !== false) continue

    try {
      const stats = await fs.stat(file.path)
      const summary = await countSessionSummary(file.path, {
        sessionId: file.sessionId,
        cwd: file.cwd,
        startedAt: file.firstSeen,
        previewTitle: file.previewTitle,
      })

      updateSummaryCache(file.path, stats, summary)

      const cached = fileCache.get(file.path)
      if (!cached) continue

      const sessionKey = getSessionKey(cached)
      fileCache.set(file.path, {
        ...cached,
        sessionId: summary.sessionId || cached.sessionId,
        cwd: summary.cwd || cached.cwd,
        firstSeen: summary.firstSeen || cached.firstSeen,
        messageCount: summary.messageCount,
        previewTitle: summary.previewTitle || cached.previewTitle,
        summaryReady: true,
      })
      sendSessionUpdate(sessionKey)
    } catch (error) {
      console.error("[v0] Failed to warm summary count for", file.path, error)
    }
  }
}

function toISOStringFromEpoch(value) {
  if (value === null || value === undefined) return undefined
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString()
  }
  if (typeof value === "string" && value.trim()) {
    const asNumber = Number(value)
    if (Number.isFinite(asNumber)) {
      return new Date(asNumber * 1000).toISOString()
    }
    const asDate = new Date(value)
    if (!Number.isNaN(asDate.getTime())) {
      return asDate.toISOString()
    }
  }
  return undefined
}

function extractOpenAIText(message) {
  const content = message?.content
  if (!content) return ""
  if (typeof content === "string") return content

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part
        if (part && typeof part === "object") {
          if (typeof part.text === "string") return part.text
          if (typeof part.content === "string") return part.content
        }
        return ""
      })
      .filter((part) => part.trim())
      .join("\n\n")
  }

  if (typeof content === "object") {
    if (typeof content.text === "string") return content.text
    if (typeof content.content === "string") return content.content
    if (Array.isArray(content.parts)) {
      return content.parts
        .map((part) => {
          if (typeof part === "string") return part
          if (part && typeof part === "object") {
            if (typeof part.text === "string") return part.text
            if (typeof part.content === "string") return part.content
          }
          return ""
        })
        .filter((part) => part.trim())
        .join("\n\n")
    }
  }

  return ""
}

function buildOpenAIMessageEvent(node, sessionId) {
  const message = node?.message
  const role = message?.author?.role
  if (!message || typeof role !== "string") return null

  const normalizedRole = role.toLowerCase()
  if (normalizedRole !== "user" && normalizedRole !== "assistant") return null

  const timestamp = toISOStringFromEpoch(message.create_time)
  const text = extractOpenAIText(message)
  const id = message.id || node?.id || buildEventId(normalizedRole, sessionId, timestamp, text)

  if (normalizedRole === "user") {
    return {
      id,
      kind: "user",
      at: timestamp,
      sessionId,
      text,
      metadataText: "",
      isMetadataOnly: false,
    }
  }

  const blocks = text ? [{ type: "text", text }] : []
  return {
    id,
    kind: "assistant",
    at: timestamp,
    sessionId,
    blocks,
  }
}

function resolveOpenAIStartNode(mapping, currentNodeId) {
  if (currentNodeId && mapping?.[currentNodeId]) return currentNodeId

  let fallbackId = null
  let latestTime = -Infinity
  Object.entries(mapping || {}).forEach(([id, node]) => {
    const time = node?.message?.create_time
    if (typeof time === "number" && time > latestTime) {
      latestTime = time
      fallbackId = node?.id || id || null
    }
  })

  return fallbackId
}

function buildOpenAIPath(mapping, startNodeId) {
  const pathIds = []
  let cursor = startNodeId
  const seen = new Set()

  while (cursor && mapping?.[cursor] && !seen.has(cursor)) {
    seen.add(cursor)
    pathIds.push(cursor)
    cursor = mapping[cursor]?.parent
  }

  return pathIds.reverse()
}

function normalizeOpenAIConversation(conversation, sourcePath) {
  if (!conversation || typeof conversation !== "object") return null

  const sessionId =
    conversation.id ||
    conversation.conversation_id ||
    conversation.uuid ||
    conversation.session_id ||
    `openai_${hashString(`${conversation.title || ""}|${conversation.create_time || ""}`)}`

  const mapping = conversation.mapping || {}
  const startNodeId = resolveOpenAIStartNode(mapping, conversation.current_node)
  const pathIds = buildOpenAIPath(mapping, startNodeId)

  const events = pathIds
    .map((id) => buildOpenAIMessageEvent(mapping[id], sessionId))
    .filter(Boolean)
    .filter(filterConversationEvent)

  const createdAt = toISOStringFromEpoch(conversation.create_time)
  const updatedAt = toISOStringFromEpoch(conversation.update_time)
  const firstEventTime = events[0]?.at || createdAt
  const lastEventTime = events[events.length - 1]?.at || updatedAt || firstEventTime

  let title = typeof conversation.title === "string" ? conversation.title.trim() : ""
  if (!title) {
    const firstUser = events.find((event) => event.kind === "user" && event.text)?.text
    if (firstUser) {
      title = firstUser.substring(0, 80) + (firstUser.length > 80 ? "..." : "")
    } else {
      title = sessionId
    }
  }

  return {
    sessionId,
    title,
    cwd: undefined,
    firstSeen: firstEventTime,
    lastSeen: lastEventTime,
    filePaths: sourcePath ? [sourcePath] : [],
    events,
    messageCount: events.length,
  }
}

async function parseOpenAIConversationsFile(filePath) {
  const sessions = []
  const stats = await fs.stat(filePath)
  const startedAt = Date.now()

  console.log("[v0] Parsing ChatGPT conversations.json ...")

  if (stats.size <= 120 * 1024 * 1024) {
    const raw = await fs.readFile(filePath, "utf8")
    const data = JSON.parse(raw)
    data.forEach((conversation) => {
      const session = normalizeOpenAIConversation(conversation, filePath)
      if (session) sessions.push(session)
    })
  } else {
    await streamJsonArray(
      filePath,
      (conversation) => {
        const session = normalizeOpenAIConversation(conversation, filePath)
        if (session) sessions.push(session)
      },
      stats.size,
    )
  }

  const elapsedMs = Date.now() - startedAt
  console.log("[v0] Parsed ChatGPT export:", sessions.length, "conversations in", `${elapsedMs}ms`)

  sessions.sort((a, b) => {
    const aTime = a.lastSeen ? new Date(a.lastSeen).getTime() : 0
    const bTime = b.lastSeen ? new Date(b.lastSeen).getTime() : 0
    return bTime - aTime
  })

  return sessions
}

function streamJsonArray(filePath, onItem, totalBytes) {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { encoding: "utf8" })
    let buffer = ""
    let started = false
    let inString = false
    let escape = false
    let depth = 0
    let objStart = -1
    let scanIndex = 0
    let bytesRead = 0
    let lastLog = Date.now()

    stream.on("data", (chunk) => {
      bytesRead += chunk.length
      buffer += chunk
      let i = scanIndex

      while (i < buffer.length) {
        const char = buffer[i]

        if (!started) {
          if (char === "[") started = true
          i += 1
          continue
        }

        if (objStart === -1) {
          if (char === "{") {
            objStart = i
            depth = 1
            inString = false
            escape = false
          }
          i += 1
          continue
        }

        if (inString) {
          if (escape) {
            escape = false
          } else if (char === "\\") {
            escape = true
          } else if (char === '"') {
            inString = false
          }
          i += 1
          continue
        }

        if (char === '"') {
          inString = true
          i += 1
          continue
        }

        if (char === "{") {
          depth += 1
          i += 1
          continue
        }

        if (char === "}") {
          depth -= 1
          if (depth === 0 && objStart !== -1) {
            const objText = buffer.slice(objStart, i + 1)
            try {
              const parsed = JSON.parse(objText)
              onItem(parsed)
            } catch (error) {
              console.error(`[v0] Failed to parse OpenAI conversation chunk:`, error.message)
            }
            buffer = buffer.slice(i + 1)
            i = 0
            scanIndex = 0
            objStart = -1
            continue
          }
        }

        i += 1
      }

      scanIndex = i

      if (objStart === -1 && scanIndex > 1_000_000) {
        buffer = buffer.slice(scanIndex)
        scanIndex = 0
      } else if (objStart > 1_000_000) {
        buffer = buffer.slice(objStart)
        scanIndex = scanIndex - objStart
        objStart = 0
      }

      const now = Date.now()
      if (totalBytes && now - lastLog > 2000) {
        const percent = ((bytesRead / totalBytes) * 100).toFixed(1)
        console.log("[v0] Parsing progress:", `${percent}%`)
        lastLog = now
      }
    })

    stream.on("end", () => resolve())
    stream.on("error", (error) => reject(error))
  })
}

async function findConversationsJson(startPath) {
  const stats = await fs.stat(startPath)
  if (stats.isFile()) {
    return path.basename(startPath).toLowerCase() === "conversations.json" ? startPath : null
  }

  const entries = await fs.readdir(startPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(startPath, entry.name)
    if (entry.isFile() && entry.name.toLowerCase() === "conversations.json") {
      return fullPath
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const fullPath = path.join(startPath, entry.name)
    const found = await findConversationsJson(fullPath)
    if (found) return found
  }

  return null
}

function filterConversationEvent(event) {
  if (event.kind === "other") return false
  if (event.isSidechain === true) return false
  if (event.kind === "user" && event.isMetadataOnly) return false
  if (
    event.kind === "user" &&
    (!event.text || !event.text.trim()) &&
    (!event.metadataText || !event.metadataText.trim())
  )
    return false
  if (isAssistantMetaEvent(event)) return false
  if (event.kind === "assistant" && event.blocks.filter((b) => b.type === "text").length === 0) return false
  return true
}

function groupSessionsBySessionId(files) {
  const sessionMap = new Map()

  files.forEach((file) => {
    const sessionId = file.sessionId || file.name
    const events = file.events.filter(filterConversationEvent)

    if (!sessionMap.has(sessionId)) {
      sessionMap.set(sessionId, {
        sessionId,
        title: "",
        cwd: file.cwd,
        firstSeen: file.firstSeen,
        lastSeen: file.lastSeen,
        filePaths: [],
        events: [],
        messageCount: 0,
      })
    }

    const session = sessionMap.get(sessionId)
    if (!session.filePaths.includes(file.path)) {
      session.filePaths.push(file.path)
    }
    if (!session.cwd && file.cwd) {
      session.cwd = file.cwd
    }
    session.events.push(...events)
  })

  sessionMap.forEach((session) => {
    session.events.sort((a, b) => {
      const aTime = a.at ? new Date(a.at).getTime() : 0
      const bTime = b.at ? new Date(b.at).getTime() : 0
      return aTime - bTime
    })

    session.events = session.events.map((event) =>
      event.sessionId ? event : { ...event, sessionId: session.sessionId },
    )

    const firstEventTime = session.events[0]?.at || session.firstSeen
    const lastEventTime = session.events[session.events.length - 1]?.at || session.lastSeen
    session.firstSeen = firstEventTime
    session.lastSeen = lastEventTime
    session.messageCount = session.events.filter(
      (event) => !(event.kind === "user" && event.isMetadataOnly),
    ).length

    const firstUserMessage = session.events.find((e) => e.kind === "user" && e.text)?.text || ""
    if (firstUserMessage) {
      session.title =
        firstUserMessage.substring(0, 80) + (firstUserMessage.length > 80 ? "..." : "")
    } else if (session.cwd) {
      session.title = path.basename(session.cwd)
    } else {
      session.title = session.sessionId
    }
  })

  return Array.from(sessionMap.values())
    .filter((session) => session.messageCount > 0)
    .sort((a, b) => {
    const aTime = a.lastSeen ? new Date(a.lastSeen).getTime() : 0
    const bTime = b.lastSeen ? new Date(b.lastSeen).getTime() : 0
    return bTime - aTime
  })
}

ipcMain.handle("read-sessions", async () => {
  try {
    const codexPath = path.join(os.homedir(), ".codex", "sessions")
    const files = []

    console.log("[v0] Reading sessions from:", codexPath)
    await walkDirectoryAndParse(codexPath, files, { full: false })
    console.log("[v0] Found", files.length, "JSONL files")

    primeCaches(files)
    void warmSummaryCounts(files)
    const sessions = Array.from(sessionFiles.keys())
      .map((sessionKey) => buildSessionFromCache(sessionKey))
      .filter(Boolean)
      .sort((a, b) => {
        const aTime = a.lastSeen ? new Date(a.lastSeen).getTime() : 0
        const bTime = b.lastSeen ? new Date(b.lastSeen).getTime() : 0
        return bTime - aTime
      })
    console.log("[v0] Grouped into", sessions.length, "sessions")

    return { success: true, sessions }
  } catch (error) {
    console.error("[v0] Error reading sessions:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("open-openai-export-file", async () => {
  if (!mainWindow) return { success: false, error: "No active window." }
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Open ChatGPT conversations.json",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }],
    })
    if (result.canceled || !result.filePaths[0]) {
      return { success: false, canceled: true }
    }

    const filePath = result.filePaths[0]
    if (path.basename(filePath).toLowerCase() !== "conversations.json") {
      return { success: false, error: "Please select a conversations.json file." }
    }
    const sessions = await parseOpenAIConversationsFile(filePath)
    return { success: true, sessions, sourcePath: filePath }
  } catch (error) {
    console.error("[v0] Error loading ChatGPT export:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("open-openai-export-folder", async () => {
  if (!mainWindow) return { success: false, error: "No active window." }
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Open ChatGPT export folder",
      properties: ["openDirectory"],
    })
    if (result.canceled || !result.filePaths[0]) {
      return { success: false, canceled: true }
    }

    const folderPath = result.filePaths[0]
    const filePath = await findConversationsJson(folderPath)
    if (!filePath) {
      return { success: false, error: "Could not find conversations.json in that folder." }
    }

    const sessions = await parseOpenAIConversationsFile(filePath)
    return { success: true, sessions, sourcePath: filePath }
  } catch (error) {
    console.error("[v0] Error loading ChatGPT export folder:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("read-openai-export", async (_event, filePath) => {
  try {
    if (!filePath) return { success: false, error: "Missing conversations.json path." }
    const sessions = await parseOpenAIConversationsFile(filePath)
    return { success: true, sessions, sourcePath: filePath }
  } catch (error) {
    console.error("[v0] Error reloading ChatGPT export:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("open-openai-export-default", async () => {
  try {
    const candidates = [
      path.join(process.cwd(), "conversations.json"),
      path.join(process.cwd(), "apps", "session-viewer", "conversations.json"),
      path.join(app.getAppPath(), "conversations.json"),
      path.join(app.getAppPath(), "..", "conversations.json"),
    ]

    for (const filePath of candidates) {
      try {
        await fs.access(filePath)
        console.log("[v0] Loading ChatGPT export from:", filePath)
        const sessions = await parseOpenAIConversationsFile(filePath)
        console.log("[v0] Loaded ChatGPT export conversations:", sessions.length)
        return { success: true, sessions, sourcePath: filePath }
      } catch (error) {
        // ignore missing paths
      }
    }

    return { success: false, error: "Could not find conversations.json in the project." }
  } catch (error) {
    console.error("[v0] Error loading default ChatGPT export:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("read-session", async (_event, sessionId, options = {}) => {
  try {
    if (!sessionId) return { success: false, error: "Missing sessionId" }
    const paths = sessionFiles.get(sessionId)
    if (!paths || paths.size === 0) {
      return { success: false, error: "Session not found" }
    }

    for (const filePath of paths) {
      const cached = fileCache.get(filePath)
      const fileInfo = await buildFileInfo(filePath, {
        full: true,
        allowTruncate: options.fullHistory !== true,
        summaryMeta: cached
          ? {
              sessionId: cached.sessionId,
              cwd: cached.cwd,
              startedAt: cached.firstSeen,
            }
          : undefined,
      })
      const sessionKey = getSessionKey(fileInfo)
      fileCache.set(filePath, { ...fileInfo, sessionKey })
      updateSessionFiles(sessionKey, filePath, false)
    }

    const session = buildSessionFromCache(sessionId)
    if (!session) return { success: false, error: "Session not found" }
    return { success: true, session }
  } catch (error) {
    console.error("[v0] Error reading session:", error)
    return { success: false, error: error.message }
  }
})

async function walkDirectoryAndParse(dirPath, files, options = {}) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)

      if (entry.isDirectory()) {
        await walkDirectoryAndParse(fullPath, files, options)
      } else if (entry.name.endsWith(".jsonl")) {
        const fileInfo = await buildFileInfo(fullPath, options)
        files.push(fileInfo)
      }
    }
  } catch (error) {
    console.error(`[v0] Error walking directory ${dirPath}:`, error)
  }
}

ipcMain.handle("start-watching", (event) => {
  const codexPath = path.join(os.homedir(), ".codex", "sessions")

  if (fileWatcher) {
    fileWatcher.close()
  }

  fileWatcher = chokidar.watch("**/*.jsonl", {
    cwd: codexPath,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 750,
      pollInterval: 100,
    },
  })

  const handleFileEvent = async (eventType, relativePath) => {
    const fullPath = path.join(codexPath, relativePath)

    if (eventType === "unlink") {
      const previous = fileCache.get(fullPath)
      if (previous) {
        fileCache.delete(fullPath)
        updateSessionFiles(previous.sessionKey, fullPath, true)
        if (previous.sessionKey) {
          sendSessionUpdate(previous.sessionKey)
        }
      }
      return
    }

    try {
      const fileInfo = await buildFileInfo(fullPath, { full: false })
      const sessionKey = getSessionKey(fileInfo)
      const previous = fileCache.get(fullPath)

      if (previous && previous.sessionKey && previous.sessionKey !== sessionKey) {
        updateSessionFiles(previous.sessionKey, fullPath, true)
        sendSessionUpdate(previous.sessionKey)
      }

      fileCache.set(fullPath, { ...fileInfo, sessionKey })
      updateSessionFiles(sessionKey, fullPath, false)
      sendSessionUpdate(sessionKey)
      if (fileInfo.summaryReady === false) {
        void warmSummaryCounts([{ ...fileInfo, sessionKey }])
      }
    } catch (error) {
      console.error("[v0] Failed to update session from", fullPath, error)
    }
  }

  const scheduleChange = (relativePath) => {
    const existing = fileDebounceTimers.get(relativePath)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      fileDebounceTimers.delete(relativePath)
      handleFileEvent("change", relativePath)
    }, 300)
    fileDebounceTimers.set(relativePath, timer)
  }

  fileWatcher.on("add", (filePath) => handleFileEvent("add", filePath))
  fileWatcher.on("change", (filePath) => scheduleChange(filePath))
  fileWatcher.on("unlink", (filePath) => handleFileEvent("unlink", filePath))

  return { success: true }
})

ipcMain.handle("stop-watching", () => {
  if (fileWatcher) {
    fileWatcher.close()
    fileWatcher = null
  }
  return { success: true }
})

ipcMain.handle("get-favorites", async () => {
  try {
    const data = await loadFavorites()
    return { success: true, favorites: data }
  } catch (error) {
    console.error("[v0] Failed to load favorites:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("set-favorite", async (_event, payload) => {
  try {
    const { id, rating, snapshot } = payload || {}
    if (!id) return { success: false, error: "Missing id" }
    const data = await loadFavorites()
    data.ratings = data.ratings || {}

    if (!rating) {
      delete data.ratings[id]
    } else {
      data.ratings[id] = {
        rating,
        updatedAt: new Date().toISOString(),
        snapshot: snapshot || null,
      }
    }

    await saveFavorites(data)
    return { success: true, favorites: data }
  } catch (error) {
    console.error("[v0] Failed to save favorite:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("set-note", async (_event, payload) => {
  try {
    const { id, text, snapshot } = payload || {}
    if (!id) return { success: false, error: "Missing id" }
    const data = await loadFavorites()
    data.notes = data.notes || {}

    if (!text || !text.trim()) {
      delete data.notes[id]
    } else {
      data.notes[id] = {
        text,
        updatedAt: new Date().toISOString(),
        snapshot: snapshot || null,
      }
    }

    await saveFavorites(data)
    return { success: true, favorites: data }
  } catch (error) {
    console.error("[v0] Failed to save note:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("set-highlight", async (_event, payload) => {
  try {
    const { id, enabled, snapshot } = payload || {}
    if (!id) return { success: false, error: "Missing id" }
    const data = await loadFavorites()
    data.highlights = data.highlights || {}

    if (!enabled) {
      delete data.highlights[id]
    } else {
      data.highlights[id] = {
        enabled: true,
        updatedAt: new Date().toISOString(),
        snapshot: snapshot || null,
      }
    }

    await saveFavorites(data)
    return { success: true, favorites: data }
  } catch (error) {
    console.error("[v0] Failed to save highlight:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("set-todo", async (_event, payload) => {
  try {
    const { id, enabled, snapshot } = payload || {}
    if (!id) return { success: false, error: "Missing id" }
    const data = await loadFavorites()
    data.todos = data.todos || {}

    if (!enabled) {
      delete data.todos[id]
    } else {
      data.todos[id] = {
        enabled: true,
        updatedAt: new Date().toISOString(),
        snapshot: snapshot || null,
      }
    }

    await saveFavorites(data)
    return { success: true, favorites: data }
  } catch (error) {
    console.error("[v0] Failed to save todo:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("set-bookmark", async (_event, payload) => {
  try {
    const { sessionId, pinned } = payload || {}
    if (!sessionId) return { success: false, error: "Missing sessionId" }
    const data = await loadFavorites()
    data.bookmarks = data.bookmarks || {}

    if (!pinned) {
      delete data.bookmarks[sessionId]
    } else {
      data.bookmarks[sessionId] = {
        pinned: true,
        updatedAt: new Date().toISOString(),
      }
    }

    await saveFavorites(data)
    return { success: true, favorites: data }
  } catch (error) {
    console.error("[v0] Failed to save bookmark:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("save-markdown", async (event, payload) => {
  try {
    const content = payload?.content ?? ""
    const filename = payload?.filename || "conversation"
    return await saveTextFile({
      title: "Export as Markdown",
      defaultName: filename,
      extension: "md",
      content,
    })
  } catch (error) {
    console.error("[v0] Save markdown failed:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("save-json", async (event, payload) => {
  try {
    const content = payload?.content ?? ""
    const filename = payload?.filename || "conversation"
    return await saveTextFile({
      title: "Export as JSON",
      defaultName: filename,
      extension: "json",
      content,
    })
  } catch (error) {
    console.error("[v0] Save json failed:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("save-zip", async (_event, payload) => {
  try {
    const filename = payload?.filename || "conversation"
    const files = payload?.files || []
    return await saveZipFile({
      title: "Export session as ZIP",
      defaultName: filename,
      files,
    })
  } catch (error) {
    console.error("[v0] Save zip failed:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("share-file", async (event, payload) => {
  try {
    const content = payload?.content ?? ""
    const filename = payload?.filename || "conversation"
    const extension = payload?.extension || "md"
    return await shareTempFile({
      defaultName: filename,
      extension,
      content,
    })
  } catch (error) {
    console.error("[v0] Share failed:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("show-context-menu", async (event, payload) => {
  if (!mainWindow || process.platform !== "darwin") {
    return { success: false }
  }

  const markdown = payload?.markdown ?? ""
  const json = payload?.json ?? ""
  const filename = payload?.filename || "conversation"

  const template = [
    {
      label: "Share…",
      click: () => shareTempFile({ defaultName: filename, extension: "md", content: markdown }),
    },
    { type: "separator" },
    {
      label: "Export as Markdown…",
      click: () =>
        saveTextFile({
          title: "Export as Markdown",
          defaultName: filename,
          extension: "md",
          content: markdown,
        }),
    },
    {
      label: "Export as JSON…",
      click: () =>
        saveTextFile({
          title: "Export as JSON",
          defaultName: filename,
          extension: "json",
          content: json,
        }),
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  menu.popup({ window: mainWindow })
  return { success: true }
})
