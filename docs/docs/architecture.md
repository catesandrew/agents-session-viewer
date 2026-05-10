---
sidebar_position: 5
title: Architecture
---

# Architecture

Agents Session Viewer follows the standard Electron two-process model, with a Next.js-based renderer.

## Process Model

```
┌─────────────────────────────────────────────┐
│                 Electron                     │
│                                             │
│  ┌──────────────┐    IPC    ┌────────────┐  │
│  │ Main Process │ <-------> │  Renderer  │  │
│  │              │           │  (Next.js) │  │
│  │ - File I/O   │           │            │  │
│  │ - Chokidar   │           │ - React UI │  │
│  │ - JSONL Parse│           │ - Search   │  │
│  │ - Menus      │           │ - Markdown │  │
│  │ - Dialogs    │           │ - Themes   │  │
│  └──────────────┘           └────────────┘  │
│                                             │
└─────────────────────────────────────────────┘
```

### Main Process

Located in `electron/main.js`, the main process handles:

- **BrowserWindow management** -- Creates and manages the app window
- **File system access** -- Reads JSONL files from `~/.codex/sessions/`
- **JSONL parsing** -- Line-by-line streaming parser for session files
- **File watching** -- chokidar watches for new/changed session files
- **IPC handlers** -- Responds to renderer requests for session data
- **Native menus** -- Application menu with keyboard shortcuts
- **Save dialogs** -- Native file save for Markdown/JSON export
- **Share sheet** -- macOS share sheet integration

### Preload Script

Located in `electron/preload.js`, it exposes a safe API to the renderer via `contextBridge`:

- Session listing and loading
- Search execution
- Export triggers
- Theme synchronization

### Renderer Process

The Next.js application in `src/` provides the UI:

- **React 19** with server components
- **Radix UI** primitives for accessible components
- **Tailwind CSS 4** for styling
- **react-markdown** with remark/rehype plugins for rendering
- **Fuse.js** for client-side fuzzy search
- **next-themes** for light/dark mode

## Directory Structure

```
agents-session-viewer/
├── electron/
│   ├── main.js          # Electron main process entry point
│   └── preload.js       # Context bridge for renderer
├── src/
│   ├── app/             # Next.js app router (pages, layouts)
│   ├── components/      # React UI components
│   │   ├── ui/          # Base UI primitives (Radix-based)
│   │   └── ...          # Feature components
│   ├── hooks/           # Custom React hooks
│   ├── lib/             # Shared utilities and helpers
│   ├── styles/          # Global CSS and Tailwind config
│   └── types/           # TypeScript type definitions
├── assets/              # App icons (icns, png)
├── public/              # Static assets served by Next.js
├── docs/                # Docusaurus documentation site
└── tests/               # Test files
```

## Key Components

### Session List

The sidebar component that displays all discovered sessions:

- Grouped by date
- Shows smart titles derived from first user message
- Highlights the currently selected session
- Supports keyboard navigation with `J`/`K`

### Message View

The main content area displaying conversation messages:

- Renders each message with avatar, timestamp, and content
- Supports collapsing individual messages
- Shows token usage for assistant messages
- Keyboard-navigable with `j`/`k`

### Search

The global search interface:

- Input field activated with `/`
- Results panel with matched messages
- Click or keyboard-navigate to jump to source message
- Debounced input (300ms) for performance

### Markdown Renderer

Custom-configured react-markdown with:

- **remark-gfm** -- Tables, strikethrough, task lists
- **remark-emoji** -- Emoji shortcodes
- **rehype-highlight** -- Syntax highlighting via highlight.js
- **rehype-raw** -- Raw HTML passthrough
- **rehype-slug** -- Heading anchors

### Export System

Handles saving conversations:

- Formats conversations as Markdown or JSON
- Uses Electron's native save dialog
- Supports macOS share sheet via temporary files

## Data Flow

1. **Startup**: Main process scans `~/.codex/sessions/` recursively
2. **Parse**: Each `.jsonl` file is parsed line-by-line
3. **Group**: Files with matching session IDs are merged
4. **Index**: Sessions are indexed for search via Fuse.js
5. **Watch**: chokidar monitors for new files
6. **Display**: Renderer requests data via IPC and renders React components
7. **Search**: User queries are matched against the Fuse.js index
8. **Export**: Renderer triggers export via IPC; main process handles file I/O

## Build Pipeline

### Development

```
Next.js Dev Server (port 3000) ← Electron loads URL
```

### Production

```
Next.js Static Export (out/) → electron-builder → Platform Installer (dist/)
```

The production build uses `next build` with static export (`output: 'export'`), then `electron-builder` packages the `out/` directory alongside the Electron shell into a distributable application.
