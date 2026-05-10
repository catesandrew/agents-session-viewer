---
sidebar_position: 4
title: File Format
---

# File Format

Agents Session Viewer reads Codex CLI session logs stored in the JSONL (JSON Lines) format.

## Directory Structure

Codex CLI stores session files in a date-based hierarchy:

```
~/.codex/sessions/
  └── 2025/
      └── 05/
          └── 10/
              ├── rollout-2025-05-10T09-15-30-a1b2c3d4.jsonl
              ├── rollout-2025-05-10T10-30-00-e5f6g7h8.jsonl
              └── rollout-2025-05-10T14-22-45-i9j0k1l2.jsonl
```

Each file follows the naming convention: `rollout-{ISO-timestamp}-{GUID}.jsonl`

## JSONL Format

Each line in a `.jsonl` file is a standalone JSON object. Lines are separated by newlines (`\n`). This format is ideal for streaming and append-only writes.

### Message Events

The most common event type. Represents a user or assistant message:

```json
{
  "type": "message",
  "role": "user",
  "content": [
    {
      "type": "input_text",
      "text": "Refactor the database connection pool to use async/await"
    }
  ],
  "created_at": 1715356800
}
```

```json
{
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "output_text",
      "text": "I'll refactor the database connection pool..."
    }
  ],
  "created_at": 1715356815,
  "usage": {
    "input_tokens": 1250,
    "output_tokens": 890,
    "cache_read_input_tokens": 400
  }
}
```

### Content Types

Messages can contain multiple content blocks:

| Type | Role | Description |
|------|------|-------------|
| `input_text` | user | Plain text from the user |
| `output_text` | assistant | Text response from the model |
| `thinking` | assistant | Chain-of-thought reasoning (hidden by default) |
| `tool_use` | assistant | Tool invocation request |
| `tool_result` | user | Result from a tool execution |

### Session Metadata

Some JSONL files begin with a metadata line:

```json
{
  "type": "session",
  "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "cwd": "/Users/dev/my-project",
  "model": "o4-mini",
  "created_at": 1715356795
}
```

### Usage Statistics

Assistant messages include token usage data:

```json
{
  "usage": {
    "input_tokens": 2500,
    "output_tokens": 1200,
    "cache_read_input_tokens": 800,
    "cache_creation_input_tokens": 200
  }
}
```

| Field | Description |
|-------|-------------|
| `input_tokens` | Total tokens in the prompt |
| `output_tokens` | Tokens generated in the response |
| `cache_read_input_tokens` | Tokens served from prompt cache |
| `cache_creation_input_tokens` | Tokens added to prompt cache |

## Session Grouping

Multiple JSONL files can belong to the same session. The app groups them by `session_id` from the metadata line, or by `sessionId` embedded in the filename GUID. This means a long conversation that spans multiple files will appear as a single unified session in the viewer.

## Parsing Behavior

The app parses JSONL files line-by-line in the Electron main process:

1. Each line is parsed as independent JSON
2. Invalid lines are silently skipped
3. Messages are sorted by `created_at` timestamp
4. Content blocks are concatenated into displayable text
5. Metadata and thinking blocks are hidden by default but can be toggled
