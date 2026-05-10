import { common } from 'lowlight'
import rehypeCodeMeta from 'rehype-code-meta'
import rehypeHighlight from 'rehype-highlight'
import rehypeHighlightCodeLines from 'rehype-highlight-code-lines'
import rehypeImageToolkit from 'rehype-image-toolkit'
import rehypePreLanguage from 'rehype-pre-language'
import rehypeSlug from 'rehype-slug'
import remarkEmoji from 'remark-emoji'
import remarkFlexibleCodeTitles from 'remark-flexible-code-titles'
import remarkFlexibleContainers from 'remark-flexible-containers'
import remarkFlexibleMarkers from 'remark-flexible-markers'
import remarkFlexibleParagraphs from 'remark-flexible-paragraphs'
import remarkFlexibleToc from 'remark-flexible-toc'
import remarkGfm from 'remark-gfm'
import remarkIns from 'remark-ins'
import remarkBreaks from 'remark-breaks'
import type { PluggableList } from 'unified'
import { hljsDefineTerraform } from './terraform'

export const remarkPlugins: PluggableList = [
  remarkGfm,
  remarkIns,
  remarkBreaks,
  remarkFlexibleMarkers,
  remarkEmoji,
  remarkFlexibleParagraphs,
  remarkFlexibleContainers,
  remarkFlexibleCodeTitles,
  remarkFlexibleToc,
]

export const rehypePlugins: PluggableList = [
  // Raw HTML is disabled to avoid untrusted tags rendering as unknown elements
  // (e.g. `<servicename>`). If you need HTML, re-enable it safely with:
  //   import rehypeRaw from "rehype-raw"
  //   import rehypeSanitize, { defaultSchema } from "rehype-sanitize"
  //   const safeSchema = { ...defaultSchema, tagNames: [...(defaultSchema.tagNames ?? []), "details", "summary"] }
  //   const rehypePlugins = [rehypeRaw, [rehypeSanitize, safeSchema], ...]
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
  rehypePreLanguage,
  rehypeImageToolkit,
]

export const rehypePluginsLite: PluggableList = [
  rehypeCodeMeta,
  rehypeSlug,
  rehypePreLanguage,
  rehypeImageToolkit,
]
