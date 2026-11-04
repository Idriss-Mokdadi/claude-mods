import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionMessage, SessionUsage, PluginOptions } from 'claude-code'

import type { Advice, Cache, Handoff, Level, Limit, Mood, PaneData, Snapshot, Tone } from '../types'
import { CLAY, CRAB_CSS, crab, crabText } from './crab'
import { STRINGS, fill, langOf } from './i18n'
import type { Lang, Strings } from './i18n'
import {
  EFFORTS,
  TONE_COLOR,
  TONE_EMOJI,
  adviceFor,
  attribute,
  bar,
  categoryIcon,
  costOf,
  effortRank,
  familyOf,
  filesTouched,
  fitOf,
  fmtCost,
  fmtLeft,
  fmtSpan,
  fmtTokens,
  handoffName,
  isPersonOrigin,
  levelOf,
  modelName,
  modelTone,
  pingCost,
  toneOf,
  transcriptText,
  worstTone,
} from './lib'

const PANE = 'cockpit-usage'
const STORE_EXPANDED = 'cockpit.expanded'

const snapshot = atom({ plugin: 'cockpit', key: 'snapshot' } as const, null, { shape: 'snap-1' })
const advice = atom({ plugin: 'cockpit', key: 'advice' } as const, null, { shape: 'adv-1' })
const effort = atom({ plugin: 'cockpit', key: 'effort' } as const, null)
const now = atom({ plugin: 'cockpit', key: 'now' } as const, 0)
const cache = atom({ plugin: 'cockpit', key: 'cache' } as const, { touchedAt: 0, pings: 0, pingUsd: 0, detectedTtl: null }, { shape: 'cache-1' })
const pane = atom({ plugin: 'cockpit', key: 'pane' } as const, null, { shape: 'pane-1' })
const alerted = atom({ plugin: 'cockpit', key: 'alerted' } as const, 'ok')
const handoff = atom({ plugin: 'cockpit', key: 'handoff' } as const, null, { shape: 'ho-1' })
const expanded = atom({ plugin: 'cockpit', key: 'expanded' } as const, false)
const showAll = atom({ plugin: 'cockpit', key: 'showAll' } as const, false)

// ---------------------------------------------------------------------------
// Settings.

