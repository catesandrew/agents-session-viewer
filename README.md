# Agents Session Viewer

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-39.x-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)

A desktop application for browsing, searching, and exporting AI coding session histories. Built with Electron and Next.js, it reads Codex CLI JSONL log files and presents them in a clean, navigable interface with Vim-style keyboard shortcuts.

**[Documentation](https://catesandrew.github.io/agents-session-viewer/)**

## Screenshots

> Screenshots coming soon.

## Features

- **Auto-Discovery** -- Automatically scans `~/.codex/sessions/` and discovers all JSONL session files organized by date. New sessions appear in real-time via file watching.
- **Fuzzy Search** -- Search across all sessions simultaneously with Fuse.js-powered fuzzy matching. Results highlight matched messages with context and allow jumping directly to the source.
- **Vim-Style Navigation** -- Full keyboard-driven workflow: `j`/`k` for messages, `J`/`K` for sessions, `gg`/`G` for jumping, `y` to yank, `o` to collapse, and `/` to search.
- **Rich Markdown Rendering** -- Syntax-highlighted code blocks (180+ languages), GFM tables, task lists, emoji, blockquotes, and more via react-markdown with remark/rehype plugins.
- **macOS Native Integration** -- Share sheet support, native save dialogs for Markdown/JSON export, and proper window management with `Cmd` shortcuts.
- **Light & Dark Themes** -- Follows system preference with manual override. Persists across sessions via localStorage.
- **Session Grouping** -- Multiple JSONL files sharing a `sessionId` are unified into a single conversation view.
- **Smart Titles** -- Sessions are titled using the first user message, working directory, or filename as fallback.
- **Export Options** -- Save conversations as Markdown or JSON files, copy to clipboard, or share via macOS share sheet.

## Installation

### Pre-built binaries

Download a pre-built application for your platform from the [GitHub Releases](https://github.com/catesandrew/agents-session-viewer/releases) page. Available as macOS (.dmg), Linux (.AppImage), and Windows (.exe) installers.

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+

### Install

```bash
git clone https://github.com/catesandrew/agents-session-viewer.git
cd agents-session-viewer
pnpm install
```

### Development

```bash
# Run Next.js dev server only (browser)
pnpm dev

# Run full Electron app in dev mode
pnpm electron:dev
```

### Build

```bash
# Build Next.js static export
pnpm build

# Build distributable Electron app
pnpm electron:build
```

The packaged app will be in the `dist/` directory.

## Keyboard Shortcuts

### Navigation

| Key | Action |
|-----|--------|
| `j` / `k` | Next / previous message |
| `J` / `K` | Next / previous session |
| `gg` | Jump to first message |
| `G` | Jump to last message |
| `Ctrl+d` / `Ctrl+u` | Scroll half page down / up |
| `Space` | Page down |

### Actions

| Key | Action |
|-----|--------|
| `o` | Toggle collapse on selected message |
| `y` | Copy selected message to clipboard |
| `Y` | Copy entire conversation as Markdown |
| `/` | Focus search input |
| `Esc` | Clear search / unfocus |

### macOS Shortcuts

| Key | Action |
|-----|--------|
| `Cmd+S` | Save as Markdown |
| `Cmd+Shift+S` | Save as JSON |
| `Cmd+E` | Share via macOS share sheet |
| `Cmd+B` | Toggle sidebar |

See the [full keyboard shortcuts reference](https://catesandrew.github.io/agents-session-viewer/docs/keyboard-shortcuts) for details.

## File Format

The app reads Codex CLI session logs stored as JSONL (JSON Lines) files:

```
~/.codex/sessions/
  └── YYYY/
      └── MM/
          └── DD/
              └── rollout-YYYY-MM-DDTHH-MM-SS-GUID.jsonl
```

Each line in a `.jsonl` file is a standalone JSON object representing a session event:

```json
{"type":"message","role":"user","content":[{"type":"input_text","text":"..."}],"created_at":1234567890}
{"type":"message","role":"assistant","content":[{"type":"output_text","text":"..."}],"created_at":1234567891}
```

## Architecture

The app follows an Electron two-process model:

- **Main Process** (`electron/main.js`) -- Manages the BrowserWindow, file system access, JSONL parsing, file watching with chokidar, and IPC communication. Handles native menus, dialogs, and the macOS share sheet.
- **Renderer Process** (Next.js app in `src/`) -- React-based UI with server components. Communicates with the main process via IPC for session data, search, and export operations.

### Key Components

| Directory | Purpose |
|-----------|---------|
| `electron/` | Main process entry point, IPC handlers, file watchers |
| `src/app/` | Next.js app router pages and layouts |
| `src/components/` | React UI components (session list, message view, search) |
| `src/lib/` | Shared utilities, types, and helpers |
| `public/` | Static assets |
| `assets/` | App icons and platform-specific resources |

## Tech Stack

- **Runtime**: [Electron](https://www.electronjs.org/) 39.x
- **Framework**: [Next.js](https://nextjs.org/) 16 (static export)
- **Language**: [TypeScript](https://www.typescriptlang.org/) 5.x
- **UI**: [React](https://react.dev/) 19, [Radix UI](https://www.radix-ui.com/), [Tailwind CSS](https://tailwindcss.com/) 4
- **Search**: [Fuse.js](https://www.fusejs.io/) (fuzzy matching)
- **Markdown**: [react-markdown](https://github.com/remarkjs/react-markdown) with remark-gfm, rehype-highlight
- **File Watching**: [chokidar](https://github.com/paulmillr/chokidar)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

Please ensure your code passes linting (`pnpm lint`) before submitting.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
