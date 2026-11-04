# cockpit

A usage cockpit for Claude Code: one band above the prompt and one panel that show what the session costs and how close it is to its limits, plus a free model/effort advisor, a budget guard, a `/handoff` command and a prompt-cache idle timer. A pixel crab shows the mood: calm, sweating at the warning level, alarm at the critical level, packing a suitcase during a handoff, holding a gauge for the advisor.

## Install

```
/plugin install cockpit --marketplace Idriss-Mokdadi/claude-mods
```

## What it shows

**Band above the prompt** (desktop and mobile: SVG; terminal: text):
`crab · ctx 42% · 5h 30% · 2h 13m · 7d 12% · $1.23 · cache 3:12/5:00 · try sonnet · medium ● a bit high` and a **Usage** button.

**Usage panel** (`/usage-panel`, or the Usage button):
- 5-hour and 7-day limits with reset times (subscription only).
- Session cost, context fill, keep-alive and handoff costs.
- Context by category from `$.session.usage({ breakdown: "full" })`: system prompt, tools, MCP tools (by server), skills, memory files, messages, free space.
- An **estimate** of tokens per tool, skill and subagent, from the transcript (about 4 characters per token).

## Features

1. **Model and effort advisor.** On each prompt, keyword and length rules (no model call, zero tokens) suggest Haiku/low (short, factual, "short/quick/brief"), Sonnet/medium (normal coding or writing) or Opus/high ("think deeply", architecture, multi-step debugging, long pasted documents). The dot compares the suggestion with the active effort: green fits, yellow one level off, red two or more. The prompt text is never changed. A **Switch** button runs `/model` and `/effort` for you; if that fails, a toast gives the commands.
2. **Budget guard.** Watches context fill and the 5h/7d limits. At the warning level (70%): toast and yellow band. At the critical level (85%): toast, red band, **Compact now** (`$.session.compact()`) and **Handoff** buttons.
3. **`/handoff`.** One Haiku call at low effort over the transcript writes `handoff/HANDOFF-<date-time>.md` (goal, decisions, open problems, next steps, files touched) in the working directory, then tells you to start a new session with `read handoff/<file>`. If the call fails, a basic note is written from the transcript instead.
4. **Cache idle timer.** Time since the last turn against the prompt-cache TTL. Optional keep-alive (off by default).

## Commands

| Command | Does |
| --- | --- |
| `/usage-panel` | Opens or closes the panel (`/usage-panel open` only opens it). |
| `/handoff` | Writes the handoff note. |

## Settings (`/config`)

| Setting | Default | Meaning |
| --- | --- | --- |
| `warnPercent` | 70 | Warning level, percent. |
| `criticalPercent` | 85 | Critical level, percent. |
| `advisor` | true | Show the model/effort advisor. |
| `cacheTtl` | auto | `auto`, `5m` or `1h`. |
| `keepAlive` | false | Ping the cache before it expires. |
| `keepAliveMaxPings` | 3 | Most pings between two of your turns. |
| `language` | auto | `en`, `fr` or `ar` (right to left). |

## Limits

- **Attribution is an estimate.** It counts characters in tool inputs and results that the main thread saw; a subagent's own context is not included.
- **TTL detection.** The engine reports the TTL only on a model switch. Before that, `auto` guesses 1 h on a subscription (rate limits reported) and 5 min otherwise, shown with a `?`.
- **Keep-alive** uses `$.model.fork` with no effort named and a "reply ok" prompt. It reads the main thread's cached prefix, which refreshes that cache entry. Each ping costs about one cache read of the whole context (shown in the band as `≈$x/ping`; for Opus 5.5 at 100k tokens about $0.02). The timer resets only when the ping's usage shows a cache read. A named low effort is avoided on purpose: on models without per-message effort it would write a second cache entry of the whole conversation.
- **Effort** is read from the turn's model requests and from classic hook inputs; before the first turn it is unknown unless `CLAUDE_EFFORT` or `CLAUDE_CODE_EFFORT_LEVEL` is set.
- **Switch** depends on `/model` and `/effort` being available; a model switch drops the prompt cache.
- **Compact now** works only while Claude is idle.
- The full context breakdown sends token-count requests, as `/context` does; it runs only when the panel opens or you press Refresh.
- No network calls of its own, no processes. `/handoff` is the only file it writes.
