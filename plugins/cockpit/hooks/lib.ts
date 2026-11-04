// Pure logic of cockpit: no `$`, so the tests can call it directly.

import type { Advice, AttrRow, Fit, Level, ModelPick, EffortPick, Tone } from '../types'
import { TIERS, adviseInContext, scorePrompt, whyText } from './advisor'
import type { Sticky } from './advisor'

// ---------------------------------------------------------------------------
// Prices. Copied from JohnnyVizz/claude-kit savvy-progress (MIT, see
// THIRD_PARTY_NOTICES.md). USD per million tokens: input, output, cache read,
// cache write. The first row that matches a model id wins.

export type Price = [input: number, output: number, cacheRead: number, cacheWrite: number]

const PRICES: [RegExp, Price][] = [
  [/(fable|mythos)-5-1/, [10, 50, 0.25, 20]],
  [/fable|mythos/, [10, 50, 1, 20]],
  [/opus-5-5/, [4, 20, 0.2, 8]],
  [/opus/, [5, 25, 0.5, 10]],
  [/sonnet-5-5/, [2, 10, 0.1, 4]],
  [/sonnet-5/, [2, 10, 0.2, 4]],
  [/sonnet/, [3, 15, 0.3, 6]],
  [/haiku-5-5/, [0.1, 0.5, 0.01, 0.2]],
  [/haiku/, [1, 5, 0.1, 2]],
]

const HAIKU_LONG_PROMPT = 100_000
const HAIKU_LONG: Price = [0.5, 2.5, 0.05, 1]

export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export const priceOf = (model: string, prompt = 0): Price => {
  const id = model.toLowerCase()
  if (prompt > HAIKU_LONG_PROMPT && /haiku-5-5/.test(id)) return HAIKU_LONG
  return PRICES.find(([re]) => re.test(id))?.[1] ?? [4, 20, 0.2, 8]
}

export const costOf = (model: string, u: Usage): number => {
  const prompt = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
  const [i, o, r, w] = priceOf(model, prompt)
  return (
    ((u.input_tokens || 0) * i + (u.output_tokens || 0) * o + (u.cache_read_input_tokens || 0) * r + (u.cache_creation_input_tokens || 0) * w) /
    1e6
  )
}

// One keep-alive ping: the whole context read from the cache, a few new input
// tokens and a one-word answer.
export const pingCost = (model: string, contextTokens: number): number =>
  costOf(model, { input_tokens: 40, output_tokens: 5, cache_read_input_tokens: contextTokens, cache_creation_input_tokens: 0 })

// ---------------------------------------------------------------------------
// Model and effort advisor: keyword and length rules, no model call.

export const EFFORTS: readonly EffortPick[] = ['low', 'medium', 'high', 'xhigh', 'max']
const rank = (e: string): number => EFFORTS.indexOf(e as EffortPick)

// The classifier itself lives in advisor.ts; these keep the older entry points.
export { cleanPrompt } from './advisor'

// The origins that are a person's own message: Enter at the prompt, the
// Remote Control bridge, and the SDK host (the desktop app's local sessions).
export const isPersonOrigin = (kind: string): boolean => kind === 'composer' || kind === 'bridge' || kind === 'sdk'

export function advise(text: string): { model: ModelPick; effort: EffortPick; reason: string } {
  const s = scorePrompt(text)
  const t = TIERS[s.tier] ?? { model: 'sonnet', effort: 'medium' }
  return { model: t.model, effort: t.effort, reason: whyText(s.why, 'en') }
}

// green: fits; yellow: one level off; red: two or more. `dir` says which way.
export function fitOf(suggested: EffortPick, current: string | null): { fit: Fit; dir: 'high' | 'low' | '' } {
  if (!current || rank(current) < 0) return { fit: 'unknown', dir: '' }
  const d = rank(current) - rank(suggested)
  const dir = d > 0 ? 'high' : d < 0 ? 'low' : ''
  if (d === 0) return { fit: 'green', dir }
  if (Math.abs(d) === 1) return { fit: 'yellow', dir }
  return { fit: 'red', dir }
}

// The advice for a prompt, in the context of the task before it (`prev`).
export function adviceFor(text: string, currentEffort: string | null, currentModel: string, at: number, prev: Sticky | null = null): Advice {
  const r = adviseInContext(text, prev)
  const t = TIERS[r.tier] ?? { model: 'sonnet', effort: 'medium' }
  const f = fitOf(t.effort, currentEffort)
  return {
    model: t.model,
    effort: t.effort,
    reason: whyText(r.why, 'en'),
    why: r.why,
    tier: r.tier,
    score: r.score,
    sticky: r.sticky,
    fit: f.fit,
    dir: f.dir,
    currentEffort,
    currentModel,
    at,
  }
}

// ---------------------------------------------------------------------------
// Budget levels and bar tones.

export const toneOf = (pct: number, warn = 70, crit = 85): Tone => (pct > crit ? 'red' : pct >= warn ? 'orange' : pct >= 50 ? 'yellow' : 'green')

const TONE_RANK: Record<Tone, number> = { green: 0, yellow: 1, orange: 2, red: 3 }
export const worstTone = (tones: readonly Tone[]): Tone => tones.reduce<Tone>((w, t) => (TONE_RANK[t] > TONE_RANK[w] ? t : w), 'green')

export const TONE_EMOJI: Record<Tone, string> = { green: '😊', yellow: '😐', orange: '😰', red: '😡' }
export const TONE_COLOR: Record<Tone, string> = { green: '#3B9C5F', yellow: '#D9B21B', orange: '#E8833A', red: '#E5484D' }

const FAMILY_RANK: Record<string, number> = { haiku: 0, sonnet: 1, opus: 2, fable: 2, mythos: 2 }

