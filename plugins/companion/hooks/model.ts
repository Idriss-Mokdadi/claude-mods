// What companion knows (Raw), and the pure mapping from it to what is drawn
// (View). Everything here is plain data and pure functions, so each mapping
// is tested without the engine.

import type { Act, AgentState, Mood, View } from '../types'

export type Agent = { id: string; state: AgentState; at: number }

export type Raw = {
  // Plan limits, percent used; null until the engine reports them.
  h5: number | null
  d7: number | null
  // Prompt cache: when the last main turn ended (0: none yet), and the TTL.
  touchedAt: number
  ttlMs: number
  isBusy: boolean
  // The tool group the main loop is using now.
  act: Act | null
  // Waiting for the person: a permission prompt or a question.
  isWaiting: boolean
  // A tool failed or a turn errored, until this time.
  errorUntil: number
  // The prompt looks too hard for the model in use.
  isConfused: boolean
  agents: Agent[]
  tasks: { total: number; done: number }
  // Compaction: running, or when it ended (0: none).
  isCompacting: boolean
  compactEndedAt: number
  handoffAt: number
  partyAt: number
  // Critical level for the plan limits, percent.
  crit: number
}

export const freshRaw = (crit = 90, ttlMs = 3_600_000): Raw => ({
  h5: null,
  d7: null,
  touchedAt: 0,
  ttlMs,
  isBusy: false,
  act: null,
  isWaiting: false,
  errorUntil: 0,
  isConfused: false,
  agents: [],
  tasks: { total: 0, done: 0 },
  isCompacting: false,
  compactEndedAt: 0,
  handoffAt: 0,
  partyAt: 0,
  crit,
})

// How long each passing effect stays in the scene, in ms.
export const SHOW = {
  agentDone: 4000,
  agentFail: 6000,
  compactOut: 2500,
  handoff: 6000,
  party: 8000,
  error: 8000,
} as const

// Ten bands or shells, one per started 10%: 1% lights the first one.
export const tenths = (pct: number | null): number => (pct === null ? 0 : Math.max(0, Math.min(10, Math.ceil(Math.max(0, pct) / 10 - 1e-9))))

// Daylight from the cache age: 1 just after a turn (or while working), 0 when
// the TTL has run out. Quantised to 5% so a redraw happens only when it shows.
export const lightOf = (r: Pick<Raw, 'touchedAt' | 'ttlMs' | 'isBusy'>, now: number): number => {
  if (r.isBusy || r.touchedAt === 0) return 1
  const k = 1 - (now - r.touchedAt) / Math.max(1, r.ttlMs)
  return Math.max(0, Math.min(1, Math.round(k * 20) / 20))
}

// Crabs fall asleep one by one as the cache ages; all three when it is cold.
export const asleepOf = (k: number): number => (k <= 0 ? 3 : k < 0.4 ? 2 : k < 0.7 ? 1 : 0)

export const castleOf = (t: Raw['tasks']): { castle: number; flag: boolean } => ({
  castle: Math.max(0, Math.min(5, t.done)),
  flag: t.total > 0 && t.done >= t.total,
})

export function viewOf(r: Raw, now: number): View {
  const light = lightOf(r, now)
  const asleep = r.isBusy ? 0 : asleepOf(light)
  const cold = light <= 0 && !r.isBusy
  const agents = r.agents
    .filter(a => a.state === 'run' || now - a.at < (a.state === 'done' ? SHOW.agentDone : SHOW.agentFail))
    .slice(-6)
    .map(a => ({ id: a.id, state: a.state }))
  const critical = (r.h5 ?? 0) >= r.crit || (r.d7 ?? 0) >= r.crit
  const isError = now < r.errorUntil
  const compact: View['compact'] = r.isCompacting ? 'in' : r.compactEndedAt && now - r.compactEndedAt < SHOW.compactOut ? 'out' : null
  const handoff = r.handoffAt > 0 && now - r.handoffAt < SHOW.handoff
  const party = r.partyAt > 0 && now - r.partyAt < SHOW.party
  const { castle, flag } = castleOf(r.tasks)
  const act = r.isBusy ? r.act : null
  const mood: Mood = isError
    ? 'error'
    : r.isWaiting
      ? 'waiting'
      : party
        ? 'dance'
        : critical
          ? 'error'
          : r.isBusy
            ? act === 'read'
              ? 'reading'
              : act === 'edit'
                ? 'editing'
                : act === 'bash'
                  ? 'running'
                  : 'working'
            : cold && r.touchedAt > 0
              ? 'sleeping'
              : r.touchedAt > 0
                ? 'done'
                : 'ready'
  return {
    h5: r.h5 === null ? null : Math.round(r.h5),
    d7: r.d7 === null ? null : Math.round(r.d7),
    bands: tenths(r.h5),
    shells: tenths(r.d7),
    light,
    asleep,
    cold,
    agents,
    castle,
    flag,
    act,
    confused: r.isConfused,
    angry: isError || critical,
    critical,
    compact,
    handoff,
    party,
    mood,
  }
}

