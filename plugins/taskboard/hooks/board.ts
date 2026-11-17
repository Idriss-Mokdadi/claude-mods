// The task board as pure functions: what each tool call does to it. No `$` here,
// so every rule is tested on plain values.

import type { Activity, Board, Prop, Task, TaskState, TaskStatus, Verb } from '../types'

export const EMPTY: Board = { tasks: [], activity: null, doneAt: null }

export const TASK_TOOLS: ReadonlySet<string> = new Set(['TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'TodoWrite'])

type In = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const isStatus = (v: unknown): v is TaskStatus => v === 'pending' || v === 'in_progress' || v === 'completed'

// The last path segment: "src/parser.py" -> "parser.py".
export const baseName = (p: string): string => {
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || p
}

export const clip = (s: string, n: number): string => {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? `${one.slice(0, n - 1)}…` : one
}

const hostOf = (url: string): string => {
  const m = /^[a-z]+:\/\/([^/?#]+)/i.exec(url)
  return m?.[1] ?? clip(url, 30)
}

// The prop a crab holds for a tool.
export const propOf = (tool: string): Prop => {
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return 'wrench'
  if (/^(Read|Grep|Glob|LS|NotebookRead)$/.test(tool)) return 'magnifier'
  if (/^(Bash|BashOutput|PowerShell|KillShell|Monitor)$/.test(tool)) return 'terminal'
  if (/^(WebSearch|WebFetch)$/.test(tool) || tool.startsWith('mcp__')) return 'antenna'
  return 'think'
}

// "Reading parser.py", "Running npm test": the verb and its target.
export const activityOf = (tool: string, input: In, at: number): Activity => {
  const a = (verb: Verb, target = ''): Activity => ({ verb, target, prop: propOf(tool), tool, at })
  switch (tool) {
    case 'Read':
    case 'NotebookRead':
      return a('read', baseName(str(input.file_path) || str(input.notebook_path) || str(input.path)))
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return a('edit', baseName(str(input.file_path) || str(input.notebook_path)))
    case 'Write':
      return a('write', baseName(str(input.file_path)))
    case 'Bash':
    case 'PowerShell':
      return a('run', clip(str(input.command) || str(input.description), 40))
    case 'Grep':
      return a('search', clip(str(input.pattern), 30))
    case 'Glob':
    case 'LS':
      return a('find', clip(str(input.pattern) || str(input.path), 30))
    case 'WebSearch':
      return a('web', clip(str(input.query), 30))
    case 'WebFetch':
      return a('fetch', hostOf(str(input.url)))
    case 'Agent':
    case 'Task':
      return a('agent', clip(str(input.description), 30))
    default:
      if (TASK_TOOLS.has(tool)) return a('plan')
      if (tool.startsWith('mcp__')) {
        const [, server = '', name = ''] = tool.split('__')
        return a('mcp', `${server} ${name}`.trim())
      }
      return a('other', tool)
  }
}

// What a row shows.
export const stateOf = (t: Task, all: readonly Task[]): TaskState => {
  if (t.status === 'completed') return 'completed'
  if (t.failed !== undefined) return 'failed'
  if (t.blocked !== undefined) return 'blocked'
  if (t.status === 'pending' && t.blockedBy.some(id => all.find(o => o.id === id && o.status !== 'completed'))) return 'blocked'
  return t.status
}

// The reason a blocked or failed row gives: its own words, or the tasks it waits on.
export const reasonOf = (t: Task, all: readonly Task[]): string => {
  if (t.failed !== undefined) return t.failed
  if (t.blocked !== undefined) return t.blocked
  const open = t.blockedBy.filter(id => all.find(o => o.id === id && o.status !== 'completed'))
  return open.map(id => `#${id}`).join(', ')
}

export type Counts = { done: number; total: number; pct: number; running: number; failed: number }

export const countsOf = (b: Board): Counts => {
  const total = b.tasks.length
  const done = b.tasks.filter(t => t.status === 'completed').length
  return {
    done,
    total,
    pct: total ? Math.round((100 * done) / total) : 0,
    running: b.tasks.filter(t => t.status === 'in_progress').length,
    failed: b.tasks.filter(t => stateOf(t, b.tasks) === 'failed').length,
  }
}

// The task a tool call counts toward: the newest in-progress task of the same
// loop, else the newest in-progress task of any.
export const currentOf = (b: Board, agentId?: string): Task | undefined => {
  const running = b.tasks.filter(t => t.status === 'in_progress')
  const by = (l: Task[]) => [...l].sort((x, y) => (y.startedAt ?? 0) - (x.startedAt ?? 0))[0]
  return by(running.filter(t => t.agentId === agentId)) ?? by(running)
}

// Rough token estimate of a call: what goes in and what comes back, 4 chars a token.
export const estimateTokens = (input: unknown, text: string | undefined): number => {
  let n = 0
  try {
    n = JSON.stringify(input ?? {}).length
  } catch {
    n = 0
  }
  return Math.ceil((n + (text?.length ?? 0)) / 4)
}

// A status change, with its times.
const moved = (t: Task, status: TaskStatus, at: number): Task => {
  if (status === t.status) return t
  if (status === 'in_progress') return { ...t, status, startedAt: t.startedAt ?? at, endedAt: undefined }
  if (status === 'completed') return { ...t, status, startedAt: t.startedAt ?? at, endedAt: at, failed: undefined, blocked: undefined }
  return { ...t, status, startedAt: undefined, endedAt: undefined }
}

const settle = (b: Board, at: number): Board => {
  const isDone = b.tasks.length > 0 && b.tasks.every(t => t.status === 'completed')
  return { ...b, doneAt: isDone ? (b.doneAt ?? at) : null }
}

const newTask = (id: string, subject: string, source: Task['source'], agentId?: string): Task => ({
  id, subject, status: 'pending', blockedBy: [], tools: 0, tokens: 0, source, ...(agentId ? { agentId } : {}),
})

// A failed / blocked note from TaskUpdate's metadata: a string, or true.
const note = (v: unknown, word: string): string | undefined | null =>
  v === null ? null : typeof v === 'string' && v.trim() ? clip(v, 120) : v === true ? word : undefined

// Before a call runs: the activity line, and the call counted toward its task.
export const beforeCall = (b: Board, tool: string, input: In, at: number, agentId?: string): Board => {
  const act = activityOf(tool, input, at)
  const cur = TASK_TOOLS.has(tool) ? undefined : currentOf(b, agentId)
  return {
    ...b,
    // The task tools themselves leave the line on the last real tool.
    activity: agentId || TASK_TOOLS.has(tool) ? b.activity : act,
    tasks: cur ? b.tasks.map(t => (t.id === cur.id ? { ...t, tools: t.tools + 1, prop: act.prop } : t)) : b.tasks,
  }
}

export type Ran = { result?: unknown; text?: string; isError?: boolean }

// After a call: the task tools change the list; any other call adds its token
// estimate to its task (and its error line, if it failed).
export const afterCall = (b: Board, tool: string, input: In, ran: Ran, at: number, agentId?: string): Board => {
  const res = (ran.result ?? {}) as Record<string, unknown>
  if (!TASK_TOOLS.has(tool)) {
    const cur = currentOf(b, agentId)
    if (!cur) return b
    const tokens = estimateTokens(input, ran.text)
    const err = ran.isError ? clip(str(ran.text).split('\n')[0] ?? '', 80) : undefined
    return { ...b, tasks: b.tasks.map(t => (t.id === cur.id ? { ...t, tokens: t.tokens + tokens, ...(err ? { lastError: err } : {}) } : t)) }
  }
  if (ran.isError) return b

  if (tool === 'TaskCreate') {
    const task = (res.task ?? {}) as Record<string, unknown>
    const id = str(task.id)
    if (!id) return b
    // A new list after a finished one: start the board over.
    const kept = b.doneAt !== null ? [] : b.tasks.filter(t => t.id !== id)
    const t: Task = { ...newTask(id, str(task.subject) || str(input.subject), 'task', agentId), ...(str(input.activeForm) ? { activeForm: str(input.activeForm) } : {}) }
    return settle({ ...b, tasks: [...kept, t], doneAt: null }, at)
  }

  if (tool === 'TaskUpdate') {
    const id = str(input.taskId) || str(res.taskId)
    if (!id || res.success === false) return b
    if (input.status === 'deleted') return settle({ ...b, tasks: b.tasks.filter(t => t.id !== id) }, at)
    const meta = (input.metadata ?? {}) as Record<string, unknown>
    const tasks = b.tasks.map(t => {
      if (t.id !== id) return t
      let n: Task = { ...t }
      if (str(input.subject)) n.subject = str(input.subject)
      if (str(input.activeForm)) n.activeForm = str(input.activeForm)
      if (Array.isArray(input.addBlockedBy)) n.blockedBy = [...new Set([...n.blockedBy, ...input.addBlockedBy.map(String)])]
      const failed = note(meta.failed ?? meta.error, 'failed')
      if (failed === null) delete n.failed
      else if (failed !== undefined) n.failed = failed
      const blocked = note(meta.blocked, 'blocked')
      if (blocked === null) delete n.blocked
      else if (blocked !== undefined) n.blocked = blocked
      if (isStatus(input.status)) {
        if (input.status === 'in_progress') {
          delete n.failed
          delete n.blocked
        }
        n = moved(n, input.status, at)
      }
      return n
    })
    // Tasks that this one now blocks.
    const blocks = Array.isArray(input.addBlocks) ? input.addBlocks.map(String) : []
    const linked = blocks.length ? tasks.map(t => (blocks.includes(t.id) ? { ...t, blockedBy: [...new Set([...t.blockedBy, id])] } : t)) : tasks
    return settle({ ...b, tasks: linked }, at)
  }

  if (tool === 'TaskList') {
    const list = Array.isArray(res.tasks) ? (res.tasks as Record<string, unknown>[]) : null
    if (!list) return b
    const others = b.tasks.filter(t => t.source !== 'task')
    const tasks = list.map(r => {
      const id = str(r.id)
      const old = b.tasks.find(t => t.id === id) ?? newTask(id, str(r.subject), 'task')
      const n: Task = { ...old, subject: str(r.subject) || old.subject, blockedBy: Array.isArray(r.blockedBy) ? r.blockedBy.map(String) : old.blockedBy }
      return isStatus(r.status) ? moved(n, r.status, at) : n
    })
    return settle({ ...b, tasks: [...others, ...tasks] }, at)
  }

  if (tool === 'TodoWrite') {
    const todos = (Array.isArray(res.newTodos) ? res.newTodos : Array.isArray(input.todos) ? input.todos : null) as Record<string, unknown>[] | null
    if (!todos) return b
    // Each loop has its own todo list: this one replaces only its own.
    const mine = (t: Task) => t.source === 'todo' && t.agentId === agentId
    const others = b.tasks.filter(t => !mine(t))
    const tasks = todos.map((td, i) => {
      const subject = str(td.content)
      const id = `todo-${agentId ?? 'main'}-${i + 1}`
      const old = b.tasks.find(t => mine(t) && t.subject === subject) ?? newTask(id, subject, 'todo', agentId)
      const n: Task = { ...old, id, ...(str(td.activeForm) ? { activeForm: str(td.activeForm) } : {}) }
      return isStatus(td.status) ? moved(n, td.status, at) : n
    })
    return settle({ ...b, tasks: [...others, ...tasks] }, at)
  }
  return b
}

// "2m 10s", "45s", "1h 05m".
export const fmtSpan = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

// "840", "8.4k", "1.2M".
export const fmtTokens = (n: number): string =>
  n < 1000 ? String(n) : n < 1_000_000 ? `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k` : `${(n / 1_000_000).toFixed(1)}M`

// A text bar: "████░░░░".
export const textBar = (pct: number, w: number): string => {
  const f = Math.max(0, Math.min(w, Math.round((pct / 100) * w)))
  return '█'.repeat(f) + '░'.repeat(w - f)
}

// The timeline: each started task's span on one axis, from the first start to now.
export type Span = { id: string; state: TaskState; from: number; to: number }
export const timelineOf = (b: Board, now: number): { start: number; end: number; spans: Span[] } => {
  const started = b.tasks.filter(t => t.startedAt !== undefined)
  const start = Math.min(...started.map(t => t.startedAt ?? now), now)
  const ends = started.map(t => t.endedAt ?? now)
  const end = Math.max(start + 1000, now, ...ends)
  return {
    start,
    end,
    spans: b.tasks.map(t => ({ id: t.id, state: stateOf(t, b.tasks), from: t.startedAt ?? -1, to: t.startedAt === undefined ? -1 : (t.endedAt ?? now) })),
  }
}

// One text row of the timeline: "  ███████    " in `w` cells.
export const textSpan = (s: Span, start: number, end: number, w: number): string => {
  if (s.from < 0) return '·'.repeat(w)
  const k = w / Math.max(1, end - start)
  const a = Math.min(w - 1, Math.floor((s.from - start) * k))
  const z = Math.max(a + 1, Math.min(w, Math.ceil((s.to - start) * k)))
  const ch = s.state === 'completed' ? '█' : s.state === 'failed' || s.state === 'blocked' ? '▒' : '▓'
  return ' '.repeat(a) + ch.repeat(z - a) + ' '.repeat(w - z)
}
