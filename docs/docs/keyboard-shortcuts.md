---
sidebar_position: 3
title: Keyboard Shortcuts
---

# Keyboard Shortcuts

Complete reference for keyboard shortcuts in Agents Session Viewer.

## Navigation

### Message Navigation

| Key | Action | Description |
|-----|--------|-------------|
| `j` | Next Message | Move selection to the next message in the conversation |
| `k` | Previous Message | Move selection to the previous message in the conversation |
| `gg` | Jump to Top | Scroll to the first message in the conversation |
| `G` | Jump to Bottom | Scroll to the last message in the conversation |

### Session Navigation

| Key | Action | Description |
|-----|--------|-------------|
| `J` | Next Session | Switch to the next session in the sidebar |
| `K` | Previous Session | Switch to the previous session in the sidebar |

### Scrolling

| Key | Action | Description |
|-----|--------|-------------|
| `Ctrl+d` | Scroll Down | Scroll down half a page |
| `Ctrl+u` | Scroll Up | Scroll up half a page |
| `Space` | Page Down | Scroll down one full page |

## Actions

### Message Actions

| Key | Action | Description |
|-----|--------|-------------|
| `o` | Toggle Collapse | Collapse or expand the currently selected message |
| `y` | Yank Message | Copy the currently selected message to clipboard |
| `Y` | Yank Conversation | Copy the entire conversation as Markdown to clipboard |

### Search and UI

| Key | Action | Description |
|-----|--------|-------------|
| `/` | Focus Search | Move focus to the search input field |
| `Esc` | Exit Search | Clear search and remove focus from search field |

## macOS Shortcuts

### File Operations

| Key | Action | Description |
|-----|--------|-------------|
| `Cmd+S` | Save as Markdown | Export conversation as `.md` file with native save dialog |
| `Cmd+Shift+S` | Save as JSON | Export conversation as `.json` file with native save dialog |
| `Cmd+E` | Share | Open macOS share sheet for current conversation |
| `Cmd+W` | Close Window | Close the current window |
| `Cmd+Q` | Quit | Quit the application |

### Edit Operations

| Key | Action | Description |
|-----|--------|-------------|
| `Cmd+C` | Copy | Copy selected text to clipboard |
| `Cmd+A` | Select All | Select all text in focused element |

### View Operations

| Key | Action | Description |
|-----|--------|-------------|
| `Cmd+B` | Toggle Sidebar | Show or hide the session list sidebar |
| `Cmd+Alt+I` | Developer Tools | Open Electron developer tools for debugging |

## Mouse Actions

### Sidebar

- **Click Session** -- Open that session's conversation
- **Hover Session** -- Preview session metadata

### Messages

- **Click Message** -- Select message (enables keyboard actions)
- **Click Collapse Button** -- Toggle message collapse state
- **Click Copy Button** -- Copy message text to clipboard
- **Click Share Button** -- Share message via macOS share sheet

### Header

- **Click Theme Toggle** -- Switch between light and dark mode
- **Click Sidebar Toggle** -- Show/hide sidebar
- **Click Search Bar** -- Focus search input

## Tips and Tricks

### Selection

- Messages show a blue ring when selected via keyboard navigation
- Only one message can be selected at a time
- Selection is cleared when clicking outside messages

### Combining Shortcuts

| Sequence | Result |
|----------|--------|
| `gg` then `y` | Copy the first message |
| `G` then `Y` | Jump to bottom, then yank full conversation |
| `/` then type, then `Esc` | Quick search and clear |

### Efficiency Patterns

- Use `j`/`k` to quickly scan through messages
- Use `J`/`K` to browse sessions without the mouse
- Use `y` to quickly grab code snippets or responses
- Use `o` to collapse long messages for a better overview

### Search Workflow

1. Press `/` to focus search
2. Type your query (fuzzy matching works)
3. Results update in real-time
4. Press `Esc` to clear and return to browsing
5. Use `j`/`k` to navigate search results

### Export Workflow

1. Navigate to session with `J`/`K`
2. Review with `j`/`k` and collapse unneeded with `o`
3. Press `Cmd+S` to save as Markdown
4. Or press `Y` to quickly yank to clipboard
