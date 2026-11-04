export type Level = 'ok' | 'warning' | 'critical'
export type Fit = 'green' | 'yellow' | 'red' | 'unknown'
export type ModelPick = 'haiku' | 'sonnet' | 'opus'
export type EffortPick = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type Mood = 'happy' | 'calm' | 'sweat' | 'angry' | 'sleep' | 'suitcase' | 'gauge'
// green < 50%, yellow 50-warn, orange warn-critical, red past critical.
export type Tone = 'green' | 'yellow' | 'orange' | 'red'

export type Limit = { kind: string; percent: number; resetsAt?: string }

export type Snapshot = {
  contextPercent: number | null
  contextTokens: number | null
  window: number
  limits: Limit[]
  costUsd: number | null
  model: string
  at: number
}

export type Advice = {
  model: ModelPick
  effort: EffortPick
  reason: string
  // The signals behind it (advisor.ts SignalId), strongest first.
  why: string[]
  // 0 haiku·low … 5 opus·xhigh, and the score that gave it.
  tier: number
  score: number
  // The task context a short follow-up keeps.
  sticky: { tier: number; left: number; why: string[] } | null
  // Set when the optional AI check answered: what it cost.
  aiUsd?: number
  fit: Fit
  dir: 'high' | 'low' | ''
  currentEffort: string | null
  currentModel: string
  at: number
}

export type AttrRow = { key: string; kind: 'tool' | 'mcp' | 'skill' | 'agent'; calls: number; tokens: number }

export type BreakdownRow = { name: string; tokens: number; kind: string }

export type PaneData = {
  rows: BreakdownRow[]
  total: number
  max: number
  mcpServers: { name: string; tokens: number }[]
  memory: { path: string; tokens: number }[]
  skills: { name: string; tokens: number }[]
  attribution: AttrRow[]
  userTokens: number
  replyTokens: number
  at: number
  error?: string
}

export type Cache = {
  // When the cache was last written or read: the end of the last main turn, or a ping.
  touchedAt: number
  // Pings since the last real turn.
  pings: number
  // What all pings cost this session.
  pingUsd: number
  // The TTL the engine reported in a model-switch hook, when one fired.
  detectedTtl: '5m' | '1h' | null
}

export type Handoff = { path: string; at: number; isRunning: boolean; usd: number }

declare module 'claude-code' {
  interface PluginState {
    cockpit: {
      snapshot: Shaped<Snapshot | null>
      advice: Shaped<Advice | null>
      effort: string | null
      now: number
      cache: Shaped<Cache>
      pane: Shaped<PaneData | null>
      alerted: Level
      handoff: Shaped<Handoff | null>
      expanded: boolean
      showAll: boolean
    }
  }
}
