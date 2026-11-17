// companion's $.state contract.

export type Act = 'read' | 'edit' | 'bash' | 'web'
export type AgentState = 'run' | 'done' | 'fail'

// The band's one word.
export type Mood = 'ready' | 'working' | 'reading' | 'editing' | 'running' | 'waiting' | 'error' | 'done' | 'sleeping' | 'dance'

// What the Lagoon and the band draw: derived from what companion heard.
export type View = {
  // 5-hour and 7-day limits, percent used, null until reported.
  h5: number | null
  d7: number | null
  // Water bands lit (5-hour) and shells lit (7-day), 0-10.
  bands: number
  shells: number
  // Daylight from the cache age, 1 fresh to 0 cold.
  light: number
  // Crabs asleep, 0-3; all three and night when cold.
  asleep: number
  cold: boolean
  // One jellyfish per subagent.
  agents: { id: string; state: AgentState }[]
  // Sandcastle levels (done tasks, up to 5) and the flag when all are done.
  castle: number
  flag: boolean
  act: Act | null
  confused: boolean
  angry: boolean
  critical: boolean
  compact: 'in' | 'out' | null
  handoff: boolean
  party: boolean
  mood: Mood
}

declare module 'claude-code' {
  interface PluginState {
    companion: {
      view: Shaped<View | null>
      themeOn: boolean
      soundOn: boolean
    }
  }
}
