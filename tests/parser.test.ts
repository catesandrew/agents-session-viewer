import test from 'node:test'
import assert from 'node:assert/strict'

import { filterConversationEvents } from '../src/lib/parser.ts'
import type { NormalizedEvent } from '../src/lib/types.ts'

test('filters assistant commentary progress messages', () => {
  const events: NormalizedEvent[] = [
    {
      kind: 'assistant',
      id: 'commentary',
      blocks: [{ type: 'text', text: 'The focused tests are green. I’m waiting on lint.' }],
      raw: { payload: { phase: 'commentary' } },
    },
    {
      kind: 'assistant',
      id: 'final',
      blocks: [{ type: 'text', text: 'Implemented the fix and verified it.' }],
      raw: { payload: { phase: 'final' } },
    },
  ]

  const filtered = filterConversationEvents(events)
  assert.deepEqual(filtered.map((event) => event.id), ['final'])
})

test('filters metadata-only hook and skill envelopes', () => {
  const events: NormalizedEvent[] = [
    {
      kind: 'user',
      id: 'hook',
      text: '',
      metadataText: '<hook_prompt hook_run_id="stop:4">yes, proceed</hook_prompt>',
      isMetadataOnly: true,
    },
    {
      kind: 'user',
      id: 'skill',
      text: '',
      metadataText: '<skill><name>cancel</name></skill>',
      isMetadataOnly: true,
    },
    {
      kind: 'user',
      id: 'real-user',
      text: 'load full history for this session',
      metadataText: '',
      isMetadataOnly: false,
    },
  ]

  const filtered = filterConversationEvents(events)
  assert.deepEqual(filtered.map((event) => event.id), ['real-user'])
})
