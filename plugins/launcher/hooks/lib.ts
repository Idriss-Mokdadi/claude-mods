// Pure logic: mode tags in the prompt, sticky tags, glossary parsing, and the
// band's one-row fit. No engine calls here, so it is easy to test.

import type { Order, Term } from '../types'

// The owner's answer modes, in band order.
export const MODES = [
  'SHORT', 'STUDY', 'DEEP', 'ANALYSE', 'TECH', 'RESEARCH', 'TOOLS',
  'DECIDE', 'WRITE', 'PLAN', 'CHALLENGE', 'SELF-CHECK', 'BRAINSTORM', 'CREATIVE',
] as const
export type Mode = (typeof MODES)[number]

export const LANGS = ['EN', 'FR', 'AR'] as const
export type ReplyLang = (typeof LANGS)[number]
export const LANG_LINE: Record<ReplyLang, string> = {
  EN: 'Reply in English.',
  FR: 'Reply in French.',
  AR: 'Reply in Arabic.',
}

// Shortcuts to the owner's other mods: shown only when the command is installed.
export const SHORTCUTS = [
  { id: 'usage', command: 'usage-panel' },
  { id: 'handoff', command: 'handoff' },
  { id: 'files', command: 'tree' },
  { id: 'crew', command: 'crew' },
  { id: 'memory', command: 'memory-list' },
  { id: 'tasks', command: 'tasks' },
  { id: 'undo', command: 'undo' },
  { id: 'theme', command: 'theme' },
] as const
export type ShortcutId = (typeof SHORTCUTS)[number]['id']

export type CommandLike = { name: string; source?: string; plugin?: string }

// The shortcut commands another mod serves. A built-in of the same name
// (Claude Code has its own /tasks and /theme) does not count.
// Where Claude Code keeps a name for itself, the mod serves another one:
// taskboard falls back to /taskboard, companion to /lagoon.
export const ALIASES: Record<string, readonly string[]> = { tasks: ['tasks', 'taskboard'], theme: ['theme', 'lagoon'] }

// The plugin command that serves a shortcut, or undefined.
export function resolveShortcut(list: readonly CommandLike[], command: string): string | undefined {
  for (const name of ALIASES[command] ?? [command])
    if (list.some(c => c.name === name && c.source !== 'builtin' && c.plugin !== 'launcher')) return name
  return undefined
}

export function installedShortcuts(list: readonly CommandLike[]): string[] {
  return SHORTCUTS.map(s => s.command).filter(n => resolveShortcut(list, n) !== undefined)
}

// ---------------------------------------------------------------------------
// Tags at the start of the prompt: `[STUDY] [DEEP] Reply in French. rest`.

const MODE_SET = new Set<string>(MODES)
const isMode = (s: string): s is Mode => MODE_SET.has(s)
const LANG_RE = /^Reply in (English|French|Arabic)\.\s*/
const LANG_OF: Record<string, ReplyLang> = { English: 'EN', French: 'FR', Arabic: 'AR' }

export type Prefix = { modes: Mode[]; lang: ReplyLang | null; rest: string; length: number }

export function parsePrefix(text: string): Prefix {
  const modes: Mode[] = []
  let i = 0
  for (;;) {
    const m = /^\[([A-Z-]+)\]\s*/.exec(text.slice(i))
    if (!m || !isMode(m[1] ?? '')) break
    const tag = m[1] as Mode
    if (!modes.includes(tag)) modes.push(tag)
    i += m[0].length
  }
  let lang: ReplyLang | null = null
  const l = LANG_RE.exec(text.slice(i))
  if (l) {
    lang = LANG_OF[l[1] ?? ''] ?? null
    i += l[0].length
  }
  return { modes, lang, rest: text.slice(i), length: i }
}

export const buildPrefix = (modes: readonly string[], lang: ReplyLang | null): string =>
  `${modes.map(m => `[${m}] `).join('')}${lang ? `${LANG_LINE[lang]} ` : ''}`

export type Tag = { kind: 'mode'; mode: Mode } | { kind: 'lang'; lang: ReplyLang }

export const tagText = (t: Tag): string => (t.kind === 'mode' ? `[${t.mode}]` : LANG_LINE[t.lang])
export const tagId = (t: Tag): string => (t.kind === 'mode' ? t.mode : t.lang)
export const tagOf = (id: string): Tag | null =>
  isMode(id) ? { kind: 'mode', mode: id } : (LANGS as readonly string[]).includes(id) ? { kind: 'lang', lang: id as ReplyLang } : null

// Toggles a tag at the start of the draft: a mode is added (or taken away when
// already there), a language replaces the one there (or is taken away when the
// same). The rest of the draft and the cursor's place in it stay.
export function toggleTag(text: string, cursor: number, t: Tag): { text: string; cursor: number } {
  const p = parsePrefix(text)
  let modes = p.modes as string[]
  let lang = p.lang
  if (t.kind === 'mode') modes = modes.includes(t.mode) ? modes.filter(m => m !== t.mode) : [...modes, t.mode]
  else lang = lang === t.lang ? null : t.lang
  const head = buildPrefix(modes, lang)
  const at = Math.max(0, Math.min(cursor, text.length))
  const next = at <= p.length ? head.length : at - p.length + head.length
  return { text: head + p.rest, cursor: next }
}

