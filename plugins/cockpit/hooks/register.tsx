import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionMessage, SessionUsage, PluginOptions } from 'claude-code'

import type { Advice, Cache, Handoff, Level, Limit, Mood, PaneData, Snapshot } from '../types'
import { CLAY, CRAB_CSS, crab, crabText } from './crab'
import { STRINGS, fill, langOf } from './i18n'
import type { Lang, Strings } from './i18n'
import {
  adviceFor,
  attribute,
  bar,
  costOf,
  familyOf,
  filesTouched,
  fmtClock,
  fmtCost,
  fmtSpan,
  fmtTokens,
  handoffName,
  levelOf,
  modelName,
  pingCost,
  transcriptText,
} from './lib'

const P = 'cockpit'
const PANE = 'cockpit-usage'

const snapshot = atom({ plugin: 'cockpit', key: 'snapshot' } as const, null, { shape: 'snap-1' })
const advice = atom({ plugin: 'cockpit', key: 'advice' } as const, null, { shape: 'adv-1' })
const effort = atom({ plugin: 'cockpit', key: 'effort' } as const, null)
const now = atom({ plugin: 'cockpit', key: 'now' } as const, 0)
const cache = atom({ plugin: 'cockpit', key: 'cache' } as const, { touchedAt: 0, pings: 0, pingUsd: 0, detectedTtl: null }, { shape: 'cache-1' })
const pane = atom({ plugin: 'cockpit', key: 'pane' } as const, null, { shape: 'pane-1' })
const alerted = atom({ plugin: 'cockpit', key: 'alerted' } as const, 'ok')
const handoff = atom({ plugin: 'cockpit', key: 'handoff' } as const, null, { shape: 'ho-1' })

// ---------------------------------------------------------------------------
// Settings.

type Opts = {
  warn: number
  crit: number
  ttl: 'auto' | '5m' | '1h'
  keepAlive: boolean
  maxPings: number
  advisor: boolean
  language: string
}

