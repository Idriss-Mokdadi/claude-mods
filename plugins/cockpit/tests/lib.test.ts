import { expect, test } from 'claude-code/testing'

import { advise, attribute, costOf, filesTouched, fitOf, handoffName, levelOf, pingCost } from '../hooks/lib'

test('advisor: short and factual prompts go to Haiku, low', () => {
  expect(advise('short: what is OFDM?')).toMatchObject({ model: 'haiku', effort: 'low' })
  expect(advise('quick, the capital of Tunisia')).toMatchObject({ model: 'haiku', effort: 'low' })
  expect(advise('What is the default MTU of Ethernet?')).toMatchObject({ model: 'haiku', effort: 'low' })
})

test('advisor: normal coding and writing go to Sonnet, medium', () => {
  expect(advise('Fix the bug in parser.py where empty lines crash the import')).toMatchObject({ model: 'sonnet', effort: 'medium' })
  expect(advise('Write a polite email to my professor asking to move the exam meeting to Thursday afternoon, please')).toMatchObject({
    model: 'sonnet',
    effort: 'medium',
  })
})

test('advisor: deep work and long documents go to Opus, high', () => {
  expect(advise('Think deeply about the architecture of the 5G core slicing manager')).toMatchObject({ model: 'opus', effort: 'high' })
  expect(advise('x '.repeat(4000))).toMatchObject({ model: 'opus', effort: 'high', reason: 'long pasted document' })
  const trace = 'debug this crash please\n' + 'at frame\n'.repeat(12)
  expect(advise(trace)).toMatchObject({ model: 'opus', effort: 'high' })
})

test('effort fit: green, yellow and red, with direction', () => {
  expect(fitOf('medium', 'medium')).toEqual({ fit: 'green', dir: '' })
  expect(fitOf('medium', 'high')).toEqual({ fit: 'yellow', dir: 'high' })
  expect(fitOf('low', 'max')).toEqual({ fit: 'red', dir: 'high' })
  expect(fitOf('high', 'low')).toEqual({ fit: 'red', dir: 'low' })
  expect(fitOf('high', null)).toEqual({ fit: 'unknown', dir: '' })
})

test('budget levels follow the thresholds', () => {
  expect(levelOf(10, 70, 85)).toBe('ok')
  expect(levelOf(70, 70, 85)).toBe('warning')
  expect(levelOf(91, 70, 85)).toBe('critical')
})

test('prices: per-model table and the ping estimate', () => {
  const u = { input_tokens: 1e6, output_tokens: 1e6, cache_read_input_tokens: 2e6, cache_creation_input_tokens: 1e6 }
  expect(Math.round(costOf('claude-opus-5-5', u) * 100) / 100).toBe(32.4)
  // 100k tokens read from the cache on Opus 5.5 at $0.20/M, plus a few tokens.
  expect(Math.round(pingCost('claude-opus-5-5', 100_000) * 1e5) / 1e5).toBe(0.02026)
})

const MSGS = [
  { role: 'user' as const, text: 'Refactor the band', toolUses: [] },
  {
    role: 'assistant' as const,
    text: 'On it.',
    toolUses: [
      { tool: 'Read', input: { file_path: '/r/a.ts' }, text: 'x'.repeat(4000) },
      { tool: 'Edit', input: { file_path: '/r/a.ts', old_string: 'a', new_string: 'b' }, text: 'ok' },
      { tool: 'Skill', input: { skill: 'pdf' }, text: 'y'.repeat(400) },
      { tool: 'Agent', input: { subagent_type: 'Explore', prompt: 'find' }, text: 'z'.repeat(800) },
      { tool: 'Write', input: { file_path: '/r/b.md', content: 'hi' }, text: 'ok' },
    ],
  },
]

test('attribution: tools, skills and subagents, largest first', () => {
  const { rows } = attribute(MSGS)
  expect(rows[0]).toMatchObject({ key: 'Read', kind: 'tool', calls: 1 })
  expect(rows.find(r => r.kind === 'skill')).toMatchObject({ key: 'pdf' })
  expect(rows.find(r => r.kind === 'agent')).toMatchObject({ key: 'Explore' })
})

test('handoff helpers: touched files and the file name', () => {
  expect(filesTouched(MSGS)).toEqual(['/r/a.ts', '/r/b.md'])
  expect(handoffName(Date.parse('2026-11-04T20:15:00Z'))).toBe('HANDOFF-2026-11-04-2015.md')
})
