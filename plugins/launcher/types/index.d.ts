// One glossary term, as parsed from the assistant's STUDY lines.
export type Term = {
  // The English term, as first written.
  en: string
  fr: string
  ar: string
  // The one-line explanation; '' when none was given.
  note: string
  // Order first seen in this chat, from 0.
  seen: number
}

export type Order = 'az' | 'seen'

declare module 'claude-code' {
  interface PluginState {
    launcher: {
      // Band collapsed to a single Modes button.
      collapsed: boolean
      // Sticky tags (modes and a language), added to every prompt sent.
      sticky: string[]
      // Shortcut commands found installed (names without the slash).
      installed: string[]
      terms: Shaped<Term[]>
      query: string
      order: Order
    }
  }
}
