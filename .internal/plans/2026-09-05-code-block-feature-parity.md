# Code Block Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use beads-superpowers:subagent-driven-development (recommended) or beads-superpowers:executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Reviewed by:** oh-my-claudecode:architect and oh-my-claudecode:critic (2026-09-05). Both returned REVISE; this version incorporates every required fix from both reports. See "Review Disposition" at the end of this file for the full finding-by-finding trace.

**Goal:** Make the rendered `<pre>` code blocks in `src/components/markdown-renderer.tsx` actually deliver the three features `docs/docs/features.md` already advertises as shipped/planned — a per-block copy button, a visible language badge, and a working line-number toggle — without changing any other markdown rendering behavior, and reconcile the docs copy with what actually ships.

**Architecture:** All three features live in the same two files: `src/lib/markdown/plugins.ts` (the unified/rehype plugin pipeline that annotates the hast `<pre>`/`<code>` nodes) and `src/components/markdown-renderer.tsx` (the React component that turns those hast nodes into DOM via `ReactMarkdown`'s `components` map). Each task wraps the rendered `<pre>` in a `relative group` container and reads plugin-supplied node data to render an overlay (badge top-left, copy button top-right). No new dependencies are introduced; `lucide-react` (already a dependency, see `Check` import in `markdown-renderer.tsx:7`) supplies the copy icon.

**Tech Stack:** React 19, `react-markdown`, `rehype-pre-language`, `rehype-highlight-code-lines`, `lucide-react`, Node's built-in `node:test` runner (no component-testing library is installed — see Global Constraints).

## Global Constraints

- No new npm dependencies. All features are buildable with packages already in `package.json` (`rehype-pre-language`, `rehype-highlight-code-lines`, `lucide-react`).
- No React component testing library (`@testing-library/react`, jsdom, happy-dom) is installed and none should be added as part of this plan — that is a separate, larger infrastructure decision outside this scope. Pure, framework-free logic gets a `node:test` unit test (existing pattern: `tests/parser.test.ts`); React component behavior is verified manually via `pnpm dev`/`pnpm electron:dev` and described in the task's completion notes.
- **`pnpm lint` is currently broken repo-wide** (`eslint.config.js:1` requires `@caps/eslint-config`, which is not installed — confirmed via `pnpm lint` → `Cannot find module '@caps/eslint-config'`, pre-existing since the initial commit, unrelated to this plan). Tracked separately as its own bug (see "Related, Out-of-Scope Bug" below). **Until that bug is fixed, no task in this plan gates on `pnpm lint` passing** — run it informationally if you like, but do not block a task's completion on it.
- Preserve existing visual behavior for code blocks that have no language (`rehype-pre-language` only sets data when a `language-*` class exists on the inner `<code>`; blocks without a language must render exactly as they do today, with no empty badge).
- Follow the existing localStorage-preference pattern already used in this codebase (`src/components/conversation-viewer.tsx:655-710`, `src/app/page.tsx:165,556`) for the line-number toggle, **including its hydration guard** (`theme-toggle.tsx:10-14`'s `mounted` pattern) — this app is statically exported (`next.config.mjs` → `output: 'export'`), so any hook that returns a browser-only value from `useState`'s initializer will mismatch the prerendered HTML on hydration. Initialize to a fixed default and correct it in `useEffect`.
- Do not introduce a new global state library (Redux/Zustand/Context) for a single boolean preference.

## Related, Out-of-Scope Bug

`pnpm lint` fails on a clean checkout because `eslint.config.js` requires `@caps/eslint-config`, a package not present in `package.json`/`pnpm-lock.yaml`/`node_modules`. This predates this plan (present since the initial commit) and blocks lint for all work in this repo, not just this epic. File it as its own bug bead (`lint: pnpm lint fails, @caps/eslint-config missing`), not a task in this plan — fixing a shared monorepo-extraction artifact is a different unit of work with its own risk profile (restore vs. replace the config).

---

### Task 1: Render a language badge on code blocks

**Files:**
- Modify: `src/lib/markdown/plugins.ts:32-63` (change `rehypePreLanguage` from its default `className` target to a dedicated `data-language` attribute — on **both** `rehypePlugins` and `rehypePluginsLite` — so it stops colliding with the hardcoded `className` the `pre` component already sets)
- Modify: `src/components/markdown-renderer.tsx:105-110` (wrap `<pre>` in a positioned container and render the badge)

**Interfaces:**
- Consumes: nothing from earlier tasks (this is the first task).
- Produces: the `relative group` wrapper `<div>` around every rendered `<pre>` block — Task 2 (copy button) renders its button inside this same wrapper, positioned `top-2 right-2` (the badge occupies `top-2 left-2`). Also produces the convention that `<pre>` gets extra top padding (`pt-9` instead of `p-4`'s uniform padding) whenever a badge is shown, which Task 2 must preserve.

**Acceptance Criteria:**
- A fenced code block with a language (e.g. ` ```typescript `) renders a small badge reading `typescript` in the top-left corner of the code block, and the first line of code is not visually covered by the badge (badge sits in reserved top padding, not overlapping code text).
- A fenced code block with no language (e.g. plain ` ``` `) renders with no badge, no `data-language` attribute leaking onto the `<pre>` element, and the same padding as it has today (no reserved badge space wasted when there's no badge).
- The badge does not shift or clip code content; horizontal scroll behavior is unchanged.
- `docs/docs/features.md`'s code-block feature list matches reality: update the "Language badge in top-right corner" line to say **top-left** (this plan places it top-left to leave top-right for the copy button added in Task 2).

- [ ] **Step 1: Point `rehype-pre-language` at a dedicated attribute instead of `className`, on both plugin lists**

Currently `rehypePreLanguage` (no options) writes the language into the `<pre>` element's `className`, which is silently discarded because `markdown-renderer.tsx`'s `pre` component always overwrites `className` with a hardcoded string. Change it to write into `data-language` instead, which nothing else touches. Apply this to **both** exports so behavior is consistent regardless of which plugin list is active for a given message (`rehypePluginsLite` is used for messages with no fenced code, but may still contain inline `<pre>`-less content today — keeping both consistent avoids surprises if that ever changes):

```typescript
// src/lib/markdown/plugins.ts
export const rehypePlugins: PluggableList = [
  rehypeCodeMeta,
  [
    rehypeHighlight,
    {
      languages: {
        ...common,
        terraform: hljsDefineTerraform,
        tf: hljsDefineTerraform,
        hcl: hljsDefineTerraform,
      },
      aliases: { terraform: ['tf', 'hcl'] },
    },
  ],
  [rehypeHighlightCodeLines, { showLineNumbers: false }],
  rehypeSlug,
  [rehypePreLanguage, 'data-language'],
  rehypeImageToolkit,
]

export const rehypePluginsLite: PluggableList = [
  rehypeCodeMeta,
  rehypeSlug,
  [rehypePreLanguage, 'data-language'],
  rehypeImageToolkit,
]
```

- [ ] **Step 2: Wrap `<pre>` and render the badge in `markdown-renderer.tsx`**

`react-markdown` passes hast element properties through as component props, so `data-language` arrives as the prop key `"data-language"` (verified: `property-information` has no known entry for `data-language`, so `hast-util-to-jsx-runtime` falls back to emitting the literal attribute name rather than camel-casing it). Read it defensively and don't forward it to the DOM `<pre>` tag itself:

```tsx
// src/components/markdown-renderer.tsx
pre: ({ node, children, ...props }) => {
  const language = typeof props['data-language'] === 'string' ? props['data-language'] : undefined
  const { ['data-language']: _omit, ...preProps } = props

  return (
    <div className="relative group my-4">
      <pre
        {...preProps}
        className={`overflow-x-auto bg-secondary/50 rounded-lg border border-border ${
          language ? 'pt-9 px-4 pb-4' : 'p-4'
        }`}
      >
        {children}
      </pre>
      {language && (
        <span className="pointer-events-none absolute top-2 left-2 select-none rounded bg-secondary/80 px-2 py-0.5 text-xs font-mono uppercase text-muted-foreground">
          {language}
        </span>
      )}
    </div>
  )
},
```

Note the `my-4` class moves from the `<pre>` element to the new wrapper `<div>` so vertical spacing between blocks is unchanged. Padding switches from a flat `p-4` to `pt-9 px-4 pb-4` only when a badge is present, so the badge occupies genuinely reserved space instead of overlapping the first code line.

- [ ] **Step 3: Reconcile the docs**

In `docs/docs/features.md`, change the line `- Language badge in top-right corner` to `- Language badge in top-left corner`.

- [ ] **Step 4: Manual verification**

Run `pnpm electron:dev` (or `pnpm dev` in a browser), open any session containing a fenced code block with a language tag (e.g. search for a session with a ` ```bash ` block), and confirm:
- Badge shows the language name, top-left, doesn't overlap the first line of code.
- A plain ` ``` ` block (no language) shows no badge and has the same padding as before this change.

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown/plugins.ts src/components/markdown-renderer.tsx docs/docs/features.md
git commit -m "feat: render language badge on code blocks"
```

---

### Task 2: Add a per-code-block copy button

**Files:**
- Create: `src/lib/markdown/hast-text.ts` (pure hast-to-plain-text extraction helper)
- Create: `tests/hast-text.test.ts` (unit test for the helper, following the `tests/parser.test.ts` pattern)
- Modify: `src/components/markdown-renderer.tsx` (add `CodeBlockCopyButton`, wire into the `pre` wrapper from Task 1, import `Copy` from `lucide-react`)
- Modify: `docs/docs/features.md:143` (drop the "(planned feature)" annotation now that it ships)
- Modify: `package.json` (add a `"test"` script so `node --test tests/*.test.ts` is discoverable via `pnpm test`, matching how `lint`/`build`/`dev` are all `pnpm`-invocable)

**Interfaces:**
- Consumes: the `relative group` wrapper `<div>` and the `pt-9`-when-badged padding convention introduced in Task 1's `pre` component — the copy button is a second absolutely-positioned child of that same wrapper (top-right), and must not change the badge's top-left position or the padding logic.
- Produces: `getHastText(node: import('hast').Nodes | undefined | null): string`, exported from `src/lib/markdown/hast-text.ts`. No later task in this plan consumes it, but it is the reusable primitive for extracting a code block's raw text (Task 3/4's line-number gutter attributes live outside text nodes, so this helper's output is unaffected by the line-number feature — see Task 3's note).

**Acceptance Criteria:**
- Hovering a code block reveals a copy button in the top-right corner (independent of the language badge in the top-left, which is always visible whenever a language is known).
- Clicking the button copies the exact original code text (not the syntax-highlighted HTML, not truncated, no extra whitespace from highlight.js's internal `<span>` wrapping) to the clipboard, and shows a brief "copied" (checkmark) state that reverts after ~1.5s.
- `getHastText` has a passing unit test covering: a simple text node, nested `<span>` elements (as produced by `rehype-highlight`), and multiple sibling children joined without extra whitespace.
- `node --test tests/*.test.ts` (or `pnpm test`) passes.

- [ ] **Step 1: Write the failing test for `getHastText`**

```typescript
// tests/hast-text.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'

import { getHastText } from '../src/lib/markdown/hast-text.ts'

test('returns empty string for undefined/null nodes', () => {
  assert.equal(getHastText(undefined), '')
  assert.equal(getHastText(null), '')
})

test('extracts a single text node', () => {
  assert.equal(getHastText({ type: 'text', value: 'const x = 1;' }), 'const x = 1;')
})

test('concatenates text across nested highlight.js spans', () => {
  const node = {
    type: 'element',
    tagName: 'code',
    properties: {},
    children: [
      {
        type: 'element',
        tagName: 'span',
        properties: { className: ['hljs-keyword'] },
        children: [{ type: 'text', value: 'const' }],
      },
      { type: 'text', value: ' x = ' },
      {
        type: 'element',
        tagName: 'span',
        properties: { className: ['hljs-number'] },
        children: [{ type: 'text', value: '1' }],
      },
      { type: 'text', value: ';' },
    ],
  }
  assert.equal(getHastText(node as never), 'const x = 1;')
})
```

Run: `node --test tests/hast-text.test.ts`
Expected: FAIL with "Cannot find module '../src/lib/markdown/hast-text.ts'"

- [ ] **Step 2: Implement `getHastText`**

```typescript
// src/lib/markdown/hast-text.ts
import type { Nodes } from 'hast'

/**
 * Recursively concatenates the plain-text value of a hast node, ignoring
 * element boundaries (e.g. rehype-highlight's <span class="hljs-*"> wrappers).
 */
export function getHastText(node: Nodes | null | undefined): string {
  if (!node) return ''
  if (node.type === 'text') return node.value
  if ('children' in node && Array.isArray(node.children)) {
    return node.children.map((child) => getHastText(child as Nodes)).join('')
  }
  return ''
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `node --test tests/hast-text.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 4: Add a `test` script to `package.json`**

```json
"scripts": {
  "build": "next build",
  "dev": "next dev",
  "electron:build": "next build && electron-builder --publish never",
  "electron:build:mac": "next build && electron-builder --mac dmg --publish never",
  "electron:build:win": "next build && electron-builder --win nsis --publish never",
  "electron:build:linux": "next build && electron-builder --linux AppImage --publish never",
  "electron:dev": "concurrently \"next dev -p 3000\" \"bash -lc 'until curl -sf http://127.0.0.1:3000 >/dev/null; do sleep 0.5; done; ELECTRON_START_URL=http://127.0.0.1:3000 electron .'\"",
  "lint": "eslint .",
  "start": "next start",
  "test": "node --test tests/*.test.ts"
}
```

- [ ] **Step 5: Add the copy button component and wire it into `pre`**

```tsx
// src/components/markdown-renderer.tsx (add near the top, alongside existing imports)
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { getHastText } from '@/lib/markdown/hast-text'

// ... inside the file, above MarkdownRenderer:
function CodeBlockCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API unavailable or denied; silently no-op, matches
      // existing message-bubble.tsx copy error handling (toast is skipped
      // here to avoid noisy overlays on tiny hover controls).
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label="Copy code"
      className="absolute top-2 right-2 rounded-md border border-border bg-secondary/80 p-1.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}
```

Then extend the `pre` component from Task 1 (padding logic now reserves space whenever *either* the badge or the button needs it — since the button is hover-only but still needs the same reserved top strip so it doesn't jump the layout on hover, keep the `pt-9` trigger tied to `language` presence as in Task 1; a language-less block still gets a plain `p-4` copy button sitting over the code on hover, which is acceptable since it only appears on hover and this repo's own docs never scoped the badge and button paddings as coupled):

```tsx
pre: ({ node, children, ...props }) => {
  const language = typeof props['data-language'] === 'string' ? props['data-language'] : undefined
  const { ['data-language']: _omit, ...preProps } = props
  const codeText = getHastText(node)

  return (
    <div className="relative group my-4">
      <pre
        {...preProps}
        className={`overflow-x-auto bg-secondary/50 rounded-lg border border-border ${
          language ? 'pt-9 px-4 pb-4' : 'p-4'
        }`}
      >
        {children}
      </pre>
      {language && (
        <span className="pointer-events-none absolute top-2 left-2 select-none rounded bg-secondary/80 px-2 py-0.5 text-xs font-mono uppercase text-muted-foreground">
          {language}
        </span>
      )}
      {codeText && <CodeBlockCopyButton text={codeText} />}
    </div>
  )
},
```

- [ ] **Step 6: Reconcile the docs**

In `docs/docs/features.md:143`, change `- Copy button (planned feature)` to `- Copy button in top-right corner (hover to reveal)`.

- [ ] **Step 7: Manual verification**

`pnpm electron:dev`, open a session with a code block, hover it, click the copy button, paste into another app and confirm the exact source text (no HTML, no highlight spans) was copied. Confirm the checkmark appears then reverts. Confirm the badge (Task 1) is unaffected.

- [ ] **Step 8: Test and commit**

```bash
pnpm test
git add src/lib/markdown/hast-text.ts tests/hast-text.test.ts src/components/markdown-renderer.tsx docs/docs/features.md package.json
git commit -m "feat: add per-code-block copy button"
```

---

### Task 3: Wire up a working line-number toggle (plugin + CSS + preference hook)

**Files:**
- Modify: `src/lib/markdown/plugins.ts` (turn the static `rehypePlugins` array into a `buildRehypePlugins(showLineNumbers: boolean)` factory)
- Modify: `src/app/globals.css` (add the CSS `rehype-highlight-code-lines` requires to actually render a gutter — its README's "Styling" section documents this; without it, `data-line-number` attributes exist in the DOM but nothing displays them)
- Create: `src/hooks/use-code-line-numbers.ts` (localStorage-backed boolean preference, cross-instance sync via a `window` custom event, hydration-safe)
- Modify: `src/components/markdown-renderer.tsx` (consume the hook, pass the boolean into `buildRehypePlugins`)

**Interfaces:**
- Consumes: nothing from Tasks 1-2 directly, but edits the same `rehypePlugins` export those tasks already touched — implemented after them to avoid parallel edit conflicts on `plugins.ts`.
- Produces: `useCodeLineNumbers(): [boolean, () => void]` from `src/hooks/use-code-line-numbers.ts`, and `buildRehypePlugins(showLineNumbers: boolean): PluggableList` from `src/lib/markdown/plugins.ts`. Task 4 consumes both to build the header toggle button.

**Acceptance Criteria:**
- With the preference on, every fenced code block shows a left gutter with visible line-number digits (not just a `data-line-number` attribute with nothing rendered — verify by reading the digits on screen, not just inspecting the DOM).
- With the preference off (default), code blocks render exactly as they do today — no gutter, no reserved space for one.
- The preference persists in `localStorage` under a stable key and is correctly re-read after a full page reload.
- No hydration warning appears in the console on first load (the initial client render must match the statically-exported HTML, which always renders with the default-off state before the `useEffect` correction runs).
- `getHastText` (Task 2) still returns clean code text with no stray digits or whitespace when line numbers are on (line-number data lives in a `data-line-number` attribute and a CSS `::before` pseudo-element, not in a text node, so this should hold without code changes — confirm with a manual copy while the toggle is on).

- [ ] **Step 1: Convert the static plugin array into a factory**

```typescript
// src/lib/markdown/plugins.ts
export function buildRehypePlugins(showLineNumbers: boolean): PluggableList {
  return [
    rehypeCodeMeta,
    [
      rehypeHighlight,
      {
        languages: {
          ...common,
          terraform: hljsDefineTerraform,
          tf: hljsDefineTerraform,
          hcl: hljsDefineTerraform,
        },
        aliases: { terraform: ['tf', 'hcl'] },
      },
    ],
    [rehypeHighlightCodeLines, { showLineNumbers }],
    rehypeSlug,
    [rehypePreLanguage, 'data-language'],
    rehypeImageToolkit,
  ]
}
```

Remove the old `export const rehypePlugins` array entirely (verified single consumer: `src/components/markdown-renderer.tsx:5`, so removing it is safe — nothing else imports it). `rehypePluginsLite` (from Task 1) is unaffected by line numbers, since it's only used for non-fenced-code content, and stays a plain export as Task 1 left it.

- [ ] **Step 2: Add the CSS the line-number gutter needs**

`rehype-highlight-code-lines` only emits `class="numbered-code-line" data-line-number="N"` on each line span — it does not ship CSS, and this repo currently has zero rules matching `code-line`, `numbered-code-line`, or `data-line-number` anywhere under `src/`. Add the following to `src/app/globals.css`, scoped under `.markdown-body` so it can't affect any other `<pre>`/`<code>` elsewhere in the app, using this project's existing `--color-muted-foreground` design token instead of the upstream README's placeholder variable names:

```css
/* Line-number gutter for code blocks (rehype-highlight-code-lines).
   Only rendered when the user enables the line-numbers preference —
   see src/hooks/use-code-line-numbers.ts. */
.markdown-body pre > code {
  float: left;
  min-width: 100%;
}

.markdown-body .code-line {
  display: inline-block;
  min-width: 100%;
}

.markdown-body .numbered-code-line::before {
  content: attr(data-line-number);
  display: inline-block;
  width: 2rem;
  margin-right: 1rem;
  text-align: right;
  color: var(--color-muted-foreground);
  user-select: none;
}
```

- [ ] **Step 3: Add the localStorage-backed preference hook (hydration-safe)**

```typescript
// src/hooks/use-code-line-numbers.ts
import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'code-line-numbers'
const CHANGE_EVENT = 'code-line-numbers-changed'

function readPreference(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(STORAGE_KEY) === 'true'
}

export function useCodeLineNumbers(): [boolean, () => void] {
  // Always start `false` so the client's first render matches the
  // statically-exported HTML (this app builds with `output: 'export'`).
  // The real value is applied after mount, same pattern as
  // theme-toggle.tsx's `mounted` guard.
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    setEnabled(readPreference())
    const handleChange = () => setEnabled(readPreference())
    window.addEventListener(CHANGE_EVENT, handleChange)
    window.addEventListener('storage', handleChange)
    return () => {
      window.removeEventListener(CHANGE_EVENT, handleChange)
      window.removeEventListener('storage', handleChange)
    }
  }, [])

  const toggle = useCallback(() => {
    const next = !readPreference()
    window.localStorage.setItem(STORAGE_KEY, String(next))
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  return [enabled, toggle]
}
```

- [ ] **Step 4: Consume the hook in `MarkdownRenderer`**

```tsx
// src/components/markdown-renderer.tsx
import { buildRehypePlugins, rehypePluginsLite, remarkPlugins } from '@/lib/markdown/plugins'
import { useCodeLineNumbers } from '@/hooks/use-code-line-numbers'

function MarkdownRenderer({ children, className = '' }: MarkdownRendererProps) {
  const [showLineNumbers] = useCodeLineNumbers()
  const normalizedText = useMemo(() => normalizeMarkdownForDisplay(children), [children])
  const activeRehypePlugins = useMemo(
    () =>
      normalizedText.includes('```') ? buildRehypePlugins(showLineNumbers) : rehypePluginsLite,
    [normalizedText, showLineNumbers],
  )
  // ...rest unchanged
```

- [ ] **Step 5: Manual verification**

Temporarily flip the default in `readPreference` to `true` (or set `window.localStorage.setItem('code-line-numbers', 'true')` in the browser devtools console) while `pnpm electron:dev` is running, and confirm: a gutter with visible line-number digits appears to the left of code in fenced blocks, the code itself isn't shifted oddly, and copying a code block (Task 2's button) still yields clean text with no digits. Revert the temporary change (or clear localStorage) before moving on to Task 4, since there is no UI to toggle it yet.

- [ ] **Step 6: Commit**

```bash
git add src/lib/markdown/plugins.ts src/app/globals.css src/hooks/use-code-line-numbers.ts src/components/markdown-renderer.tsx
git commit -m "feat: wire up line-number rendering behind a preference hook"
```

---

### Task 4: Add the header toggle button for line numbers

**Files:**
- Create: `src/components/line-numbers-toggle.tsx` (header button, modeled on `src/components/theme-toggle.tsx`)
- Modify: `src/app/page.tsx:36,942` (import and render `<LineNumbersToggle />` next to the existing `<ThemeToggle />`)
- Modify: `docs/docs/features.md:144` (confirm/tighten the "Line numbers (can be enabled)" line now that there's a real UI control — no functional change needed since the existing wording is already accurate, but note where the control lives)

**Interfaces:**
- Consumes: `useCodeLineNumbers()` from Task 3 (`src/hooks/use-code-line-numbers.ts`) — this task adds no new state, only a UI control over the existing hook.
- Produces: nothing consumed by later tasks (this is the final task in the epic).

**Acceptance Criteria:**
- A new toggle button next to the theme toggle in the header switches line numbers on/off for all rendered code blocks immediately (no reload needed), for every currently-mounted `MarkdownRenderer` instance (e.g. multiple visible messages in a long conversation) — not just the one nearest the button.
- The button's pressed/unpressed visual state matches the current preference after mount (no flash of the wrong state beyond the standard hydration-guard frame already handled by the hook in Task 3).
- The preference persists across app restarts (localStorage) and is honored on first paint on subsequent loads, consistent with Task 3's acceptance criteria.

- [ ] **Step 1: Add the header toggle button**

```tsx
// src/components/line-numbers-toggle.tsx
'use client'

import { ListOrdered } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCodeLineNumbers } from '@/hooks/use-code-line-numbers'

export function LineNumbersToggle() {
  const [enabled, toggle] = useCodeLineNumbers()

  return (
    <Button
      variant={enabled ? 'secondary' : 'ghost'}
      size="icon"
      onClick={toggle}
      className="h-9 w-9"
      title={enabled ? 'Hide code line numbers' : 'Show code line numbers'}
    >
      <ListOrdered className="w-4 h-4" />
      <span className="sr-only">Toggle code line numbers</span>
    </Button>
  )
}
```

`useCodeLineNumbers` already initializes to `false` and corrects itself post-mount (Task 3, Step 3), so this button needs no additional `mounted` guard of its own — it will render `variant="ghost"` (off) on first paint everywhere, matching the statically-exported HTML, then flip if the stored preference is `true`.

- [ ] **Step 2: Wire it into the header**

```tsx
// src/app/page.tsx:36 (alongside the existing ThemeToggle import)
import { LineNumbersToggle } from '@/components/line-numbers-toggle'
```

```tsx
// src/app/page.tsx:942 (near existing <ThemeToggle />)
<LineNumbersToggle />
<ThemeToggle />
```

- [ ] **Step 3: Manual verification**

`pnpm electron:dev`. Click the new toggle: confirm every visible code block immediately grows/loses a line-number gutter with visible digits (Task 3's CSS makes this observable, not just a DOM attribute). Reload the app; confirm the last-chosen state persisted and the button shows the correct pressed state after mount.

- [ ] **Step 4: Commit**

```bash
git add src/components/line-numbers-toggle.tsx src/app/page.tsx
git commit -m "feat: add header toggle for code line numbers"
```

---

## Review Disposition

Both reviews returned **REVISE**; every required change from both is applied above.

| # | Finding | Source | Disposition |
|---|---|---|---|
| 1 | `pnpm lint` is broken repo-wide (`@caps/eslint-config` missing) | critic (CRITICAL) | Removed as a hard gate from all tasks; carved into a separate, out-of-scope bug bead. |
| 2 | Task 3 (now 3+4) shipped no CSS for the line-number gutter — attribute exists, nothing renders | architect + critic (both, independently) | Added Task 3 Step 2 with the exact CSS from `rehype-highlight-code-lines`'s README, scoped to `.markdown-body`. |
| 3 | `useState(readPreference)` hydration mismatch under static export | architect + critic (both, independently) | Hook now initializes `useState(false)` and corrects in `useEffect`, matching `theme-toggle.tsx`'s `mounted` pattern. |
| 4 | Badge at `top-2 left-2` over uniform `p-4` overlaps the first code line | architect | `pre` padding is now conditional: `pt-9 px-4 pb-4` when a language badge is shown, plain `p-4` otherwise. |
| 5 | `rehypePluginsLite` left on bare `rehypePreLanguage` (inconsistent with `rehypePlugins`) | architect | Task 1 now updates both exports to `[rehypePreLanguage, 'data-language']`. |
| 6 | Test count comment said "4 tests" for 3 `test()` blocks | critic (minor) | Corrected to "3 tests". |
| 7 | No `"test"` npm script, `node --test` gate undiscoverable | critic (recommendation) | Added `"test": "node --test tests/*.test.ts"` in Task 2. |
| 8 | `docs/docs/features.md` never reconciled with what ships | critic (finding) | Each of Tasks 1, 2, 4 updates its corresponding doc line. |
| 9 | Task 3 was oversized (plugin refactor + CSS + hook + UI control) | critic (sizing) | Split into Task 3 (plugin factory + CSS + hook, no UI) and Task 4 (header button only). |
| 10 | `@tailwindcss/typography`/`prose-pre:*` classes at `markdown-renderer.tsx:70` are dead (plugin not installed) — original plan worried about breaking them | architect | Confirmed moot; no action needed, noted here so a future reader doesn't reintroduce the typography plugin expecting these classes to already work. |

**Task ordering:** 1 → 2 → 3 → 4, linear. Tasks 1-2 share `markdown-renderer.tsx`'s `pre` component (2 rewrites 1's JSX). Tasks 3-4 share `plugins.ts` and are sequenced after 1-2 to avoid conflicting edits to the same two files; 4 directly depends on the hook 3 produces.
