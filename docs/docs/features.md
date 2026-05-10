---
sidebar_position: 2
title: Features
---

# Features

Detailed documentation of all Agents Session Viewer features.

## Session Management

### Auto-Discovery

The app automatically scans `~/.codex/sessions/` on launch and discovers all JSONL session files organized by date:

```
~/.codex/sessions/
  └── YYYY/
      └── MM/
          └── DD/
              └── rollout-YYYY-MM-DDTHH-MM-SS-GUID.jsonl
```

### Session Grouping

Multiple JSONL files with the same `sessionId` are unified into a single conversation. This handles cases where Codex splits a long session across multiple files.

### Smart Titles

Sessions are titled using this priority:

1. First user message (truncated to reasonable length)
2. Working directory from session metadata
3. Filename as fallback

### Real-time File Watching

Uses chokidar to watch `~/.codex/sessions/`:

- Detects new JSONL files immediately
- Parses and adds to session list
- Updates UI without requiring restart
- Skips hidden files and non-JSONL files
- Handles file renames and moves

## Search

### Global Search

- Searches across **all sessions** simultaneously
- Indexes only user and assistant text content
- Excludes metadata, thinking blocks, and tool results

### Fuzzy Matching

Powered by Fuse.js with these settings:

| Setting | Value | Description |
|---------|-------|-------------|
| Threshold | 0.3 | Fairly strict matches |
| Distance | 100 | Allows typos within 100 characters |
| Keys | Message text | Searches message text content only |

### Search Results

- Shows up to 500 results (performance cap)
- Displays session ID and timestamp in result cards
- Highlights matched message with context
- Jump directly to message in full session view

### Search Debouncing

- 300ms delay before executing search
- Prevents UI freezing during typing
- Cancels previous searches when new query arrives

## Message Display

### Metadata Stripping

Codex includes environment setup in user messages:

```
My request for Codex:

<context>
  <environment>...</environment>
  <ide_integration>...</ide_integration>
</context>

Actual user request here
```

The app strips this automatically, but you can toggle "Show Metadata" to reveal it.

### Collapsible Messages

- Click the "Collapse" button or press `o`
- Collapsed state shows first line only
- Useful for long assistant responses or metadata

### Message Components

Each message shows:

- **Avatar** -- User or Assistant icon
- **Timestamp** -- When the message was sent
- **Content** -- Rendered markdown
- **Actions** -- Copy, share, collapse buttons
- **Usage** (assistant only) -- Token counts and cache stats

## Markdown Rendering

### Supported Elements

- **Headings** (h1-h6) with proper hierarchy
- **Lists** -- Ordered, unordered, and task lists
- **Code Blocks** -- Syntax highlighted in 180+ languages
- **Inline Code** -- Monospace with background
- **Blockquotes** -- Left border with gray background
- **Tables** -- Bordered with hover effects
- **Links** -- Open in new tab with security attributes
- **Images** -- Rounded borders with max width
- **Horizontal Rules** -- Section dividers
- **Strikethrough** -- ~~deleted text~~
- **Emoji** -- `:tada:` renders as the corresponding emoji

### Syntax Highlighting

Uses highlight.js with support for:

- JavaScript, TypeScript, Python, Go, Rust
- HTML, CSS, SCSS, JSON, YAML
- Bash, Shell, PowerShell
- Terraform/HCL (custom registered language)
- SQL, GraphQL
- And 170+ more languages

### Code Block Features

- Language badge in top-right corner
- Horizontal scrolling for long lines
- Copy button (planned feature)
- Line numbers (can be enabled)

## Export and Sharing

### Markdown Export

Formats conversation as structured Markdown:

```markdown
# Session: {sessionId}
Started: {timestamp}
Working Directory: {cwd}

## User - {timestamp}
User message text...

## Assistant - {timestamp}
Assistant response...
```

### JSON Export

Exports full conversation with all metadata:

```json
{
  "sessionId": "...",
  "timestamp": "...",
  "messages": [
    {
      "role": "user",
      "timestamp": "...",
      "text": "...",
      "metadata": {}
    }
  ]
}
```

### macOS Share Sheet

- Creates temporary file with conversation content
- Opens native macOS share menu
- Can share via Messages, Mail, AirDrop, etc.
- Automatically reveals file in Finder after creation

## Theme Support

### Light Mode

- Clean white backgrounds
- Dark text on light surfaces
- Subtle borders and shadows

### Dark Mode

- Near-black backgrounds
- Light text with good contrast
- Syntax highlighting adjusted for dark backgrounds

### Theme Persistence

- Saves preference to localStorage
- Respects system theme on first launch
- Can override system preference

## Performance

### Streaming Parsing

- JSONL files parsed line-by-line in main process
- Prevents loading huge files into memory
- Progressive updates to UI as parsing completes

### Message Limit

- Search results capped at 500 for performance
- Full sessions show all messages (no cap)