const num = (v: unknown, d: number, lo: number, hi: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d

export const readOpts = (o: PluginOptions): Opts => {
  const warn = num(o.warnPercent, 70, 1, 99)
  const crit = Math.max(warn + 1, num(o.criticalPercent, 85, 2, 100))
  const ttl = o.cacheTtl === '5m' || o.cacheTtl === '1h' ? o.cacheTtl : 'auto'
  return {
    warn,
    crit,
    ttl,
    keepAlive: o.keepAlive === true,
    maxPings: Math.round(num(o.keepAliveMaxPings, 3, 0, 20)),
    advisor: o.advisor !== false,
    language: typeof o.language === 'string' ? o.language : 'auto',
  }
}

// Module scope: set again by register and session.start on every (re)load.
let opts: Opts = readOpts({})
let lang: Lang = 'en'
let model = ''
let isBusy = false
let isPinging = false
const tr = (): Strings => STRINGS[lang]
const isRtl = () => lang === 'ar'

async function detectLang($: EngineInterface): Promise<Lang> {
  const fixed = langOf(opts.language)
  if (fixed) return fixed
  try {
    const s = (await $.settings.read()) as Record<string, unknown>
    const l = langOf(s.language)
    if (l) return l
  } catch {
    // No settings: fall through.
  }
  return langOf((await $.env.get('LC_ALL')) || (await $.env.get('LANG')) || '') ?? 'en'
}

// ---------------------------------------------------------------------------
// Readings.

type UsageLike = Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'>

const snapOf = (u: UsageLike, at: number): Snapshot => ({
  contextPercent: u.context.percent ?? null,
  contextTokens: u.context.tokens ?? null,
  window: u.context.window,
  limits: u.rateLimits.map(r => ({ kind: r.kind, percent: r.percentUsed, resetsAt: r.resetsAt })),
  costUsd: u.cost?.usd ?? null,
  model,
  at,
})

const limitOf = (s: Snapshot | null, kind: string): Limit | undefined => s?.limits.find(l => l.kind === kind)

// The highest of context fill and the plan limits, and which one it is.
export const budgetOf = (s: Snapshot | null): { pct: number; what: 'context' | 'five_hour' | 'seven_day' | string } => {
  let pct = s?.contextPercent ?? 0
  let what = 'context'
  for (const l of s?.limits ?? []) if (l.percent > pct) ((pct = l.percent), (what = l.kind))
  return { pct, what }
}

const whatWord = (what: string): string =>
  what === 'context' ? tr().context : what === 'five_hour' ? tr().fiveHour : what === 'seven_day' ? tr().sevenDay : what

const rankOf = (l: Level): number => (l === 'critical' ? 2 : l === 'warning' ? 1 : 0)

const LEVEL_COLOR: Record<Level, string> = { ok: '#3B9C5F', warning: '#D9A21B', critical: '#E5484D' }
const FIT_COLOR = { green: '#3B9C5F', yellow: '#D9A21B', red: '#E5484D', unknown: '#9a9a96' } as const

// The TTL in ms and whether it was guessed.
const ttlOf = (c: Cache, s: Snapshot | null): { ms: number; isGuess: boolean } => {
  if (opts.ttl !== 'auto') return { ms: opts.ttl === '1h' ? 3_600_000 : 300_000, isGuess: false }
  if (c.detectedTtl) return { ms: c.detectedTtl === '1h' ? 3_600_000 : 300_000, isGuess: false }
  // Claude Code writes 1-hour cache entries on a subscription; a subscription
  // is the one place rate-limit windows are reported.
  return { ms: (s?.limits.length ?? 0) > 0 ? 3_600_000 : 300_000, isGuess: true }
}

async function measure($: EngineInterface, u: UsageLike): Promise<void> {
  const at = await $.clock.now()
  const s = snapOf(u, at)
  await update($, snapshot, () => s)
  const { pct, what } = budgetOf(s)
  const level = levelOf(pct, opts.warn, opts.crit)
  const prev = await read($, alerted)
  if (rankOf(level) > rankOf(prev)) {
    const n = Math.round(pct)
    $.ui.toast(fill(level === 'critical' ? tr().critToast : tr().warnToast, { n, what: whatWord(what) }))
  }
  if (level !== prev) await update($, alerted, () => level)
}

// ---------------------------------------------------------------------------
// Keep-alive: a tool-less fork over the session's own transcript reads the main
// thread's cache prefix, which refreshes that entry's TTL. It names no effort:
// on a model without per-message effort another level would write a new entry.

const PING = 'Keep-alive ping from a plugin. You have no tools. Do not think it over; reply with the single word: ok'

async function maybePing($: EngineInterface): Promise<void> {
  if (!opts.keepAlive || isBusy || isPinging) return
  const c = await read($, cache)
  if (!c.touchedAt || c.pings >= opts.maxPings) return
  const s = await read($, snapshot)
  const { ms } = ttlOf(c, s)
  const at = await $.clock.now()
  const left = ms - (at - c.touchedAt)
  const margin = ms > 300_000 ? 180_000 : 45_000
  if (left <= 0 || left > margin) return
  isPinging = true
  try {
    const r = await $.model.fork({ prompt: PING })
    const usd = 'usage' in r ? costOf(model, r.usage) : 0
    const isRead = 'usage' in r && r.usage.cache_read_input_tokens > 0
    const done = await $.clock.now()
    await update($, cache, p => ({ ...p, touchedAt: isRead ? done : p.touchedAt, pings: p.pings + 1, pingUsd: p.pingUsd + usd }))
  } finally {
    isPinging = false
  }
}

// ---------------------------------------------------------------------------
// Handoff.

const HANDOFF_SYSTEM =
  'You write short handoff notes so a new Claude Code session can continue the work. Plain Markdown, no preamble. Be concrete; use file paths and names from the transcript; never invent anything.'

const HANDOFF_ASK = `Write a handoff note for the conversation below, with exactly these sections:
## Goal
## Decisions
## Open problems
## Next steps
One-line bullets, at most 8 per section, "None" when a section is empty. Do not list touched files: they are added separately.

TRANSCRIPT:
`

const fallbackNote = (msgs: readonly SessionMessage[]): string => {
  const asks = msgs.filter(m => m.role === 'user' && m.text.trim()).slice(-5)
  const last = [...msgs].reverse().find(m => m.role === 'assistant' && m.text.trim())
  return [
    '## Goal',
    ...(asks.length ? asks.map(m => `- ${m.text.trim().split('\n')[0]?.slice(0, 200)}`) : ['- None']),
    '',
    '## Last reply',
    last ? last.text.trim().slice(0, 1500) : 'None',
    '',
    '## Next steps',
    '- Read this note and the files below, then ask the user what to do next.',
  ].join('\n')
}

export async function writeHandoff($: EngineInterface): Promise<string> {
  const s = tr()
  const raw = await $.session.messages()
  const msgs = (Array.isArray(raw) ? raw : []) as SessionMessage[]
  if (!msgs.some(m => m.text.trim() || m.toolUses.length)) return s.handoffEmpty
  const at = await $.clock.now()
  await update($, handoff, () => ({ path: '', at, isRunning: true, usd: 0 }))
  try {
    const files = filesTouched(msgs)
    const r = await $.model.complete({
      model: 'haiku',
      effort: 'low',
      maxTokens: 1500,
      timeoutMs: 90_000,
      system: HANDOFF_SYSTEM,
      prompt: HANDOFF_ASK + transcriptText(msgs),
    })
    const usd = costOf('haiku', r.usage)
    const body = r.isAnswered && r.text.trim() ? r.text.trim() : fallbackNote(msgs)
    const name = handoffName(at)
    const rel = `handoff/${name}`
    const cwd = await $.session.cwd()
    const text = [
      `# Handoff ${new Date(at).toISOString().slice(0, 16).replace('T', ' ')} UTC`,
      '',
      body,
      '',
      '## Files touched',
      ...(files.length ? files.map(f => `- ${f}`) : ['- None']),
      '',
      `<!-- Written by the cockpit mod. Summary call: ${r.isAnswered ? 'Haiku, low effort' : 'failed, basic note'}; ≈${fmtCost(usd)}. -->`,
      '',
    ].join('\n')
    await $.fs.write(`${cwd.replace(/\/$/, '')}/${rel}`, text)
    await update($, handoff, () => ({ path: rel, at: at, isRunning: false, usd }))
    const done = fill(s.handoffDone, { path: rel })
    return r.isAnswered ? done : `${fill(s.handoffFallback, { why: r.reason })} ${done}`
  } catch (err) {
    await update($, handoff, () => null)
    throw err
  }
}

async function runHandoff($: EngineInterface): Promise<void> {
  $.ui.toast(tr().handoffRunning)
  try {
    $.ui.toast(await writeHandoff($))
  } catch (err) {
    $.ui.toast(`Handoff failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function compactNow($: EngineInterface): Promise<void> {
  try {
    await $.session.compact({})
    $.ui.toast(tr().compacted)
  } catch {
    $.ui.toast(tr().compactBusy)
  }
}

async function applyAdvice($: EngineInterface, a: Advice): Promise<void> {
  try {
    const names = new Set((await $.command.list()).map(c => c.name))
    if (!names.has('model')) throw new Error('no /model')
    await $.command.run({ command: 'model', args: a.model })
    if (names.has('effort')) await $.command.run({ command: 'effort', args: a.effort })
    else throw new Error('no /effort')
    $.ui.toast(fill(tr().switched, { model: a.model, effort: a.effort }))
  } catch {
    $.ui.toast(fill(tr().switchHint, { model: a.model, effort: a.effort }))
  }
}

// ---------------------------------------------------------------------------
// Usage pane data.

const shortPath = (p: string): string => p.split('/').slice(-2).join('/')

export async function refreshPane($: EngineInterface): Promise<void> {
  const at = await $.clock.now()
  try {
    let u: SessionUsage
    try {
      u = await $.session.usage({ breakdown: 'full', columns: 80 })
    } catch {
      u = await $.session.usage({ breakdown: 'summary', columns: 80 })
    }
    await measure($, u)
    const bd = u.context.breakdown
    const raw = await $.session.messages()
    const msgs = (Array.isArray(raw) ? raw : []) as SessionMessage[]
    const attr = attribute(msgs)
    const servers = new Map<string, number>()
    for (const t of bd?.mcpTools ?? []) servers.set(t.serverName, (servers.get(t.serverName) ?? 0) + t.tokens)
    const data: PaneData = {
      rows: (bd?.categories ?? []).filter(c => c.kind !== 'deferred').map(c => ({ name: c.name, tokens: c.tokens, kind: c.kind })),
      total: bd?.totalTokens ?? u.context.tokens ?? 0,
      max: bd?.rawMaxTokens ?? u.context.window,
      mcpServers: [...servers].map(([name, tokens]) => ({ name, tokens })).sort((a, b) => b.tokens - a.tokens).slice(0, 6),
      memory: (bd?.memoryFiles ?? []).map(m => ({ path: shortPath(m.path), tokens: m.tokens })).sort((a, b) => b.tokens - a.tokens).slice(0, 6),
      skills: (bd?.skills?.skillFrontmatter ?? []).map(k => ({ name: k.name, tokens: k.tokens })).sort((a, b) => b.tokens - a.tokens).slice(0, 6),
      attribution: attr.rows.slice(0, 10),
      userTokens: attr.userTokens,
      replyTokens: attr.replyTokens,
      at,
    }
    await update($, pane, () => data)
  } catch (err) {
    await update($, pane, () => ({
      rows: [], total: 0, max: 0, mcpServers: [], memory: [], skills: [], attribution: [], userTokens: 0, replyTokens: 0, at,
      error: err instanceof Error ? err.message : String(err),
    }))
  }
}

async function togglePane($: EngineInterface): Promise<boolean> {
  const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
  if (isOpen) {
    await $.ui.close({ id: PANE })
    return false
  }
  await update($, pane, () => null)
  await $.ui.open({ id: PANE, title: tr().pane })
  void refreshPane($)
  return true
}

// ---------------------------------------------------------------------------
// Drawing helpers (desktop and mobile: SVG; terminal: text rows).

const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"
const xml = (s: string): string => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

// Rough advance of UI text in em (from savvy-progress, MIT).
const charEm = (ch: string): number => (/[\s.,:;'|!il1()[\]]/.test(ch) ? 0.3 : /[A-Z@%]/.test(ch) ? 0.72 : 0.56)
const textWidth = (s: string, size: number): number => [...s].reduce((w, ch) => w + charEm(ch) * size * 1.12, 0)

const CSS = `<style>.t{fill:#1f1f1f}.s{fill:#6b6b68}.k{fill:#e4e4e2}.tile{fill:#f4f3f0}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.s{fill:#a8a8a4}.k{fill:#2c2c2c}.tile{fill:#262625}}</style>`

type Seg = { text: string; color?: string; dot?: string; bold?: boolean }

const BAND_H = 28

// One band row: the mood crab, then the segments, left to right (right to left in Arabic).
const bandSvg = (W: number, mood: Mood, segs: Seg[], gauge: boolean): string => {
  const rtl = isRtl()
  const parts: string[] = []
  let x = 36
  for (const s of segs) {
    if (s.text === '◔' && gauge) {
      parts.push(crab(rtl ? W - x - 24 : x, 2, 'gauge', 0.8, rtl))
      x += 28
      continue
    }
    if (s.dot) {
      parts.push(`<circle cx="${rtl ? W - x - 4 : x + 4}" cy="${BAND_H / 2}" r="4" fill="${s.dot}"/>`)
      x += 11
    }
    const w = textWidth(s.text, 12.5)
    const at = rtl ? `x="${W - x}" direction="rtl" text-anchor="start"` : `x="${x}"`
    const fillAttr = s.color ? ` fill="${s.color}"` : ' class="t"'
    parts.push(`<text ${at} y="${BAND_H / 2 + 4.5}" font-family="${FONT}" font-size="12.5"${s.bold ? ' font-weight="600"' : ''}${fillAttr}>${xml(s.text)}</text>`)
    x += w + 16
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${BAND_H}" viewBox="0 0 ${W} ${BAND_H}">${CSS}${CRAB_CSS}
${crab(rtl ? W - 30 : 0, 1, mood, 0.95, rtl)}${parts.join('')}</svg>`
}

type BarRow = { label: string; value: string; pct: number; color: string }

// A titled list of bars, one SVG per section.
const sectionSvg = (W: number, title: string, rows: BarRow[]): string => {
  const rtl = isRtl()
  const H = 22 + rows.length * 30
  const body = rows
    .map((r, i) => {
      const y = 22 + i * 30
      const fw = Math.round((W * Math.max(0, Math.min(100, r.pct))) / 100)
      const label = rtl ? `x="${W}" direction="rtl" text-anchor="start"` : 'x="0"'
      const value = rtl ? 'x="0"' : `x="${W}" text-anchor="end"`
      return `<text class="t" ${label} y="${y + 12}" font-family="${FONT}" font-size="12">${xml(r.label)}</text>
<text class="s" ${value} y="${y + 12}" font-family="${FONT}" font-size="12" font-variant-numeric="tabular-nums">${xml(r.value)}</text>
<rect class="k" x="0" y="${y + 18}" width="${W}" height="6" rx="3"/><rect x="${rtl ? W - fw : 0}" y="${y + 18}" width="${fw}" height="6" rx="3" fill="${r.color}"/>`
    })
    .join('')
  const head = rtl ? `x="${W}" direction="rtl" text-anchor="start"` : 'x="0"'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${CSS}
<text class="t" ${head} y="14" font-family="${FONT}" font-size="13" font-weight="600">${xml(title)}</text>${body}</svg>`
}

const headerSvg = (W: number, mood: Mood, tiles: [string, string][]): string => {
  const rtl = isRtl()
  const gap = 6
  const x0 = 40
  const tw = (W - x0 - gap * (tiles.length - 1)) / Math.max(1, tiles.length)
  const body = tiles
    .map(([k, v], i) => {
      const x = rtl ? W - x0 - (i + 1) * tw - i * gap : x0 + i * (tw + gap)
      const tx = rtl ? `x="${x + tw - 8}" direction="rtl" text-anchor="start"` : `x="${x + 8}"`
      return `<rect class="tile" x="${x}" y="0" width="${tw}" height="40" rx="8"/>
<text class="s" ${tx} y="15" font-family="${FONT}" font-size="11">${xml(k)}</text>
<text class="t" ${rtl ? `x="${x + tw - 8}" text-anchor="end"` : `x="${x + 8}"`} y="32" font-family="${FONT}" font-size="14" font-weight="600" font-variant-numeric="tabular-nums">${xml(v)}</text>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="40" viewBox="0 0 ${W} 40">${CSS}${CRAB_CSS}${crab(rtl ? W - 33 : 0, 6, mood, 1.1, rtl)}${body}</svg>`
}

const moodOf = (level: Level, h: Handoff | null, a: Advice | null, at: number): Mood => {
  if (h && (h.isRunning || at - h.at < 60_000)) return 'suitcase'
  if (level === 'critical') return 'alarm'
  if (level === 'warning') return 'sweat'
  if (a && at - a.at < 120_000) return 'gauge'
  return 'calm'
}

const fitWord = (a: Advice): string => {
  const s = tr()
  if (a.fit === 'unknown') return s.effortUnknown
  if (a.fit === 'green') return s.fits
  if (a.fit === 'yellow') return a.dir === 'high' ? s.bitHigh : s.bitLow
  return a.dir === 'high' ? s.tooHigh : s.tooLow
}

const resetIn = (l: Limit | undefined, at: number): string => (l?.resetsAt ? fmtSpan(Date.parse(l.resetsAt) - at) : '')

const pctColor = (pct: number): string => LEVEL_COLOR[levelOf(pct, opts.warn, opts.crit)]

async function ttlHook($: EngineInterface, e: { cache_ttl?: string }): Promise<void> {
  const ttl: Cache['detectedTtl'] = e.cache_ttl === '1h' ? '1h' : e.cache_ttl === '5m' ? '5m' : null
  if (ttl) await update($, cache, c => ({ ...c, detectedTtl: ttl }))
}

// ---------------------------------------------------------------------------

export const register: Register = (on, options) => {
  opts = readOpts(options)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await detectLang($)
    try {
      model = await $.session.model()
    } catch {
      model = ''
    }
    await $.command.register({ name: 'usage-panel', description: 'Show or hide the cockpit usage panel: limits, cost, context by category, per-tool estimate' })
    await $.command.register({ name: 'handoff', description: 'Write a handoff note to handoff/HANDOFF-<date>.md for a fresh session (one cheap Haiku call)' })
    const envEffort = (await $.env.get('CLAUDE_EFFORT')) || (await $.env.get('CLAUDE_CODE_EFFORT_LEVEL'))
    if (envEffort && (await read($, effort)) === null) await update($, effort, () => envEffort)
    try {
      await measure($, await $.session.usage())
    } catch {
      // No reading yet.
    }
    const t0 = await $.clock.now()
    await update($, now, () => t0)
    $.clock.every(5000, () => {
      void (async () => {
        const t = await $.clock.now()
        await update($, now, () => t)
        await maybePing($)
      })()
    })
    return started
  })

  on('session.measure', async ($, e, next) => {
    await measure($, e)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId && !isPinging) isBusy = true
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (!e.agentId && !isPinging) {
      model = e.model || model
      if (typeof e.effort === 'string') {
        const level = e.effort
        if ((await read($, effort)) !== level) await update($, effort, () => level)
      }
    }
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId && !isPinging) {
      isBusy = false
      const at = await $.clock.now()
      await update($, cache, c => ({ ...c, touchedAt: at, pings: 0 }))
      await update($, now, () => at)
    }
    return next(e)
  })

  // The engine reports the prompt-cache TTL on a model switch.
  on('classic.PreModelSwitch', async ($, e, next) => (await ttlHook($, e), next(e)))
  on('classic.PostModelSwitch', async ($, e, next) => (await ttlHook($, e), next(e)))
  // The active effort, where a classic hook carries it.
  on('classic.Stop', async ($, e, next) => {
    const level = e.effort?.level
    if (level && !e.agent_id) await update($, effort, () => level)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    // Never touches the prompt: it reads the text and passes `e` on unchanged.
    if (opts.advisor && !e.command && !e.isMeta && e.text.trim()) {
      const at = await $.clock.now()
      const a = adviceFor(e.text, await read($, effort), model, at)
      await update($, advice, () => a)
    }
    return next(e)
  })

  on('command.run', { command: 'usage-panel' }, async ($, e) => {
    if ((e.args ?? '').trim() === 'open') {
      await update($, pane, () => null)
      await $.ui.open({ id: PANE, title: tr().pane })
      void refreshPane($)
      return { text: tr().opened }
    }
    return { text: (await togglePane($)) ? tr().opened : tr().closed }
  })

  on('command.run', { command: 'handoff' }, async $ => ({ text: await writeHandoff($) }))

  // -------------------------------------------------------------------------

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const s = tr()
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const snap = await read($, snapshot)
    const data = await read($, pane)
    const c = await read($, cache)
    const ho = await read($, handoff)
    const at = Math.max(await read($, now), snap?.at ?? 0)
    const { pct } = budgetOf(snap)
    const level = levelOf(pct, opts.warn, opts.crit)
    const mood = moodOf(level, ho, null, at)
    const five = limitOf(snap, 'five_hour')
    const seven = limitOf(snap, 'seven_day')
    const others = (snap?.limits ?? []).filter(l => l.kind !== 'five_hour' && l.kind !== 'seven_day')
    const ctxPct = snap?.contextPercent ?? 0
    const cost = snap?.costUsd

    const limitRows: BarRow[] = [
      ...(five ? [{ label: s.fiveHour, value: `${Math.round(five.percent)}% · ${s.resetsIn} ${resetIn(five, at)}`, pct: five.percent, color: pctColor(five.percent) }] : []),
      ...(seven ? [{ label: s.sevenDay, value: `${Math.round(seven.percent)}% · ${s.resetsIn} ${resetIn(seven, at)}`, pct: seven.percent, color: pctColor(seven.percent) }] : []),
      ...others.map(l => ({ label: l.kind, value: `${Math.round(l.percent)}%`, pct: l.percent, color: pctColor(l.percent) })),
    ]
    const ctxRow: BarRow = {
      label: `${s.context} · ${modelName(snap?.model || model)}`,
      value: `${Math.round(ctxPct)}% · ${fmtTokens(snap?.contextTokens ?? 0)} / ${fmtTokens(snap?.window ?? 0)}`,
      pct: ctxPct,
      color: pctColor(ctxPct),
    }
    const max = Math.max(1, data?.max ?? 1)
    const catRows: BarRow[] = (data?.rows ?? []).map(r => ({
      label: r.name,
      value: `${fmtTokens(r.tokens)} · ${Math.round((r.tokens / max) * 100)}%`,
      pct: (r.tokens / max) * 100,
      color: r.kind === 'used' ? '#8f8cf4' : '#b4b4b0',
    }))
    const listRows = (list: { name: string; tokens: number }[]): BarRow[] => {
      const top = Math.max(1, ...list.map(x => x.tokens))
      return list.map(x => ({ label: x.name, value: fmtTokens(x.tokens), pct: (x.tokens / top) * 100, color: '#378ADD' }))
    }
    const attrTotal = Math.max(1, (data?.attribution ?? []).reduce((n, r) => n + r.tokens, 0) + (data?.userTokens ?? 0) + (data?.replyTokens ?? 0))
    const attrRows: BarRow[] = [
      ...(data?.attribution ?? []).map(r => ({
        label: `${r.kind === 'tool' ? '' : r.kind + ': '}${r.key.replace(/^mcp__/, '')}`,
        value: `≈${fmtTokens(r.tokens)} · ${r.calls} ${s.calls}`,
        pct: (r.tokens / attrTotal) * 100,
        color: r.kind === 'skill' ? '#1D9E75' : r.kind === 'agent' ? '#D85A30' : r.kind === 'mcp' ? '#BA7517' : '#378ADD',
      })),
      ...(data ? [
        { label: s.userTokens, value: `≈${fmtTokens(data.userTokens)}`, pct: (data.userTokens / attrTotal) * 100, color: '#888780' },
        { label: s.replyTokens, value: `≈${fmtTokens(data.replyTokens)}`, pct: (data.replyTokens / attrTotal) * 100, color: '#888780' },
      ] : []),
    ]
    const tiles: [string, string][] = [
      [s.cost, cost === null || cost === undefined ? '—' : fmtCost(cost)],
      [s.context, `${Math.round(ctxPct)}%`],
      [s.h5, five ? `${Math.round(five.percent)}%` : '—'],
      [s.d7, seven ? `${Math.round(seven.percent)}%` : '—'],
    ]
    const extra = [c.pings || c.pingUsd ? `${s.pings}: ${c.pings} · ≈${fmtCost(c.pingUsd)}` : '', ho?.path && ho.usd ? `${s.handoff}: ≈${fmtCost(ho.usd)}` : '']
      .filter(Boolean)
      .join(' · ')
    const refresh = <Button key="refresh" label={s.refresh} plain onPress={() => refreshPane($)} />
    const sections: [string, string, BarRow[]][] = [
      ['limits', s.limits, limitRows],
      ['ctx', s.session, [ctxRow]],
      ['cat', s.breakdown, catRows],
      ['mcp', s.mcpBy, listRows(data?.mcpServers ?? [])],
      ['mem', s.memory, listRows((data?.memory ?? []).map(m => ({ name: m.path, tokens: m.tokens })))],
      ['skills', s.skills, listRows(data?.skills ?? [])],
      ['attr', `${s.attribution} (${s.estimate})`, attrRows],
    ]
    const align = isRtl() ? 'flex-end' : undefined

    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      const W = Math.max(240, Math.min(900, (e.props.bodyColumns || 40) * 8 - 8))
      return (
        <Box flexDirection="column" gap={1} alignItems={align}>
          <Svg source={headerSvg(W, mood, tiles)} alt={tiles.map(t => `${t[0]} ${t[1]}`).join(', ')} width={W} height={40} />
          {extra ? <Text dimColor>{extra}</Text> : null}
          {limitRows.length === 0 && <Text dimColor>{s.noLimits}</Text>}
          {data === null && <Text dimColor>{s.loading}</Text>}
          {data?.error ? <Text color="red">{data.error}</Text> : null}
          {sections
            .filter(([, , rows]) => rows.length > 0)
            .map(([key, title, rows]) => (
              <Svg key={key} source={sectionSvg(W, title, rows)} alt={`${title}: ${rows.map(r => `${r.label} ${r.value}`).join('; ')}`} width={W} height={22 + rows.length * 30} />
            ))}
          {data ? <Text dimColor>{s.estimateNote}</Text> : null}
          {refresh}
        </Box>
      )
    }

    const cols = Math.max(24, e.props.bodyColumns || 40)
    const barW = Math.max(6, Math.min(24, cols - 30))
    const row = (r: BarRow, i: number) => (
      <Box key={`${r.label}-${i}`} flexDirection="column">
        <Text wrap="truncate-end">
          {r.label} <Text dimColor>{r.value}</Text>
        </Text>
        <Text color={r.color}>{bar(r.pct, barW)}</Text>
      </Box>
    )
    return (
      <Box flexDirection="column" alignItems={align}>
        <Text>
          <Text color={CLAY}>{crabText(mood)}</Text> {tiles.map(t => `${t[0]} ${t[1]}`).join(' · ')}
        </Text>
        {extra ? <Text dimColor>{extra}</Text> : null}
        {limitRows.length === 0 && <Text dimColor>{s.noLimits}</Text>}
        {data === null && <Text dimColor>{s.loading}</Text>}
        {data?.error ? <Text color="red">{data.error}</Text> : null}
        {sections
          .filter(([, , rows]) => rows.length > 0)
          .map(([key, title, rows]) => (
            <Box key={key} flexDirection="column" marginTop={1}>
              <Text bold>{title}</Text>
              {rows.map(row)}
            </Box>
          ))}
        {data ? (
          <Box marginTop={1}>
            <Text dimColor>{s.estimateNote}</Text>
          </Box>
        ) : null}
        {refresh}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    // Draw with the other mods' bands beneath; the engine's placeholder is never nested.
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null

    const s = tr()
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const snap = await read($, snapshot)
    const a = opts.advisor ? await read($, advice) : null
    const c = await read($, cache)
    const ho = await read($, handoff)
    const at = Math.max(await read($, now), snap?.at ?? 0)
    const { pct } = budgetOf(snap)
    const level = levelOf(pct, opts.warn, opts.crit)
    const mood = moodOf(level, ho, a, at)
    const five = limitOf(snap, 'five_hour')
    const seven = limitOf(snap, 'seven_day')
    const ctxPct = snap?.contextPercent

    const ttl = ttlOf(c, snap)
    const idle = c.touchedAt ? at - c.touchedAt : 0
    const cacheText = !c.touchedAt
      ? ''
      : idle >= ttl.ms
        ? s.cacheCold
        : `${s.cache} ${fmtClock(idle)}/${fmtClock(ttl.ms)}${ttl.isGuess ? '?' : ''}`
    const pingText = opts.keepAlive && c.touchedAt ? `${s.ping} ${c.pings}/${opts.maxPings} ${fill(s.pingCost, { usd: fmtCost(pingCost(model, snap?.contextTokens ?? 0)) })}` : ''

    const segs: Seg[] = [
      { text: `${s.ctx} ${ctxPct === null || ctxPct === undefined ? '—' : Math.round(ctxPct) + '%'}`, color: ctxPct ? pctColor(ctxPct) : undefined, bold: level !== 'ok' },
      ...(five ? [{ text: `${s.h5} ${Math.round(five.percent)}% · ${resetIn(five, at)}`, color: pctColor(five.percent) }] : []),
      ...(seven ? [{ text: `${s.d7} ${Math.round(seven.percent)}%`, color: pctColor(seven.percent) }] : []),
      ...(snap?.costUsd !== null && snap?.costUsd !== undefined ? [{ text: fmtCost(snap.costUsd) }] : []),
      ...(cacheText ? [{ text: cacheText, color: idle >= ttl.ms ? '#9a9a96' : undefined }] : []),
      ...(pingText ? [{ text: pingText, color: '#9a9a96' }] : []),
      ...(a
        ? [
            { text: '◔' },
            { text: `${s.suggest} ${a.model} · ${a.effort}`, bold: familyOf(a.currentModel) !== a.model },
            { text: fitWord(a), dot: FIT_COLOR[a.fit], color: FIT_COLOR[a.fit] },
          ]
        : []),
    ]
    const alt = segs.filter(x => x.text !== '◔').map(x => x.text).join(' · ')
    const isMismatch = a !== null && (a.fit === 'yellow' || a.fit === 'red' || (familyOf(a.currentModel) !== '' && familyOf(a.currentModel) !== a.model))

    const buttons = [
      <Button key="cockpit-usage" label={s.usage} plain onPress={() => void togglePane($)} />,
      ...(isMismatch && a ? [<Button key="cockpit-switch" label={`${s.apply} ${a.model}·${a.effort}`} plain onPress={() => applyAdvice($, a)} />] : []),
      ...(level === 'critical'
        ? [
            <Button key="cockpit-compact" label={s.compact} variant="primary" onPress={() => compactNow($)} />,
            <Button key="cockpit-handoff" label={s.handoff} onPress={() => runHandoff($)} />,
          ]
        : []),
    ]

    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      const room = buttons.length * 90 + 16
      const W = Math.max(200, Math.min(1400, (e.props.bodyColumns || 100) * 8 - room))
      return (
        <Box flexDirection="column">
          <Box flexDirection={isRtl() ? 'row-reverse' : 'row'} alignItems="center" gap={1}>
            <Svg source={bandSvg(W, mood, segs, true)} alt={alt} width={W} height={BAND_H} />
            {buttons}
          </Box>
          {below}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection={isRtl() ? 'row-reverse' : 'row'} gap={1}>
          <Text color={level === 'ok' ? CLAY : LEVEL_COLOR[level]}>{crabText(mood)}</Text>
          {segs.map((x, i) =>
            x.text === '◔' ? (
              <Text key={`s${i}`} color={CLAY}>
                ◔
              </Text>
            ) : (
              <Text key={`s${i}`} color={x.color} bold={x.bold} wrap="truncate-end">
                {x.dot ? '● ' : ''}
                {x.text}
              </Text>
            ),
          )}
          {buttons}
        </Box>
        {below}
      </Box>
    )
  })
}
