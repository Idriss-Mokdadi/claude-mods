// guard's $.state contract.

export type GuardKind = 'danger' | 'secret'

// A call the guard refused while nobody could be asked: the band shows it.
export type Blocked = {
  // Hash of the tool and its input: "Allow once" lets exactly this call pass.
  fp: string
  tool: string
  kind: GuardKind
  // Rule or secret kind ids (danger.ts Rule, secrets.ts SecretKind).
  rules: string[]
  // What to show: the command for a danger (never when it holds a secret),
  // the file and line for a secret. Never a secret's value.
  label: string
  at: number
}

export type FileMeta = {
  path: string
  existed: boolean
  // Why the content was not saved: too big, binary, or a folder walk cut short.
  skipped?: 'size' | 'binary' | 'cap'
}

export type Checkpoint = {
  id: number
  // Ring slot of the snapshot file: .claude/checkpoints/<session>/<slot>.json
  slot: number
  at: number
  tool: string
  // change: before an edit; bash: before a destructive command; restore: before a restore.
  kind: 'change' | 'bash' | 'restore'
  // What it was for (a file name, a command, "restore #3"). Never a secret.
  label: string
  files: FileMeta[]
  added: number
  removed: number
  // Set once /undo or a restore put this change back.
  undone?: boolean
  // For a restore: the checkpoint it restored.
  of?: number
}

export type Restored = { id: number; files: number; skipped: number; undoId: number | null; at: number }

export type Confirm = { id: number; file: number | null }

declare module 'claude-code' {
  interface PluginState {
    guard: {
      blocked: Blocked | null
      restored: Restored | null
      allowOnce: string[]
      checkpoints: Checkpoint[]
      nextId: number
      confirm: Confirm | null
    }
  }
}
