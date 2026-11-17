import { expect, test } from 'claude-code/testing'

import {
  collectTerms,
  fitRow,
  installedShortcuts,
  parsePrefix,
  parseTerms,
  termKey,
  termsMarkdown,
  toggleSticky,
  toggleTag,
  visibleTerms,
  withSticky,
} from '../hooks/lib'

test('a mode tag goes at the start of the draft, the cursor keeps its place', () => {
  const r = toggleTag('explain QAM', 7, { kind: 'mode', mode: 'STUDY' })
  expect(r.text).toBe('[STUDY] explain QAM')
  expect(r.cursor).toBe(15)
  // A second mode joins it; the same mode again takes it away.
  const two = toggleTag(r.text, r.cursor, { kind: 'mode', mode: 'DEEP' })
  expect(two.text).toBe('[STUDY] [DEEP] explain QAM')
  expect(toggleTag(two.text, 0, { kind: 'mode', mode: 'STUDY' }).text).toBe('[DEEP] explain QAM')
  // An empty box takes the tag alone, the cursor after it.
  expect(toggleTag('', 0, { kind: 'mode', mode: 'SELF-CHECK' })).toEqual({ text: '[SELF-CHECK] ', cursor: 13 })
})

test('a language line replaces the other one and sits after the modes', () => {
  const fr = toggleTag('[TECH] fix it', 13, { kind: 'lang', lang: 'FR' })
  expect(fr.text).toBe('[TECH] Reply in French. fix it')
  const ar = toggleTag(fr.text, fr.cursor, { kind: 'lang', lang: 'AR' })
  expect(ar.text).toBe('[TECH] Reply in Arabic. fix it')
  expect(ar.cursor).toBe(ar.text.length)
  expect(toggleTag(ar.text, 0, { kind: 'lang', lang: 'AR' }).text).toBe('[TECH] fix it')
})

test('an unknown bracket is left as typed', () => {
  expect(parsePrefix('[WIP] draft')).toEqual({ modes: [], lang: null, rest: '[WIP] draft', length: 0 })
  expect(toggleTag('[WIP] draft', 0, { kind: 'mode', mode: 'PLAN' }).text).toBe('[PLAN] [WIP] draft')
})

test('sticky tags go in front of a prompt once, never in front of a command', () => {
  expect(withSticky('hello', ['STUDY', 'FR'])).toBe('[STUDY] Reply in French. hello')
  expect(withSticky('[STUDY] hello', ['STUDY'])).toBe('[STUDY] hello')
  expect(withSticky('Reply in Arabic. hi', ['FR'])).toBe('Reply in Arabic. hi')
  expect(withSticky('/compact', ['STUDY'])).toBe('/compact')
  expect(withSticky('hello', [])).toBe('hello')
})

test('the sticky set toggles modes and keeps one language', () => {
  expect(toggleSticky([], { kind: 'mode', mode: 'DEEP' })).toEqual(['DEEP'])
  expect(toggleSticky(['DEEP'], { kind: 'mode', mode: 'DEEP' })).toEqual([])
  expect(toggleSticky(['DEEP', 'EN'], { kind: 'lang', lang: 'AR' })).toEqual(['DEEP', 'AR'])
})

const STUDY = `## Basics
- **Modulation** (FR: modulation | AR: تضمين) — changing a carrier wave so it can carry information.
- **Bandwidth** (FR: bande passante | AR: عرض النطاق): the range of frequencies a channel carries.
- **Noise** (FR: bruit | AR: ضوضاء) - unwanted signal added on the way.
- **Carrier** (FR: porteuse | AR: موجة حاملة)
- **Gain** (AR: كسب | FR: gain) — how much a stage amplifies.
\`\`\`
**Fake** (FR: faux | AR: مزيف) — inside code, ignored.
\`\`\`
Inline: **SNR** (FR: rapport signal sur bruit | AR: نسبة الإشارة إلى الضوضاء) — signal over noise, and **dB** (FR: décibel | AR: ديسيبل) — a log ratio.
Not a term: **bold text** without translations, and **Note** (see above).`

