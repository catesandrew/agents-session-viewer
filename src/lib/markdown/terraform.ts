import type { CallbackResponse, HLJSApi, Language, LanguageFn, Mode } from 'highlight.js'

const tok = (name: string) => ({ scope: name, className: name }) as any

const KEYWORDS = {
  keyword: [
    'terraform',
    'resource',
    'data',
    'module',
    'provider',
    'variable',
    'output',
    'locals',
    'provisioner',
    'connection',
    'backend',
    'dynamic',
    'lifecycle',
    'moved',
    'import',
    'required_providers',
    'required_version',
    'depends_on',
    'for_each',
    'count',
    'sensitive',
    'if',
    'else',
    'for',
    'in',
  ].join(' '),
  literal: 'true false null',
}

const BUILTIN_FUNCTIONS = [
  'abs',
  'abspath',
  'alltrue',
  'anytrue',
  'basename',
  'base64decode',
  'base64encode',
  'base64gzip',
  'base64sha256',
  'base64sha512',
  'bcrypt',
  'can',
  'ceil',
  'cidrcontains',
  'cidrhost',
  'cidrmerge',
  'cidrnetmask',
  'cidroverlap',
  'cidrsubnet',
  'cidrsubnets',
  'chomp',
  'chunklist',
  'coalesce',
  'coalescelist',
  'compact',
  'concat',
  'contains',
  'csvdecode',
  'distinct',
  'dirname',
  'element',
  'endswith',
  'file',
  'filebase64',
  'filebase64sha256',
  'filebase64sha512',
  'fileexists',
  'filemd5',
  'fileset',
  'filesha1',
  'filesha256',
  'filesha512',
  'flatten',
  'floor',
  'format',
  'formatdate',
  'formatlist',
  'indent',
  'index',
  'join',
  'jsondecode',
  'jsonencode',
  'keys',
  'length',
  'log',
  'lookup',
  'lower',
  'matchkeys',
  'max',
  'md5',
  'merge',
  'min',
  'nonsensitive',
  'one',
  'parseint',
  'pathexpand',
  'pow',
  'range',
  'regex',
  'regexall',
  'replace',
  'reverse',
  'rsadecrypt',
  'rsaencrypt',
  'sensitive',
  'setintersection',
  'setproduct',
  'setsubtract',
  'setunion',
  'sha1',
  'sha256',
  'sha512',
  'signum',
  'slice',
  'sort',
  'split',
  'sqrt',
  'startswith',
  'strrev',
  'substr',
  'sum',
  'templatefile',
  'timeadd',
  'timestamp',
  'title',
  'tobool',
  'tolist',
  'tomap',
  'tonumber',
  'tosensitive',
  'toset',
  'tostring',
  'transpose',
  'trim',
  'trimprefix',
  'trimspace',
  'trimsuffix',
  'try',
  'upper',
  'urlencode',
  'uuid',
  'uuidv5',
  'values',
  'yamldecode',
  'yamlencode',
  'zipmap',
]

const BUILTIN_FUNCTION_PATTERN = BUILTIN_FUNCTIONS.join('|')

export const hljsDefineTerraform: LanguageFn = (hljs: HLJSApi): Language => {
  const IDENTIFIER = '[A-Za-z_][0-9A-Za-z_-]*'

  const BLOCK_COMMENT = hljs.C_BLOCK_COMMENT_MODE
  const LINE_COMMENT = hljs.C_LINE_COMMENT_MODE
  const HASH_COMMENT = hljs.COMMENT('#', '$')

  const COMMENTS = [BLOCK_COMMENT, LINE_COMMENT, HASH_COMMENT]

  const NUMBER: Mode = {
    ...tok('number'),
    variants: [
      { begin: /-?0x[0-9A-Fa-f](?:_[0-9A-Fa-f])*/ },
      { begin: /-?0b[01](?:_[01])*/ },
      { begin: /-?0o[0-7](?:_[0-7])*/ },
      {
        begin: /-?(?:\d+(?:_\d+)*(?:\.\d+(?:_\d+)*)?|\.\d+(?:_\d+)*)(?:[eE][+-]?\d+(?:_\d+)*)?/,
      },
    ],
    relevance: 0,
  }

  const BUILTIN_FUNCTION: Mode = {
    ...tok('built_in'),
    begin: new RegExp(`\\b(?:${BUILTIN_FUNCTION_PATTERN})\\b(?=\\s*\\()`, 'i'),
    relevance: 0,
  }

  const INTERPOLATION: Mode = {
    ...tok('subst'),
    begin: /\${/,
    end: /\}/,
    keywords: KEYWORDS,
    contains: [],
  }

  const DOUBLE_QUOTED: Mode = {
    ...tok('string'),
    begin: '"',
    end: '"',
    illegal: '\\n',
    contains: [hljs.BACKSLASH_ESCAPE, INTERPOLATION],
  }

  const HEREDOC: Mode = {
    ...tok('string'),
    begin: /<<-?\s*([A-Z_][A-Z0-9_]*)\s*\n/,
    end: /([A-Z_][A-Z0-9_]*)/,
    contains: [INTERPOLATION],
    'on:begin': (match: RegExpMatchArray, response: CallbackResponse) => {
      response.data._heredocMarker = match[1]
    },
    'on:end': (match: RegExpMatchArray, response: CallbackResponse) => {
      if (response.data._heredocMarker !== match[1]) {
        response.ignoreMatch()
      }
    },
  }

  const REFERENCE: Mode = {
    ...tok('variable'),
    match:
      /\b(?:var|local|module|data|path|self|each|count|terraform|provider)\b(?:\.[A-Za-z0-9_*][A-Za-z0-9_.-]*)+/,
  }

  const ATTRIBUTE: Mode = {
    ...tok('attr'),
    begin: new RegExp(`${IDENTIFIER}(?=\\s*=)`),
    relevance: 0,
  }

  const ARRAY: Mode = {
    begin: /\[/,
    end: /\]/,
    relevance: 0,
    contains: [],
  }

  const OBJECT: Mode = {
    begin: /\{/,
    end: /\}/,
    relevance: 0,
    contains: [],
  }

  const VALUE_CONTAINS: Mode[] = [
    BUILTIN_FUNCTION,
    NUMBER,
    DOUBLE_QUOTED,
    HEREDOC,
    REFERENCE,
    ARRAY,
    OBJECT,
  ]

  INTERPOLATION.contains = [...VALUE_CONTAINS, ...COMMENTS]
  ARRAY.contains = [...VALUE_CONTAINS, ...COMMENTS]
  OBJECT.contains = [ATTRIBUTE, ...VALUE_CONTAINS, ...COMMENTS]

  const language: Language = {
    name: 'Terraform',
    aliases: ['tf', 'hcl'],
    keywords: KEYWORDS,
    contains: [
      ...COMMENTS,
      ATTRIBUTE,
      BUILTIN_FUNCTION,
      NUMBER,
      DOUBLE_QUOTED,
      HEREDOC,
      ARRAY,
      OBJECT,
      REFERENCE,
    ],
  }

  return language
}

export default function registerTerraform(hljs: HLJSApi): void {
  hljs.registerLanguage('terraform', hljsDefineTerraform)
}
