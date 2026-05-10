import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatSessionMessageCount,
  hasKnownMessageCount,
  sumKnownMessageCounts,
} from '../src/lib/session-count.ts'

test('formats known message counts normally', () => {
  assert.equal(formatSessionMessageCount({ messageCount: 2, summaryReady: true }), '2 messages')
  assert.equal(formatSessionMessageCount({ messageCount: 1, summaryReady: true }), '1 message')
})

test('shows counting placeholder for unknown summary counts', () => {
  assert.equal(formatSessionMessageCount({ messageCount: -1, summaryReady: false }), 'Counting…')
  assert.equal(hasKnownMessageCount({ messageCount: -1, summaryReady: false }), false)
})

test('sums only known message counts', () => {
  assert.equal(
    sumKnownMessageCounts([
      { messageCount: 3, summaryReady: true },
      { messageCount: -1, summaryReady: false },
      { messageCount: 2, summaryReady: true },
    ]),
    5,
  )
})
