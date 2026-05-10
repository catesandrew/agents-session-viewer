---
sidebar_position: 6
title: Examples
---

# Usage Examples

Practical examples showing how to use Agents Session Viewer for common tasks.

## Browsing Sessions

### Finding a Recent Session

1. Launch the app -- it automatically discovers sessions from `~/.codex/sessions/`
2. Sessions are listed in the sidebar, sorted by date (newest first)
3. Click a session or use `J`/`K` to navigate between sessions
4. The conversation loads in the main panel

### Scanning Through a Conversation

1. Select a session from the sidebar
2. Press `j` to move to the next message, `k` to go back
3. Press `gg` to jump to the first message
4. Press `G` to jump to the last message
5. Use `Ctrl+d` and `Ctrl+u` to scroll half-page at a time

### Collapsing Long Messages

When reviewing a session with lengthy assistant responses:

1. Navigate to a long message with `j`/`k`
2. Press `o` to collapse it to a single line
3. Continue scanning with `j`/`k`
4. Press `o` again on any collapsed message to expand it

## Searching

### Finding a Specific Topic

1. Press `/` to focus the search input
2. Type your query, for example: `database migration`
3. Results appear in real-time as you type
4. Each result shows the session and a preview of the matching message
5. Click a result to jump to that message in its full session context
6. Press `Esc` to clear the search and return to browsing

### Fuzzy Search

The search engine tolerates typos and partial matches:

- `datbase` will match `database`
- `refctr` will match `refactor`
- `async awit` will match `async await`

The threshold is set to 0.3 (fairly strict), so results stay relevant.

## Exporting

### Save as Markdown

1. Open the session you want to export
2. Press `Cmd+S` (macOS)
3. Choose a location in the native save dialog
4. The conversation is saved as a formatted `.md` file with headings for each message

### Save as JSON

1. Open the session you want to export
2. Press `Cmd+Shift+S` (macOS)
3. Choose a location in the native save dialog
4. The full conversation with metadata is saved as `.json`

### Copy to Clipboard

For quick sharing without saving a file:

1. To copy a single message: navigate to it with `j`/`k`, then press `y`
2. To copy the entire conversation: press `Y`
3. Paste into your editor, chat, or document

### Share via macOS

1. Open the session you want to share
2. Press `Cmd+E`
3. The macOS share sheet opens with the conversation content
4. Choose Messages, Mail, AirDrop, or any other share target

## Theming

### Switching Themes

- Click the theme toggle in the header to switch between light and dark mode
- The app respects your system preference on first launch
- Your choice is saved and persists across restarts

## Workflow Examples

### Code Review Prep

Reviewing what an AI assistant suggested during a coding session:

1. Launch the app and find the session by date or search
2. Use `o` to collapse the user messages (you know what you asked)
3. Use `j`/`k` to step through assistant responses
4. Press `y` to copy useful code snippets
5. Press `Cmd+S` to save the full conversation for reference

### Debugging Session Lookup

Finding how you solved a specific bug previously:

1. Press `/` and search for the error message or function name
2. Browse through matching results across all sessions
3. Click a result to see the full context
4. Press `Y` to copy the solution to clipboard

### Daily Session Review

Reviewing everything you worked on today:

1. Sessions are grouped by date -- today's sessions appear at the top
2. Use `J`/`K` to step through each session
3. Scan each conversation with `j`/`k`
4. Collapse uninteresting messages with `o`
5. Export highlights with `Cmd+S`
