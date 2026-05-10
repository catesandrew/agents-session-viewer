const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("electron", {
  getCodexPath: () => ipcRenderer.invoke("get-codex-path"),
  readSessions: () => ipcRenderer.invoke("read-sessions"),
  openOpenAIExportFile: () => ipcRenderer.invoke("open-openai-export-file"),
  openOpenAIExportFolder: () => ipcRenderer.invoke("open-openai-export-folder"),
  openOpenAIExportDefault: () => ipcRenderer.invoke("open-openai-export-default"),
  readOpenAIExport: (filePath) => ipcRenderer.invoke("read-openai-export", filePath),
  readSession: (sessionId, options) => ipcRenderer.invoke("read-session", sessionId, options),
  startWatching: () => ipcRenderer.invoke("start-watching"),
  stopWatching: () => ipcRenderer.invoke("stop-watching"),
  onSessionsChanged: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on("sessions-changed", handler)
    return () => ipcRenderer.removeListener("sessions-changed", handler)
  },
  saveMarkdown: (payload) => ipcRenderer.invoke("save-markdown", payload),
  saveJson: (payload) => ipcRenderer.invoke("save-json", payload),
  saveZip: (payload) => ipcRenderer.invoke("save-zip", payload),
  shareFile: (payload) => ipcRenderer.invoke("share-file", payload),
  showContextMenu: (payload) => ipcRenderer.invoke("show-context-menu", payload),
  onMenuAction: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on("menu-action", handler)
    return () => ipcRenderer.removeListener("menu-action", handler)
  },
  getFavorites: () => ipcRenderer.invoke("get-favorites"),
  setFavorite: (payload) => ipcRenderer.invoke("set-favorite", payload),
  setNote: (payload) => ipcRenderer.invoke("set-note", payload),
  setHighlight: (payload) => ipcRenderer.invoke("set-highlight", payload),
  setTodo: (payload) => ipcRenderer.invoke("set-todo", payload),
  setBookmark: (payload) => ipcRenderer.invoke("set-bookmark", payload),
})
