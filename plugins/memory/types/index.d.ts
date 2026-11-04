export type Scope = 'project' | 'user'

/** A rule waiting for the owner's answer. Nothing is written while it waits. */
export type Proposal = {
  id: string
  text: string
  isEditing: boolean
}

/** A Remove press waiting for its confirmation. */
export type PendingRemove = { scope: Scope; text: string }

/** What the band says after an answer, until the next proposal. */
export type Notice = { text: string; isError: boolean }

export type Saved = { project: string[]; user: string[] }

declare module 'claude-code' {
  interface PluginState {
    memory: {
      pending: Shaped<Proposal | null>
      paused: boolean
      saved: Shaped<Saved>
      removing: Shaped<PendingRemove | null>
      notice: Shaped<Notice | null>
      skipped: Shaped<string[]>
      isProposing: boolean
    }
  }
}