export const sameView = (a: View | null, b: View): boolean => a !== null && JSON.stringify(a) === JSON.stringify(b)

// ---------------------------------------------------------------------------
// Reading tool calls.

const READ = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead', 'ToolSearch'])
const EDIT = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const BASH = new Set(['Bash', 'PowerShell', 'BashOutput', 'Monitor'])
const WEB = new Set(['WebSearch', 'WebFetch'])

export const actOf = (tool: string): Act | null =>
  READ.has(tool) ? 'read' : EDIT.has(tool) ? 'edit' : BASH.has(tool) ? 'bash' : WEB.has(tool) || /^mcp__.*(fetch|browser|web|search)/i.test(tool) ? 'web' : null

// A test run: the usual runners and package scripts.
export const isTestCommand = (cmd: string): boolean =>
  /(^|[;&|]\s*|\s)(pytest|jest|vitest|mocha|ctest|phpunit|rspec|tox)\b/.test(cmd) ||
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b/.test(cmd) ||
  /\b(npm|pnpm)\s+t\b/.test(cmd) ||
  /\b(cargo|go|deno|dotnet|mix|swift|flutter|dart)\s+test\b/.test(cmd) ||
  /\b(gradlew?|mvnw?|mvn)\b[^\n]*\btest\b/.test(cmd) ||
  /\bpython3?\s+-m\s+(pytest|unittest)\b/.test(cmd) ||
  /\bclaude\s+plugin\s+test\b/.test(cmd) ||
  /\bmake\s+(test|check)\b/.test(cmd)

export const isCommitCommand = (cmd: string): boolean => /\bgit\b(\s+-\S+(\s+\S+)?)*\s+commit\b/.test(cmd) && !/--dry-run/.test(cmd)

// Tasks from TodoWrite (the whole list) or TaskCreate / TaskUpdate (one by one).
export type TaskBook = Map<string, 'pending' | 'in_progress' | 'completed'>

export const tasksOfBook = (b: TaskBook): Raw['tasks'] => ({
  total: b.size,
  done: [...b.values()].filter(s => s === 'completed').length,
})

export const tasksOfTodos = (todos: readonly { status: string }[]): Raw['tasks'] => ({
  total: todos.length,
  done: todos.filter(t => t.status === 'completed').length,
})

// ---------------------------------------------------------------------------
// The confused crab: a free, rule-based look at the prompt. Only the clear case
// is flagged: a long or hard task (design, debugging, security, proofs) given
// to a small model.

const HARD = [
  /\b(refactor|architect|architecture|redesign|design (a|the)|debug|race condition|deadlock|concurren|security|vulnerab|threat model|prove|proof|optimi[sz]e|migrat|algorithm|complexity|think (deeply|hard)|step by step|end[- ]to[- ]end|from scratch)\w*/i,
  /\b(réfléchis|conçois|concevoir|déboguer|débogue|sécurité|optimise[rz]?|démontre|refactorise|migration|architecture)\w*/i,
  /(صمم|تصميم|معمارية|تصحيح|أمان|برهن|حسّن|خوارزمية|فكر بعمق)/,
]

export const isHardPrompt = (text: string): boolean => text.length > 1500 || HARD.some(re => re.test(text))

export const isSmallModel = (model: string): boolean => /haiku/i.test(model)

export const looksMisfit = (text: string, model: string): boolean => isSmallModel(model) && isHardPrompt(text)

export const fmtSpan = (ms: number): string => {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
