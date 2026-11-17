// taskboard's state contract.

// What the task tools store: the model's own status words.
export type TaskStatus = 'pending' | 'in_progress' | 'completed'
// What a row shows: the status, or failed / blocked when the task says so.
export type TaskState = TaskStatus | 'failed' | 'blocked'
// The prop a working crab holds: the kind of tool it uses right now.
export type Prop = 'wrench' | 'magnifier' | 'terminal' | 'antenna' | 'think'
// What the activity line says, before the target.
export type Verb = 'read' | 'edit' | 'write' | 'run' | 'search' | 'find' | 'web' | 'fetch' | 'agent' | 'mcp' | 'plan' | 'other'

export type Task = {
  id: string
  subject: string
  activeForm?: string
  status: TaskStatus
  // Set by metadata { failed | error: "why" }: an angry red crab and the reason.
  failed?: string
  // Set by metadata { blocked: "why" }.
  blocked?: string
  blockedBy: string[]
  startedAt?: number
  endedAt?: number
  // Tool calls made while this task was in progress, and their estimated tokens.
  tools: number
  tokens: number
  prop?: Prop
  // The last tool error while it ran, one short line.
  lastError?: string
  // The subagent that created it; absent for the main session.
  agentId?: string
  source: 'task' | 'todo'
}

export type Activity = { verb: Verb; target: string; prop: Prop; tool: string; at: number }

export type Board = {
  tasks: Task[]
  activity: Activity | null
  // When every task was done, for the dance; null while work is left.
  doneAt: number | null
}

declare module 'claude-code' {
  interface PluginState {
    taskboard: { board: Shaped<Board>; now: number }
  }
}
