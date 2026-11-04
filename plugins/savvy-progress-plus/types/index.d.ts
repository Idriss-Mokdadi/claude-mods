export type Phase = 'plan' | 'design' | 'delegate' | 'review' | 'close'

export type PlannedTask = {
  title: string
  tier: string
  after: number[]
}

/** What the band counts: a savvy-flow report, the session's task list, or a batch of subagents. */
export type FlowKind = 'flow' | 'tasks' | 'agents'

export type Flow = {
  title: string
  total: number
  done: number
  running: number
  phase: Phase
  isFinished: boolean
  tasks: PlannedTask[]
  kind?: FlowKind
}

export type AgentStatus = 'running' | 'done' | 'failed'

/** How much reasoning the task looks like it needs, from its type, description and brief length. */
export type Complexity = 'simple' | 'normal' | 'complex'

export type AgentRun = {
  id: string
  agentId?: string
  type: string
  description: string
  model: string
  effort?: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  contextTokens: number
  contextMax: number
  tokens: number
  costUsd: number
  steps: number
  round: number
  /** Self-reported by the worker through the `step` tool. */
  stepDone?: number
  stepTotal?: number
  stepNote?: string
  complexity?: Complexity
  isOverBudget?: boolean
  /** The batch it started in: the band counts the current batch's runs. */
  batch?: number
}

/** One entry of the session's task list (TaskCreate / TaskUpdate). */
export type TaskItem = {
  id: string
  subject: string
  status: 'pending' | 'in_progress' | 'completed'
}

export type Panel = {
  isCompact: boolean
  isDoneCollapsed: boolean
  autoOpenedFor: string
  /** The band source the person dismissed with ✕ (task list or subagent batch). */
  dismissed?: string
}

declare module 'claude-code' {
  interface PluginState {
    'savvy-progress-plus': {
      flow: Flow | null
      agents: AgentRun[]
      panel: Panel
      now: number
      tasks: TaskItem[]
      /** The current batch of subagents: a spawn while none runs starts the next one. */
      batch: number
    }
  }
}
