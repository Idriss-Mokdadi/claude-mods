/** How Claude touched a file this session; `created` outranks `edited`, which outranks `read`. */
export type WorkspaceMark = 'read' | 'edited' | 'created'

/** One entry of a listed folder. */
export type WorkspaceEntry = { name: string; isDir: boolean }

/** The tree as last listed: each listed folder by its path relative to `root` ('' is the root). */
export type WorkspaceTree = {
  root: string
  dirs: Record<string, WorkspaceEntry[]>
  count: number
  isTruncated: boolean
  at: number
}

/** What the person chose in the pane. */
export type WorkspaceView = {
  expanded: string[]
  selected: string | null
  isChangedOnly: boolean
}

declare module 'claude-code' {
  interface PluginState {
    workspace: {
      tree: Shaped<WorkspaceTree | null>
      marks: Shaped<Record<string, WorkspaceMark>>
      view: Shaped<WorkspaceView>
      isWalking: boolean
      isOpen: boolean
    }
  }
}
