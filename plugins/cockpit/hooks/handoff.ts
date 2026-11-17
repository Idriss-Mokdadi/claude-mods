// The side-chat handoff: one `$.model.fork` over the session's own cached
// transcript writes a handoff a new chat can start from. Nothing here touches
// `$`; register.tsx runs the fork and draws the pane.

import { priceOf } from './lib'

// The fork's prompt. `file` is where Save will write the note, so the opening
// prompt it writes can name it.
export const handoffPrompt = (file: string): string => `You are writing a HANDOFF for a brand-new chat that must continue this work without re-reading this conversation. You have no tools; answer directly, in Markdown, with these headings in this order and no filler:

## Goal and scope
## Owner's preferences and constraints
(everything the person asked for about style, language, tools, limits, what to avoid)
## Decisions made and why
## Current state
(what works, what does not, what was verified and how)
## Files created or changed
(every file, with its path and its role, one line each)
## Commands
(build, test, run, deploy steps exactly as used here)
## Open bugs and risks
## Next steps
(exact, numbered, in order)
## Opening prompt
A ready-to-paste first message for the next chat, in a fenced block, starting with: "Read ${file}, then"

Be complete and concrete: paths, names, numbers, commands. Never invent anything that is not in this conversation.`

// The opening prompt the note ends with: the fenced block under its heading,
// else the heading's text, else a default that names the file.
export function openingPromptOf(note: string, file: string): string {
  const at = note.search(/^#{1,3}\s*Opening prompt\s*$/im)
  if (at >= 0) {
    const rest = note.slice(at).replace(/^#{1,3}[^\n]*\n/, '')
    const fenced = /```[^\n]*\n([\s\S]*?)```/.exec(rest)
    const body = (fenced?.[1] ?? rest.split(/\n#{1,3}\s/)[0] ?? '').trim()
    if (body) return body
  }
  return `Read ${file}, then continue the work from its "Next steps".`
}

// What a fork that cannot read the cache costs, roughly: the whole context
// written to the cache at the model's write price, and a long answer.
export function coldEstimateUsd(model: string, contextTokens: number, answerTokens = 4000): number {
  const [, output, , write] = priceOf(model || 'opus', contextTokens)
  return (contextTokens * write + answerTokens * output) / 1e6
}

export type ForkFailure = 'nothing-to-fork' | 'api-error' | 'empty-reply' | 'aborted'

// A failed fork in plain words.
export function failureText(reason: ForkFailure, extra: { status?: number | null; error?: string } = {}): string {
  if (reason === 'nothing-to-fork') return 'Nothing to hand off yet: the chat has no finished turn.'
  if (reason === 'empty-reply') return 'The model answered with no text. Try again.'
  if (reason === 'aborted') return 'The handoff was interrupted before it finished.'
  return `The API returned an error${extra.status ? ` (${extra.status}${extra.error ? `, ${extra.error}` : ''})` : extra.error ? ` (${extra.error})` : ''}. Try again in a moment.`
}