type Opts = {
  warn: number
  crit: number
  ttl: 'auto' | '5m' | '1h'
  keepAlive: boolean
  maxPings: number
  advisor: boolean
  costBudget: number
  debug: boolean
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
    costBudget: num(o.costBudgetUsd, 5, 0.01, 100_000),
    debug: o.debug === true,
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

const isLevel = (v: unknown): v is string => typeof v === 'string' && EFFORTS.includes(v.trim().toLowerCase() as never)

// The active effort from every source that may hold it, first found wins:
// the hook environment, the `/config` rows, the settings, the launch variable.
async function readEffort($: EngineInterface): Promise<string | null> {
  const env = await $.env.get('CLAUDE_EFFORT')
  if (isLevel(env)) return env.trim().toLowerCase()
  try {
    const row = (await $.config.list()).find(r => /effort/i.test(r.key))
    if (isLevel(row?.value)) return row.value.toLowerCase()
  } catch {
    // No config rows here.
  }
  try {
    const v = await $.settings.read({ key: 'effortLevel' })
    if (isLevel(v)) return v.toLowerCase()
  } catch {
    // No settings.
  }
  const launch = await $.env.get('CLAUDE_CODE_EFFORT_LEVEL')
  return isLevel(launch) ? launch.trim().toLowerCase() : null
}

async function setEffort($: EngineInterface, level: string | null): Promise<void> {
  if (!level || (await read($, effort)) === level) return
  await update($, effort, () => level)
  // Re-rate the advice shown against the new level.
  await update($, advice, a => (a ? { ...a, currentEffort: level, ...fitOf(a.effort, level) } : a))
}

async function refreshModel($: EngineInterface): Promise<string> {
  try {
    model = (await $.session.model()) || model
  } catch {
    // Keep what we had.
  }
  const m = model
  await update($, advice, a => (a && a.currentModel !== m ? { ...a, currentModel: m } : a))
  return model
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
export const budgetOf = (s: Snapshot | null): { pct: number; what: string } => {
  let pct = s?.contextPercent ?? 0
  let what = 'context'
  for (const l of s?.limits ?? []) if (l.percent > pct) ((pct = l.percent), (what = l.kind))
  return { pct, what }
}

const whatWord = (what: string): string =>
  what === 'context' ? tr().context : what === 'five_hour' ? tr().fiveHour : what === 'seven_day' ? tr().sevenDay : what

const rankOf = (l: Level): number => (l === 'critical' ? 2 : l === 'warning' ? 1 : 0)

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
    await update($, handoff, () => ({ path: rel, at, isRunning: false, usd }))
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

// ---------------------------------------------------------------------------
// Switching model and effort. The `/config` "model" row is the direct way; the
// `/model` command is the fallback. Either way the session's model is read
// back, and the toast says so when it did not change.

const isFamily = (id: string, family: string): boolean => familyOf(id) === family

export async function switchTo($: EngineInterface, a: Advice): Promise<boolean> {
  const s = tr()
  const target = a.model
  let names = new Set<string>()
  try {
    names = new Set((await $.command.list()).map(c => c.name))
  } catch {
    // No command list: the config row alone.
  }
  if (!isFamily(await refreshModel($), target)) {
    try {
      const row = (await $.config.list()).find(r => r.key === 'model')
      const opt = row?.options?.find(o => o.toLowerCase() === target) ?? row?.options?.find(o => isFamily(o, target))
      if (row && !row.isLocked && opt) await $.config.set({ key: 'model', value: opt })
    } catch {
      // Fall through to the command.
    }
  }
  if (!isFamily(await refreshModel($), target) && names.has('model')) {
    try {
      await $.command.run({ command: 'model', args: target })
    } catch {
      // Checked below.
    }
  }
  const isModelOk = isFamily(await refreshModel($), target)
  let isEffortOk = false
  if (names.has('effort')) {
    try {
      await $.command.run({ command: 'effort', args: a.effort })
      await setEffort($, a.effort)
      isEffortOk = true
    } catch {
      // Hint below.
    }
  }
  if (!isModelOk) $.ui.toast(fill(s.modelNotChanged, { model: target }))
  else if (!isEffortOk) $.ui.toast(fill(s.switchHint, { model: target, effort: a.effort }))
  else $.ui.toast(fill(s.switched, { model: target, effort: a.effort }))
  return isModelOk
}

// ---------------------------------------------------------------------------
// Context breakdown and the per-tool estimate.

const shortPath = (p: string): string => p.split('/').slice(-2).join('/')

export async function refreshData($: EngineInterface, detail: 'full' | 'summary'): Promise<void> {
  const at = await $.clock.now()
  try {
    let u: SessionUsage
    try {
      u = await $.session.usage({ breakdown: detail, columns: 80 })
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
      rows: (bd?.categories ?? []).filter(c => c.kind === 'used').map(c => ({ name: c.name, tokens: c.tokens, kind: c.kind })),
      total: bd?.totalTokens ?? u.context.tokens ?? 0,
      max: bd?.rawMaxTokens ?? u.context.window,
      mcpServers: [...servers].map(([name, tokens]) => ({ name, tokens })).sort((a, b) => b.tokens - a.tokens),
      memory: (bd?.memoryFiles ?? []).map(m => ({ path: shortPath(m.path), tokens: m.tokens })).sort((a, b) => b.tokens - a.tokens),
      skills: (bd?.skills?.skillFrontmatter ?? []).map(k => ({ name: k.name, tokens: k.tokens })).sort((a, b) => b.tokens - a.tokens),
      attribution: attr.rows,
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

async function openPane($: EngineInterface): Promise<void> {
  await $.ui.open({ id: PANE, title: tr().pane })
  void refreshData($, 'full')
}

async function togglePane($: EngineInterface): Promise<boolean> {
  if ((await $.ui.panes()).some(p => p.id === PANE)) {
    await $.ui.close({ id: PANE })
    return false
  }
  await openPane($)
  return true
}

async function toggleBand($: EngineInterface): Promise<void> {
  const isUp = await update($, expanded, v => !v)
  try {
    await $.store.set(STORE_EXPANDED, isUp)
  } catch {
    // Remembered for this session only.
  }
  if (isUp) void refreshData($, 'summary')
}

// ---------------------------------------------------------------------------
// Lines: every item is one line with an emoji label, a value, a bar and a mood.

type Line = {
  key: string
  crab?: Mood
  emoji: string
  label: string
  value: string
  pct: number
  tone: Tone | null
  color?: string
  end?: string
  marker?: number
}

const NEUTRAL = '#378ADD'

const crabFor = (t: Tone): Mood => (t === 'red' ? 'angry' : t === 'orange' ? 'sweat' : t === 'yellow' ? 'calm' : 'happy')

const fitWord = (a: Advice): string => {
  const s = tr()
  if (a.fit === 'unknown') return s.effortUnknown
  if (a.fit === 'green') return s.fits
  if (a.fit === 'yellow') return a.dir === 'high' ? s.bitHigh : s.bitLow
  return a.dir === 'high' ? s.tooHigh : s.tooLow
}

const resetIn = (l: Limit | undefined, at: number): string => (l?.resetsAt ? fmtSpan(Date.parse(l.resetsAt) - at) : '')

type View = {
  status: Line[]
  model: Line
  advice: Advice | null
  worst: Tone
  mood: Mood
  level: Level
}

async function viewOf($: EngineInterface): Promise<View> {
  const s = tr()
  const snap = await read($, snapshot)
  const a = opts.advisor ? await read($, advice) : null
  const c = await read($, cache)
  const ho = await read($, handoff)
  const cur = await read($, effort)
  const at = Math.max(await read($, now), snap?.at ?? 0)
  const w = opts.warn
  const k = opts.crit
  const lines: Line[] = []

  const ctx = snap?.contextPercent
  const ctxTone = toneOf(ctx ?? 0, w, k)
  lines.push({
    key: 'ctx',
    crab: crabFor(ctxTone),
    emoji: '🧠',
    label: s.lineContext,
    value: ctx === null || ctx === undefined ? s.noReading : `${Math.round(ctx)}% · ${fmtTokens(snap?.contextTokens ?? 0)} / ${fmtTokens(snap?.window ?? 0)}`,
    pct: ctx ?? 0,
    tone: ctx === null || ctx === undefined ? null : ctxTone,
  })
  for (const [kind, emoji, label] of [
    ['five_hour', '⏱️', s.lineFive],
    ['seven_day', '📅', s.lineSeven],
  ] as const) {
    const l = limitOf(snap, kind)
    if (!l) continue
    const t = toneOf(l.percent, w, k)
    const reset = resetIn(l, at)
    lines.push({ key: kind, crab: crabFor(t), emoji, label, value: `${Math.round(l.percent)}%${reset ? ` · ${s.resetsIn} ${reset}` : ''}`, pct: l.percent, tone: t })
  }
  if (snap?.costUsd !== null && snap?.costUsd !== undefined) {
    const pct = (snap.costUsd / opts.costBudget) * 100
    const t = toneOf(pct, w, k)
    const extra = c.pingUsd ? ` · ${s.pings} ≈${fmtCost(c.pingUsd)}` : ''
    lines.push({ key: 'cost', crab: crabFor(t), emoji: '💵', label: s.lineCost, value: `${fmtCost(snap.costUsd)} ${fill(s.ofBudget, { usd: fmtCost(opts.costBudget) })}${extra}`, pct, tone: t })
  }
  const ttl = ttlOf(c, snap)
  const idle = c.touchedAt ? at - c.touchedAt : 0
  if (!c.touchedAt) {
    lines.push({ key: 'cache', crab: 'calm', emoji: '🧊', label: s.lineCache, value: s.noCache, pct: 0, tone: null, end: '' })
  } else if (idle >= ttl.ms) {
    lines.push({ key: 'cache', crab: 'sleep', emoji: '🧊', label: s.lineCache, value: s.cold, pct: 0, tone: null, end: '😴' })
  } else {
    const leftPct = ((ttl.ms - idle) / ttl.ms) * 100
    const t = toneOf(100 - leftPct, w, k)
    const ping = opts.keepAlive ? ` · ${s.ping} ${c.pings}/${opts.maxPings} ${fill(s.pingCost, { usd: fmtCost(pingCost(model, snap?.contextTokens ?? 0)) })}` : ''
    lines.push({
      key: 'cache',
      crab: crabFor(t),
      emoji: '🧊',
      label: s.lineCache,
      value: `${fmtLeft(ttl.ms - idle)} ${s.left}${ttl.isGuess ? ' (?)' : ''}${ping}`,
      pct: leftPct,
      tone: t,
      color: TONE_COLOR[t],
    })
  }

  const mt = modelTone(a)
  const curName = modelName(a?.currentModel || model)
  const modelLine: Line = a
    ? {
        key: 'model',
        crab: mt === 'red' ? 'angry' : 'gauge',
        emoji: '🤖',
        label: s.lineModel,
        value: `${s.now}: ${curName} · ${cur ?? '?'} → ${s.suggest} ${a.model} · ${a.effort} · ${fitWord(a)}`,
        pct: ((effortRank(cur) + 1) / EFFORTS.length) * 100,
        marker: ((effortRank(a.effort) + 1) / EFFORTS.length) * 100,
        tone: mt,
      }
    : { key: 'model', crab: 'gauge', emoji: '🤖', label: s.lineModel, value: `${s.now}: ${curName} · ${cur ?? '?'} · ${s.noAdvice}`, pct: ((effortRank(cur) + 1) / EFFORTS.length) * 100, tone: null }
  if (opts.advisor) lines.push(modelLine)

  const { pct } = budgetOf(snap)
  const level = levelOf(pct, w, k)
  const worst = worstTone(lines.flatMap(l => (l.tone && l.key !== 'cache' ? [l.tone] : [])))
  const mood: Mood = ho && (ho.isRunning || at - ho.at < 60_000) ? 'suitcase' : crabFor(worst)
  return { status: lines, model: modelLine, advice: a, worst, mood, level }
}

const breakdownLines = (d: PaneData | null): Line[] => {
  if (!d) return []
  const max = Math.max(1, d.max)
  return d.rows.map((r, i) => ({
    key: `cat-${i}`,
    emoji: categoryIcon(r.name),
    label: r.name,
    value: `${fmtTokens(r.tokens)} · ${Math.round((r.tokens / max) * 100)}%`,
    pct: (r.tokens / max) * 100,
    tone: null,
  }))
}

const KIND_EMOJI = { tool: '🔧', mcp: '🔌', skill: '🧩', agent: '🦀' } as const

const attrLines = (d: PaneData | null, limit: number): Line[] => {
  if (!d) return []
  const total = Math.max(1, d.attribution.reduce((n, r) => n + r.tokens, 0) + d.userTokens + d.replyTokens)
  return d.attribution.slice(0, limit).map((r, i) => ({
    key: `attr-${i}`,
    emoji: KIND_EMOJI[r.kind],
    label: r.key.replace(/^mcp__/, ''),
    value: `≈${fmtTokens(r.tokens)} · ${r.calls} ${tr().calls}`,
    pct: (r.tokens / total) * 100,
    tone: null,
  }))
}

const listLines = (prefix: string, emoji: string, list: { name: string; tokens: number }[]): Line[] => {
  const top = Math.max(1, ...list.map(x => x.tokens))
  return list.map((x, i) => ({ key: `${prefix}-${i}`, emoji, label: x.name, value: fmtTokens(x.tokens), pct: (x.tokens / top) * 100, tone: null }))
}

// ---------------------------------------------------------------------------
// SVG pieces (desktop and mobile). Text stays in Text elements, which wrap; SVG
// draws only the crabs and the bars, so nothing is ever cut.

const crabSvg = (mood: Mood, size = 22): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(size * 1.08)}" height="${size}" viewBox="0 0 30 28">${CRAB_CSS}${crab(0, 0, mood, 1, isRtl())}</svg>`

const barSvg = (W: number, pct: number, color: string, marker?: number): string => {
  const rtl = isRtl()
  const fw = Math.round((W * Math.max(0, Math.min(100, pct))) / 100)
  const mk = marker === undefined ? '' : (() => {
    const x = Math.max(0, Math.min(W - 3, Math.round((W * marker) / 100) - 2))
    return `<rect class="mk" x="${rtl ? W - x - 3 : x}" y="0" width="3" height="10" rx="1"/>`
  })()
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="10" viewBox="0 0 ${W} 10"><style>.k{fill:#e4e4e2}.mk{fill:#1f1f1f}@media (prefers-color-scheme: dark){.k{fill:#3a3a38}.mk{fill:#ececec}}</style>
<rect class="k" x="0" y="2" width="${W}" height="6" rx="3"/><rect x="${rtl ? W - fw : 0}" y="2" width="${fw}" height="6" rx="3" fill="${color}"/>${mk}</svg>`
}

const lineColor = (l: Line): string => l.color ?? (l.tone ? TONE_COLOR[l.tone] : NEUTRAL)
const lineEnd = (l: Line): string => l.end ?? (l.tone ? TONE_EMOJI[l.tone] : '')
const altOf = (l: Line): string => `${l.label}: ${l.value}`

// ---------------------------------------------------------------------------

export const register: Register = (on, options) => {
  opts = readOpts(options)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await detectLang($)
    await refreshModel($)
    await $.command.register({ name: 'usage-panel', description: 'Show or hide the cockpit usage panel: limits, cost, cache, model fit and what uses your tokens' })
    await $.command.register({ name: 'handoff', description: 'Write a handoff note to handoff/HANDOFF-<date>.md for a fresh session (one cheap Haiku call)' })
    await setEffort($, await readEffort($))
    try {
      const was = await $.store.get(STORE_EXPANDED)
      if (typeof was === 'boolean') await update($, expanded, () => was)
    } catch {
      // Collapsed by default.
    }
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
    if (!e.agentId && !isPinging) {
      isBusy = true
      if ((await read($, effort)) === null) await setEffort($, await readEffort($))
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (!e.agentId && !isPinging) {
      model = e.model || model
      if (typeof e.effort === 'string') await setEffort($, e.effort)
    }
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId && !isPinging) {
      isBusy = false
      const at = await $.clock.now()
      await update($, cache, c => ({ ...c, touchedAt: at, pings: 0 }))
      await update($, now, () => at)
      if ((await read($, expanded)) || (await read($, pane)) !== null) void refreshData($, 'summary')
    }
    return next(e)
  })

  // The engine reports the prompt-cache TTL on a model switch.
  on('classic.PreModelSwitch', async ($, e, next) => (await ttlHook($, e), next(e)))
  on('classic.PostModelSwitch', async ($, e, next) => {
    await ttlHook($, e)
    model = e.to_model || model
    return next(e)
  })
  // The active effort, where a classic hook carries it.
  on('classic.Stop', async ($, e, next) => {
    if (!e.agent_id) await setEffort($, e.effort?.level ?? null)
    return next(e)
  })
  on('classic.PostToolUse', async ($, e, next) => {
    if (!e.agent_id) await setEffort($, e.effort?.level ?? null)
    return next(e)
  })

  // After /effort or /model, read the new values back.
  on('command.run', { command: 'effort' }, async ($, e, next) => {
    const r = await next(e)
    const arg = e.args.trim().toLowerCase()
    await setEffort($, isLevel(arg) ? arg : await readEffort($))
    return r
  })
  on('command.run', { command: 'model' }, async ($, e, next) => {
    const r = await next(e)
    await refreshModel($)
    return r
  })

  on('prompt.submit', async ($, e, next) => {
    // Never touches the prompt: it reads the text and passes `e` on unchanged.
    // Only the person's own message counts: not a command, a hidden prompt, a
    // notification, a peer's message or a plugin's.
    const text = e.text.trim()
    const isPerson = isPersonOrigin(e.origin.kind) && !e.command && !e.isMeta && text !== '' && !text.startsWith('/')
    if (opts.debug) $.ui.log(`cockpit: prompt.submit origin=${e.origin.kind} length=${e.text.length} advised=${opts.advisor && isPerson}`)
    if (opts.advisor && isPerson) {
      const at = await $.clock.now()
      const a = adviceFor(e.text, await read($, effort), model, at)
      await update($, advice, () => a)
    }
    return next(e)
  })

  on('command.run', { command: 'usage-panel' }, async ($, e) => {
    if ((e.args ?? '').trim() === 'open') {
      await openPane($)
      return { text: tr().opened }
    }
    return { text: (await togglePane($)) ? tr().opened : tr().closed }
  })

  on('command.run', { command: 'handoff' }, async $ => ({ text: await writeHandoff($) }))

  // -------------------------------------------------------------------------
  // Drawing.

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const s = tr()
    const ui = $.ui.resolve(e) as unknown as UI
    const v = await viewOf($)
    const data = await read($, pane)
    const all = await read($, showAll)
    const size = sizeOf(e.props.bodyColumns, e.surface !== 'terminal' && 'Svg' in ui)
    const { Box, Text, Button } = ui
    const switchBtn = switchButton(ui, $, v)
    const more: Line[] = all && data
      ? [
          ...listLines('mcp', '🔌', data.mcpServers),
          ...listLines('mem', '🗂️', data.memory.map(m => ({ name: m.path, tokens: m.tokens }))),
          ...listLines('skill', '🧩', data.skills),
        ]
      : []
    return (
      <Box flexDirection="column" alignItems={isRtl() ? 'flex-end' : undefined}>
        {header(ui, $, v, size, false)}
        {v.status.map(l => lineEl(ui, l, size, l.key === 'model' ? switchBtn : null))}
        {guardButtons(ui, $, v)}
        <Text bold>🔎 {s.whatUses}</Text>
        {data === null ? <Text dimColor>{s.loading}</Text> : null}
        {data?.error ? <Text color="red">{data.error}</Text> : null}
        {breakdownLines(data).map(l => lineEl(ui, l, size))}
        {data ? (
          <Text bold>
            🏆 {s.topUsers} <Text dimColor>({s.estimate})</Text>
          </Text>
        ) : null}
        {attrLines(data, all ? 1000 : 5).map(l => lineEl(ui, l, size))}
        {all && data
          ? [
              lineEl(ui, { key: 'you', emoji: '🙋', label: s.userTokens, value: `≈${fmtTokens(data.userTokens)}`, pct: 0, tone: null }, size),
              lineEl(ui, { key: 'reply', emoji: '💬', label: s.replyTokens, value: `≈${fmtTokens(data.replyTokens)}`, pct: 0, tone: null }, size),
            ]
          : null}
        {more.length ? <Text bold>📚 {s.mcpBy} · {s.memory} · {s.skills}</Text> : null}
        {more.map(l => lineEl(ui, l, size))}
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Button key="refresh" label={`🔄 ${s.refresh}`} plain onPress={() => refreshData($, 'full')} />
          <Button key="show-all" label={all ? `▴ ${s.showLess}` : `▾ ${s.showAll}`} plain onPress={() => update($, showAll, x => !x)} />
        </Box>
        {data ? <Text dimColor>{s.estimateNote}</Text> : null}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    // Draw with the other mods' bands; the engine's placeholder is never nested.
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null
    const s = tr()
    const ui = $.ui.resolve(e) as unknown as UI
    const { Box, Text } = ui
    const v = await viewOf($)
    const isUp = await read($, expanded)
    const size = sizeOf(e.props.bodyColumns, e.surface !== 'terminal' && 'Svg' in ui)

    if (!isUp) {
      // Collapsed: one small button; the other mods' bands sit beside it.
      return (
        <Box flexDirection={isRtl() ? 'row-reverse' : 'row'} gap={1} flexWrap="wrap" alignItems="center">
          {header(ui, $, v, size, true)}
          {below as never}
        </Box>
      )
    }
    const data = await read($, pane)
    return (
      <Box flexDirection="column">
        {header(ui, $, v, size, true)}
        {v.status.map(l => lineEl(ui, l, size, l.key === 'model' ? switchButton(ui, $, v) : null))}
        {guardButtons(ui, $, v)}
        <Text bold>🔎 {s.whatUses}</Text>
        {data === null ? <Text dimColor>{s.loading}</Text> : null}
        {breakdownLines(data).map(l => lineEl(ui, l, size))}
        {data && data.attribution.length ? (
          <Text bold>
            🏆 {s.topUsers} <Text dimColor>({s.estimate})</Text>
          </Text>
        ) : null}
        {attrLines(data, 5).map(l => lineEl(ui, l, size))}
        {below as never}
      </Box>
    )
  })
}

// ---------------------------------------------------------------------------
// Element builders. The element table differs per surface; these take it whole.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type El = any
type UI = { Box: El; Text: El; Button: El; Svg?: El }
type Size = { W: number; barW: number; isSvg: boolean }

const sizeOf = (columns: number, isSvg: boolean): Size => {
  const cols = Math.max(20, columns || 60)
  return { W: Math.max(140, Math.min(720, cols * 8 - 24)), barW: Math.max(8, Math.min(30, cols - 6)), isSvg }
}

const crabEl = (ui: UI, mood: Mood, size: Size, tone: Tone | null = null) => {
  const { Svg, Text } = ui
  if (size.isSvg && Svg) return <Svg source={crabSvg(mood)} alt={`crab: ${mood}`} width={24} height={22} />
  return <Text color={tone === 'red' ? TONE_COLOR.red : CLAY}>{crabText(mood)}</Text>
}

function lineEl(ui: UI, l: Line, size: Size, extra: unknown = null) {
  const { Box, Text, Svg } = ui
  const end = lineEnd(l)
  return (
    <Box key={l.key} flexDirection="column" marginBottom={size.isSvg ? 0 : 1}>
      <Box flexDirection={isRtl() ? 'row-reverse' : 'row'} gap={1} alignItems="center">
        {l.crab ? <Box flexShrink={0}>{crabEl(ui, l.crab, size, l.tone)}</Box> : null}
        <Box flexShrink={1}>
          <Text>
            {l.emoji} <Text bold>{l.label}</Text> <Text color={l.tone ? TONE_COLOR[l.tone] : undefined}>{l.value}</Text>
            {end ? ` ${end}` : ''}
          </Text>
        </Box>
      </Box>
      {extra ? (
        <Box flexDirection="row" flexWrap="wrap">
          {extra as never}
        </Box>
      ) : null}
      {size.isSvg && Svg ? (
        <Svg source={barSvg(size.W, l.pct, lineColor(l), l.marker)} alt={altOf(l)} width={size.W} height={10} />
      ) : (
        <Text color={lineColor(l)}>{bar(l.pct, size.barW)}</Text>
      )}
    </Box>
  )
}

function header($ui: UI, $: EngineInterface, v: View, size: Size, isBand: boolean) {
  const { Box, Button, Text } = $ui
  const s = tr()
  const label = `${size.isSvg ? '' : crabText(v.mood) + ' '}📊 ${s.bandUsage} ${TONE_EMOJI[v.worst]}`
  return (
    <Box key="cockpit-head" flexDirection={isRtl() ? 'row-reverse' : 'row'} gap={1} alignItems="center" flexWrap="wrap">
      {size.isSvg ? crabEl($ui, v.mood, size) : null}
      {isBand ? <Button key="cockpit-usage" label={label} plain onPress={() => toggleBand($)} /> : <Text bold>{label}</Text>}
    </Box>
  )
}

function guardButtons(ui: UI, $: EngineInterface, v: View) {
  const { Box, Button } = ui
  const s = tr()
  return (
    <Box key="cockpit-guard" flexDirection="row" gap={1} flexWrap="wrap">
      {v.level === 'critical' ? <Button key="cockpit-compact" label={`🗜️ ${s.compact}`} variant="primary" onPress={() => compactNow($)} /> : null}
      {v.level === 'critical' ? <Button key="cockpit-handoff" label={`🧳 ${s.handoff}`} onPress={() => runHandoff($)} /> : null}
      <Button key="cockpit-full" label={`📋 ${s.fullList}`} plain onPress={() => openPane($)} />
    </Box>
  )
}

function switchButton(ui: UI, $: EngineInterface, v: View) {
  const { Button } = ui
  const a = v.advice
  if (!a || modelTone(a) === 'green') return null
  return <Button key="cockpit-switch" label={`🔀 ${tr().apply} → ${a.model} · ${a.effort}`} plain onPress={() => switchTo($, a)} />
}

async function ttlHook($: EngineInterface, e: { cache_ttl?: string }): Promise<void> {
  const ttl: Cache['detectedTtl'] = e.cache_ttl === '1h' ? '1h' : e.cache_ttl === '5m' ? '5m' : null
  if (ttl) await update($, cache, c => ({ ...c, detectedTtl: ttl }))
}