// Sticky: the sticky tags go in front of a prompt that lacks them. A slash
// command is left as typed; tags already typed are kept, not doubled.
export function withSticky(text: string, sticky: readonly string[]): string {
  if (!sticky.length || text.trimStart().startsWith('/')) return text
  const p = parsePrefix(text)
  const modes = [...p.modes] as string[]
  let lang = p.lang
  for (const id of sticky) {
    const t = tagOf(id)
    if (!t) continue
    if (t.kind === 'mode' && !modes.includes(t.mode)) modes.push(t.mode)
    if (t.kind === 'lang' && !lang) lang = t.lang
  }
  return buildPrefix(modes, lang) + p.rest
}

// Sticky set after pressing a tag: a mode toggles, a language replaces the other.
export function toggleSticky(sticky: readonly string[], t: Tag): string[] {
  const id = tagId(t)
  if (sticky.includes(id)) return sticky.filter(s => s !== id)
  const kept = t.kind === 'lang' ? sticky.filter(s => !(LANGS as readonly string[]).includes(s)) : [...sticky]
  return [...kept, id]
}

// ---------------------------------------------------------------------------
// Glossary: `**Term** (FR: … | AR: …) — explanation`, as the STUDY mode writes.
// Also ":" or "-" before the explanation, or none at all.

// Case, accents and punctuation do not make a new term.
export const termKey = (s: string): string =>
  s.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

const HEAD = /\*\*([^*\n]{1,100}?)\*\*\s*\(([^()\n]{0,300})\)/gu

const clean = (s: string): string =>
  s
    .replace(/\*\*|__|`/g, '')
    .replace(/^[*_"'«“\s]+|[*_"'»”\s]+$/gu, '')
    .replace(/\s+/g, ' ')
    .trim()

function parseInner(inner: string): { fr: string; ar: string } | null {
  let fr = ''
  let ar = ''
  let found = false
  for (const part of inner.split(/[|;·]/)) {
    const m = /^\s*(FR|AR)\s*[:：=-]\s*(.*)$/iu.exec(part)
    if (!m) continue
    found = true
    const v = clean(m[2] ?? '')
    if ((m[1] ?? '').toUpperCase() === 'FR') fr ||= v
    else ar ||= v
  }
  return found ? { fr, ar } : null
}

const cleanNote = (s: string): string =>
  clean(s.replace(/^\s*(?:[—–:-]+|\s)\s*/u, '')).replace(/[,;]$/, '').trim()

// Every term of one text, in the order written; code blocks are skipped.
export function parseTerms(text: string): Omit<Term, 'seen'>[] {
  const out: Omit<Term, 'seen'>[] = []
  let inFence = false
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const heads = [...line.matchAll(HEAD)]
    heads.forEach((m, i) => {
      const inner = parseInner(m[2] ?? '')
      const en = clean(m[1] ?? '')
      if (!inner || !en || !termKey(en)) return
      const from = (m.index ?? 0) + m[0].length
      const to = heads[i + 1]?.index ?? line.length
      out.push({ en, fr: inner.fr, ar: inner.ar, note: cleanNote(line.slice(from, to)) })
    })
  }
  return out
}

// Terms of the whole chat: the first mention wins, later ones fill a missing
// French, Arabic or explanation.
export function collectTerms(texts: readonly string[]): Term[] {
  const by = new Map<string, Term>()
  for (const t of texts)
    for (const x of parseTerms(t)) {
      const k = termKey(x.en)
      const had = by.get(k)
      if (!had) by.set(k, { ...x, seen: by.size })
      else by.set(k, { ...had, fr: had.fr || x.fr, ar: had.ar || x.ar, note: had.note || x.note })
    }
  return [...by.values()]
}

export function visibleTerms(terms: readonly Term[], query: string, order: Order): Term[] {
  const q = termKey(query)
  const hit = q ? terms.filter(t => [t.en, t.fr, t.ar, t.note].some(s => termKey(s).includes(q))) : [...terms]
  return order === 'az' ? hit.sort((a, b) => a.en.localeCompare(b.en, 'en', { sensitivity: 'base' })) : hit.sort((a, b) => a.seen - b.seen)
}

const cell = (s: string): string => (s || '—').replace(/\|/g, '\\|')

export function termsMarkdown(terms: readonly Term[], heads: readonly [string, string, string, string]): string {
  return [
    `| ${heads.join(' | ')} |`,
    '|---|---|---|---|',
    ...terms.map(t => `| **${cell(t.en)}** | ${cell(t.fr)} | ${cell(t.ar)} | ${cell(t.note)} |`),
  ].join('\n')
}

// ---------------------------------------------------------------------------
// The band's one row: fixed items always, the others in order while they fit,
// the rest behind a More button.

// Cells a label takes: one per code point, two for an emoji.
export const textWidth = (s: string): number => [...s].reduce((n, ch) => n + (/\p{Extended_Pictographic}/u.test(ch) ? 2 : 1), 0)

export type Item = { key: string; width: number; fixed?: boolean }

export function fitRow<T extends Item>(items: readonly T[], columns: number, moreWidth: number): { shown: T[]; hidden: T[] } {
  const cols = Math.max(10, columns || 60)
  const total = (xs: readonly T[]) => xs.reduce((n, x) => n + x.width, 0)
  if (total(items) <= cols) return { shown: [...items], hidden: [] }
  let room = cols - moreWidth - total(items.filter(x => x.fixed))
  const shown: T[] = []
  const hidden: T[] = []
  let isFull = false
  for (const x of items) {
    if (x.fixed) shown.push(x)
    else if (!isFull && x.width <= room) {
      shown.push(x)
      room -= x.width
    } else {
      isFull = true
      hidden.push(x)
    }
  }
  return { shown, hidden }
}