test('glossary: the STUDY format and its variants, in order, code skipped', () => {
  const t = parseTerms(STUDY)
  expect(t.map(x => x.en)).toEqual(['Modulation', 'Bandwidth', 'Noise', 'Carrier', 'Gain', 'SNR', 'dB'])
  expect(t[0]).toEqual({ en: 'Modulation', fr: 'modulation', ar: 'تضمين', note: 'changing a carrier wave so it can carry information.' })
  expect(t[1]?.note).toBe('the range of frequencies a channel carries.')
  expect(t[2]?.note).toBe('unwanted signal added on the way.')
  expect(t[3]).toEqual({ en: 'Carrier', fr: 'porteuse', ar: 'موجة حاملة', note: '' })
  expect(t[4]).toEqual({ en: 'Gain', fr: 'gain', ar: 'كسب', note: 'how much a stage amplifies.' })
  // Two terms on one line: each explanation stops where the next term starts.
  expect(t[5]?.note).toBe('signal over noise, and')
  expect(t[6]?.note).toBe('a log ratio.')
})

test('glossary: French-only and Arabic-only terms keep the other column empty', () => {
  expect(parseTerms('**Antenna** (FR: antenne) — radiates waves')).toEqual([{ en: 'Antenna', fr: 'antenne', ar: '', note: 'radiates waves' }])
  expect(parseTerms('**Router** (AR: موجّه)')).toEqual([{ en: 'Router', fr: '', ar: 'موجّه', note: '' }])
})

test('glossary: duplicates by case, accents and punctuation; the first wins, gaps merge', () => {
  const list = collectTerms([
    '**Modulation** (FR: modulation) — first explanation',
    '**modulation.** (FR: autre | AR: تضمين) — second explanation',
    '**Réseau** (FR: réseau | AR: شبكة)',
    '**reseau** (FR: x) — a network',
    '**QoS** (FR: qualité de service | AR: جودة الخدمة) — service quality',
    '**Q.o.S** (FR: y | AR: z) — other',
  ])
  expect(list).toEqual([
    { en: 'Modulation', fr: 'modulation', ar: 'تضمين', note: 'first explanation', seen: 0 },
    { en: 'Réseau', fr: 'réseau', ar: 'شبكة', note: 'a network', seen: 1 },
    { en: 'QoS', fr: 'qualité de service', ar: 'جودة الخدمة', note: 'service quality', seen: 2 },
  ])
  expect(termKey('Ré-seau!')).toBe('reseau')
})

test('glossary: search in every column, A-Z or order seen, Markdown copy', () => {
  const list = collectTerms([STUDY])
  expect(visibleTerms(list, 'bruit', 'seen').map(t => t.en)).toEqual(['Noise', 'SNR'])
  expect(visibleTerms(list, 'تضمين', 'seen').map(t => t.en)).toEqual(['Modulation'])
  expect(visibleTerms(list, 'decibel', 'seen').map(t => t.en)).toEqual(['dB'])
  expect(visibleTerms(list, '', 'az').map(t => t.en)).toEqual(['Bandwidth', 'Carrier', 'dB', 'Gain', 'Modulation', 'Noise', 'SNR'])
  const md = termsMarkdown(list.slice(3, 4), ['English', 'French', 'Arabic', 'Explanation'])
  expect(md).toBe('| English | French | Arabic | Explanation |\n|---|---|---|---|\n| **Carrier** | porteuse | موجة حاملة | — |')
})

test('shortcuts: only commands another mod serves, never a built-in of the same name', () => {
  const got = installedShortcuts([
    { name: 'usage-panel', source: 'plugin', plugin: 'cockpit' },
    { name: 'tasks', source: 'builtin' },
    { name: 'theme', source: 'builtin' },
    { name: 'tree', source: 'plugin', plugin: 'workspace' },
    { name: 'handoff', source: 'plugin', plugin: 'cockpit' },
    { name: 'compact', source: 'builtin' },
  ])
  expect(got).toEqual(['usage-panel', 'handoff', 'tree'])
})

test('fitRow keeps the fixed items and the others in order while they fit', () => {
  const items = [
    { key: 'a', width: 5, fixed: true },
    { key: 'b', width: 10 },
    { key: 'c', width: 10 },
    { key: 'd', width: 10 },
    { key: 'z', width: 6, fixed: true },
  ]
  expect(fitRow(items, 100, 5).hidden).toEqual([])
  const r = fitRow(items, 32, 5)
  expect(r.shown.map(x => x.key)).toEqual(['a', 'b', 'z'])
  expect(r.hidden.map(x => x.key)).toEqual(['c', 'd'])
})
