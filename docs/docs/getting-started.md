---
sidebar_position: 1
title: Getting Started
---

# Getting Started

Agents Session Viewer is a desktop application for browsing, searching, and exporting AI coding session histories. It reads Codex CLI JSONL log files and presents them in a clean, navigable interface.

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- [pnpm](https://pnpm.io/) 9 or later
- macOS (for Electron desktop builds)

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/catesandrew/agents-session-viewer.git
cd agents-session-viewer
pnpm install
```

## Development

### Browser-only (Next.js dev server)

```bash
pnpm dev
```

This starts the Next.js development server at `http://localhost:3000`. Useful for working on the UI without Electron, but file system features (session discovery, file watching) will not be available.

### Full Electron app

```bash
pnpm electron:dev
```

This starts both the Next.js dev server and the Electron shell. The app will connect to `http://127.0.0.1:3000` once the dev server is ready.

## Building

### Static export

```bash
pnpm build
```

Produces a static Next.js export in the `out/` directory.

### Distributable Electron app

```bash
pnpm electron:build
```

Builds the Next.js static export and packages it into a distributable Electron application. The output is placed in the `dist/` directory.

## Session Files

The app looks for Codex CLI session logs in `~/.codex/sessions/`. If you have sessions from a different location, you can symlink or copy them into this directory.

```bash
# Example: symlink an alternative sessions directory
ln -s /path/to/your/sessions ~/.codex/sessions
```

## Linting

```bash
pnpm lint
```

Runs ESLint across the project source files.

## Next Steps

- Read about all [features](./features.md) available in the app
- Learn the [keyboard shortcuts](./keyboard-shortcuts.md) for efficient navigation
- Understand the [JSONL file format](./file-format.md) used by Codex CLI
