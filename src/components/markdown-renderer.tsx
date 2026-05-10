'use client'

import ReactMarkdown from 'react-markdown'
import 'highlight.js/styles/github-dark.css'
import { rehypePlugins, rehypePluginsLite, remarkPlugins } from '@/lib/markdown/plugins'
import { memo, useMemo } from 'react'
import { Check } from 'lucide-react'

interface MarkdownRendererProps {
  children: string
  className?: string
}

// This is here to make “VS Code–style” markdown render correctly even when the
// source text doesn’t strictly follow Markdown spacing rules.
//
// In Codex logs, people often write lists/headings without blank lines, or with
// bullet characters like `•` / `·` or numbering like `1)` instead of `1.`.
// Markdown parsers usually **require** a blank line before a list/heading, and
// only recognize `-`/`*`/`+` or `1.` for lists.
//
// `normalizeMarkdownForDisplay()` fixes that by:
// - converting `•` / `·` bullets into `- ` so they become real list items
// - converting `1)` into `1.` for ordered lists
// - inserting a blank line **before** list items, headings, and blockquotes when missing
//
// So it’s a “lenient” preprocessor to match VS Code preview fidelity, not
// strict spec. If you want strict markdown instead, I can remove it.
function normalizeMarkdownForDisplay(input: string): string {
  const lines = input.replace(/\r\n/g, '\n').split('\n')
  const normalized: string[] = []

  const isBlank = (line: string) => line.trim().length === 0
  const isList = (line: string) => /^\s*(?:[-*+]|(?:\d+\.))\s+/.test(line)
  const isHeading = (line: string) => /^\s{0,3}#{1,6}\s+/.test(line)
  const isBlockQuote = (line: string) => /^\s*>\s+/.test(line)

  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i]

    if (/^\s*[•·]\s+/.test(line)) {
      line = line.replace(/^\s*[•·]\s+/, '- ')
    }

    if (/^\s*\d+\)\s+/.test(line)) {
      line = line.replace(/^\s*(\d+)\)\s+/, '$1. ')
    }

    const prev = normalized.length > 0 ? normalized[normalized.length - 1] : ''

    if ((isList(line) || isHeading(line) || isBlockQuote(line)) && !isBlank(prev)) {
      normalized.push('')
    }

    normalized.push(line)
  }

  return normalized.join('\n')
}

function MarkdownRenderer({ children, className = '' }: MarkdownRendererProps) {
  const normalizedText = useMemo(() => normalizeMarkdownForDisplay(children), [children])
  const activeRehypePlugins = useMemo(
    () => (normalizedText.includes('```') ? rehypePlugins : rehypePluginsLite),
    [normalizedText],
  )

  return (
    <div
      className={`markdown-body prose prose-sm dark:prose-invert max-w-none prose-pre:overflow-x-auto prose-pre:max-w-full ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={activeRehypePlugins}
        skipHtml={false}
        components={{
          h1: ({ node, ...props }) => (
            <h1 {...props} className="text-3xl font-bold mt-6 mb-4 border-b border-border pb-2" />
          ),
          h2: ({ node, ...props }) => (
            <h2
              {...props}
              className="text-2xl font-bold mt-5 mb-3 border-b border-border/50 pb-1"
            />
          ),
          h3: ({ node, ...props }) => <h3 {...props} className="text-xl font-semibold mt-4 mb-2" />,
          h4: ({ node, ...props }) => <h4 {...props} className="text-lg font-semibold mt-3 mb-2" />,
          h5: ({ node, ...props }) => (
            <h5 {...props} className="text-base font-semibold mt-2 mb-1" />
          ),
          h6: ({ node, ...props }) => (
            <h6 {...props} className="text-sm font-semibold mt-2 mb-1 text-muted-foreground" />
          ),

          blockquote: ({ node, ...props }) => (
            <blockquote
              {...props}
              className="border-l-4 border-primary/50 pl-4 py-2 my-4 bg-secondary/30 rounded-r italic text-muted-foreground"
            />
          ),

          hr: ({ node, ...props }) => <hr {...props} className="my-6 border-border" />,

          p: ({ node, ...props }) => <p {...props} className="my-3 leading-7" />,
          pre: ({ node, ...props }) => (
            <pre
              {...props}
              className="overflow-x-auto bg-secondary/50 rounded-lg p-4 border border-border my-4"
            />
          ),
          code: ({ node, className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '')
            return match ? (
              <code className={className} {...props}>
                {children}
              </code>
            ) : (
              <code
                className="bg-secondary px-1.5 py-0.5 rounded text-sm font-mono border border-border/50"
                {...props}
              >
                {children}
              </code>
            )
          },
          a: ({ node, ...props }) => (
            <a
              {...props}
              className="text-primary hover:underline underline-offset-4 font-medium"
              target="_blank"
              rel="noopener noreferrer"
            />
          ),
          ul: ({ node, ...props }) => (
            <ul {...props} className="list-disc list-outside ml-6 my-3 space-y-2" />
          ),
          ol: ({ node, ...props }) => (
            <ol {...props} className="list-decimal list-outside ml-6 my-3 space-y-2" />
          ),
          li: ({ node, children, ...props }) => {
            const content = String(children)
            const isTaskList =
              content.startsWith('[') && (content.includes('[ ]') || content.includes('[x]'))

            if (isTaskList) {
              const isChecked = content.includes('[x]')
              const text = content.replace(/^\[(x| )\]\s*/, '')
              return (
                <li {...props} className="flex items-start gap-2 list-none -ml-6">
                  <div
                    className={`mt-0.5 flex h-4 w-4 items-center justify-center rounded border ${
                      isChecked ? 'bg-primary border-primary' : 'border-border'
                    }`}
                  >
                    {isChecked && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <span className={isChecked ? 'line-through text-muted-foreground' : ''}>
                    {text}
                  </span>
                </li>
              )
            }

            return (
              <li {...props} className="pl-2">
                {children}
              </li>
            )
          },
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-4 rounded-lg border border-border">
              <table {...props} className="border-collapse w-full" />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th
              {...props}
              className="border-b-2 border-border px-4 py-2 bg-muted font-semibold text-left"
            />
          ),
          td: ({ node, ...props }) => (
            <td
              {...props}
              className="border-b border-border px-4 py-2 hover:bg-secondary/50 transition-colors"
            />
          ),
          strong: ({ node, ...props }) => (
            <strong {...props} className="font-bold text-foreground" />
          ),
          em: ({ node, ...props }) => <em {...props} className="italic" />,
          del: ({ node, ...props }) => (
            <del {...props} className="line-through text-muted-foreground" />
          ),
          img: ({ node, ...props }) => (
            <img {...props} className="max-w-full h-auto rounded-lg border border-border my-4" />
          ),
        }}
      >
        {normalizedText}
      </ReactMarkdown>
    </div>
  )
}

export default memo(MarkdownRenderer)
