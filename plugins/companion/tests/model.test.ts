import { expect, test } from 'claude-code/testing'

import { actOf, asleepOf, castleOf, freshRaw, isCommitCommand, isHardPrompt, isTestCommand, lightOf, looksMisfit, tenths, viewOf } from '../hooks/model'
import { lagoonSvg, stage } from '../hooks/scene'
import { crabSvg, crabText } from '../hooks/crab'
import { STRINGS } from '../hooks/i18n'

test('tenths: one band or shell per started 10%', () => {
  expect([null, 0, 1, 10, 10.5, 55, 99, 100, 140].map(tenths)).toEqual([0, 0, 1, 1, 2, 6, 10, 10, 10])
})

test('band colours: green, yellow, orange, red on the top two only', () => {
  expect(Array.from({ length: 10 }, (_, i) => stage(i))).toEqual([
    '#3bb26a', '#3bb26a', '#3bb26a', '#3bb26a', '#3bb26a', '#e0b12a', '#e0b12a', '#f07418', '#e5484d', '#e5484d',
  ])
})

test('daylight and sleep stages follow the cache age', () => {
  const r = { touchedAt: 1000, ttlMs: 100_000, isBusy: false }
  expect(lightOf(r, 1000)).toBe(1)
  expect(lightOf(r, 51_000)).toBe(0.5)
  expect(lightOf(r, 200_000)).toBe(0)
  expect(lightOf({ ...r, isBusy: true }, 200_000)).toBe(1)
  expect(lightOf({ ...r, touchedAt: 0 }, 200_000)).toBe(1)
  expect([1, 0.7, 0.65, 0.4, 0.35, 0.05, 0].map(asleepOf)).toEqual([0, 0, 1, 1, 2, 2, 3])
})

test('castle: done tasks up to five levels, a flag when all are done', () => {
  expect(castleOf({ total: 0, done: 0 })).toEqual({ castle: 0, flag: false })
  expect(castleOf({ total: 4, done: 2 })).toEqual({ castle: 2, flag: false })
  expect(castleOf({ total: 8, done: 8 })).toEqual({ castle: 5, flag: true })
})

test('activities from tool names', () => {
  expect(['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash', 'WebSearch', 'WebFetch', 'mcp__x__web_search', 'Agent'].map(actOf)).toEqual([
    'read', 'read', 'read', 'edit', 'edit', 'bash', 'web', 'web', 'web', null,
  ])
})

test('test runs and commits are recognised', () => {
  for (const c of ['npm test', 'pnpm run test', 'pytest -q', 'python -m pytest', 'cargo test', 'go test ./...', './gradlew test', 'claude plugin test x', 'cd a && vitest run'])
    expect(isTestCommand(c), c).toBe(true)
  for (const c of ['ls', 'cat test.txt', 'git status', 'npm install']) expect(isTestCommand(c), c).toBe(false)
  expect(isCommitCommand('git commit -m "x"')).toBe(true)
  expect(isCommitCommand('git -C repo commit -am x')).toBe(true)
  expect(isCommitCommand('git commit --dry-run')).toBe(false)
  expect(isCommitCommand('git status')).toBe(false)
})

test('misfit: hard prompts in en, fr, ar on a small model only', () => {
  expect(isHardPrompt('Refactor the parser')).toBe(true)
  expect(isHardPrompt('Réfléchis à la sécurité du serveur')).toBe(true)
  expect(isHardPrompt('صمم معمارية الخادم')).toBe(true)
  expect(isHardPrompt('fix the typo')).toBe(false)
  expect(looksMisfit('Refactor the parser', 'claude-haiku-5-5')).toBe(true)
  expect(looksMisfit('Refactor the parser', 'claude-opus-5-5')).toBe(false)
})

test('every mood has a word in each language and a crab on each surface', () => {
  const moods = Object.keys(STRINGS.en.mood) as (keyof typeof STRINGS.en.mood)[]
  for (const l of ['en', 'fr', 'ar'] as const) for (const m of moods) expect(STRINGS[l].mood[m].length > 0, `${l} ${m}`).toBe(true)
  for (const m of moods) {
    expect(crabSvg(m)).toContain(`m-${m}`)
    expect(crabText(m).length > 0).toBe(true)
  }
  expect(crabSvg('ready')).toContain('prefers-reduced-motion')
})

test('the strip can sit on the right edge', () => {
  const v = viewOf(freshRaw(), 0)
  const s = lagoonSvg(v, { width: 240, side: 'right', mode: 'strip' })
  expect(s).toContain('x="100%"')
  expect(s).toContain('translate(-240 0)')
})