// How well the current model and effort fit the advice: red when the effort is
// two levels off or the model two tiers off (Haiku for a deep task, Opus for "hi").
export function modelTone(a: Advice | null): Tone {
  if (!a) return 'green'
  const cur = FAMILY_RANK[familyOf(a.currentModel)]
  const gap = cur === undefined ? 0 : Math.abs(cur - (FAMILY_RANK[a.model] ?? 1))
  if (a.fit === 'red' || gap >= 2) return 'red'
  if (a.fit === 'yellow' || gap === 1) return 'yellow'
  return 'green'
}

export const effortRank = (e: string | null): number => (e ? EFFORTS.indexOf(e as EffortPick) : -1)

export const levelOf = (pct: number, warn: number, crit: number): Level => (pct >= crit ? 'critical' : pct >= warn ? 'warning' : 'ok')

// ---------------------------------------------------------------------------
// Attribution: an estimate from the transcript, about 4 characters per token.

type Msg = {
  role: 'user' | 'assistant'
  text: string
  toolUses: readonly { tool: string; input: Record<string, unknown>; text?: string }[]
}

export const estTokens = (s: string): number => Math.ceil(s.length / 4)

export function sourceOf(tool: string, input: Record<string, unknown>): { key: string; kind: AttrRow['kind'] } {
  if (tool === 'Skill' && typeof input.skill === 'string') return { key: input.skill, kind: 'skill' }
  if ((tool === 'Agent' || tool === 'Task') && typeof input.subagent_type === 'string') return { key: input.subagent_type, kind: 'agent' }
  if (tool === 'Agent' || tool === 'Task') return { key: 'general-purpose', kind: 'agent' }
  return { key: tool, kind: tool.startsWith('mcp__') ? 'mcp' : 'tool' }
}

export function attribute(messages: readonly Msg[]): { rows: AttrRow[]; userTokens: number; replyTokens: number } {
  const map = new Map<string, AttrRow>()
  let userTokens = 0
  let replyTokens = 0
  for (const m of messages) {
    if (m.role === 'user') userTokens += estTokens(m.text)
    else replyTokens += estTokens(m.text)
    for (const u of m.toolUses ?? []) {
      const { key, kind } = sourceOf(u.tool, u.input ?? {})
      const id = `${kind}:${key}`
      const row = map.get(id) ?? { key, kind, calls: 0, tokens: 0 }
      row.calls += 1
      row.tokens += estTokens(JSON.stringify(u.input ?? {})) + estTokens(u.text ?? '')
      map.set(id, row)
    }
  }
  const rows = [...map.values()].sort((a, b) => b.tokens - a.tokens)
  return { rows, userTokens, replyTokens }
}

// Files the transcript edited or wrote, for the handoff note.
export function filesTouched(messages: readonly Msg[]): string[] {
  const out = new Set<string>()
  for (const m of messages)
    for (const u of m.toolUses ?? []) {
      if (!/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(u.tool)) continue
      const p = u.input?.file_path ?? u.input?.notebook_path
      if (typeof p === 'string') out.add(p)
    }
  return [...out]
}

// The transcript as plain text for the handoff call, the newest part kept.
export function transcriptText(messages: readonly Msg[], max = 60_000): string {
  const parts = messages.map(m => {
    const tools = (m.toolUses ?? []).map(u => `  [tool ${u.tool}] ${JSON.stringify(u.input ?? {}).slice(0, 200)}`).join('\n')
    return `${m.role.toUpperCase()}: ${m.text.slice(0, 4000)}${tools ? '\n' + tools : ''}`
  })
  let out = parts.join('\n\n')
  if (out.length > max) out = '[earlier part cut]\n' + out.slice(out.length - max)
  return out
}

// ---------------------------------------------------------------------------
// Formatting.

export const fmtTokens = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`)

export const fmtCost = (usd: number): string => (usd < 0.01 && usd > 0 ? `$${usd.toFixed(3)}` : `$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`)

export const fmtClock = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

// "2h 13m", "4d 3h", "12m".
export const fmtSpan = (ms: number): string => {
  const m = Math.max(0, Math.round(ms / 60000))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const mm = m % 60
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${mm}m`
  return `${mm}m`
}

const pad = (n: number): string => String(n).padStart(2, '0')

// `HANDOFF-2026-11-04-2015.md`, in UTC so the name never depends on the host's zone.
export const handoffName = (ms: number): string => {
  const d = new Date(ms)
  return `HANDOFF-${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}.md`
}

// "4:59 left" style: m:ss, or h:mm:ss past an hour.
export const fmtLeft = (ms: number): string => fmtClock(Math.max(0, ms))

// The /context category a breakdown row is, as an emoji.
export const categoryIcon = (name: string): string =>
  /system prompt/i.test(name) ? '📜' : /mcp/i.test(name) ? '🔌' : /system tools|built-?in|tools/i.test(name) ? '🔧' : /skill/i.test(name) ? '🧩' : /memory/i.test(name) ? '🗂️' : /message/i.test(name) ? '💬' : /agent/i.test(name) ? '🤖' : '📦'

export const bar = (pct: number, width: number): string => {
  const filled = Math.max(0, Math.min(width, Math.round((width * pct) / 100)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export const modelName = (id: string): string => {
  const m = /(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2})(?!\d))?/i.exec(id)
  const [, family = '', major = '', minor] = m ?? []
  if (!family) return id.replace(/^claude-/, '').replace(/\[.*\]$/, '') || '?'
  return `${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()} ${major}${minor ? '.' + minor : ''}`
}

export const familyOf = (id: string): string => /(fable|mythos|opus|sonnet|haiku)/i.exec(id)?.[1]?.toLowerCase() ?? ''
