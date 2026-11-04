# savvy-progress-plus

A Claude Code mod: a progress bar above the prompt for any multi-step work, and a live crew panel of subagents. Fork of [savvy-progress](https://github.com/JohnnyVizz/claude-kit/tree/main/plugins/savvy-progress) v1.2.1 (MIT, see `THIRD_PARTY_NOTICES.md`). Every name is its own, so it installs next to the original without clashes.

```
/plugin install savvy-progress-plus --marketplace Idriss-Mokdadi/claude-mods
```

## What it does

- **Progress bar** above the prompt, from the first source that applies:
  1. a savvy-flow report (`mcp__savvy-progress-plus__progress`): title, phase, accepted tasks out of planned;
  2. the session's task list (TaskCreate / TaskUpdate), from 2 tasks: completed out of total, titled with the task in progress;
  3. a batch of 2+ subagents (a spawn while none runs starts a new batch): finished out of started.
  `✕` clears a savvy flow; for a task list or a batch it hides that one until a new one starts.
- **Crew panel** (`/crew`): running, finished and planned subagents with model, effort, task progress, context, estimated cost and time. The header totals cost, tokens, time and agent count of all subagents.
- **Effort fit**: a dot before each agent's model. Green: the effort fits the task; yellow: one level off; red: two or more. Plain rules, zero extra tokens: agent type (Explore is simple, Plan complex, savvy tiers by tier), brief length (under 600 characters simple, over 3,000 and 8,000 harder) and words in the description (find/list/search vs design/refactor/debug/audit). The effort is the one the Agent call asked for or the turns report, else the model family's usual one.
- **Budget per subagent**: past the token or cost limit, the row turns red with "over budget", and one toast names the agent.
- **Crabs**: one pixel crab per tier with its prop (astronaut, detective, engineer, chef, racer, pirate); working crabs walk. `prefers-reduced-motion` stops every animation.
- **Surfaces**: desktop and mobile draw SVG; the terminal draws the same content as text rows. Under 380 px (a phone) the band puts the title on its own line and the panel stacks the totals two by two and the numbers under each agent.
- **Languages**: English, French, Russian, Hebrew and Arabic. Hebrew and Arabic are drawn right to left, crabs facing left.

## Commands

- `/crew`: show or hide the panel.
- `/crew open`: open it, or bring it forward, without toggling.

## Tools it adds

- `mcp__savvy-progress-plus__progress`: the orchestrator reports the plan, phase and accepted tasks. A call from a subagent is ignored.
- `mcp__savvy-progress-plus__step`: a worker reports its own steps (`done`, `total`, `note`). Each `savvy-*` worker gets one line at the end of its brief asking for it.

## Settings

Set in `/config`, or in `~/.claude/settings.json` under `pluginConfigs`:

```json
{ "pluginConfigs": { "savvy-progress-plus": { "options": { "language": "fr", "budgetTokens": 200000, "budgetUsd": 2 } } } }
```

| Setting | Values | Default |
| --- | --- | --- |
| `language` | `auto`, `en`, `fr`, `ru`, `he`, `ar`. `auto` follows Claude Code's `language` setting, then the system locale | `auto` |
| `autoOpen` | `savvy`: open the panel when a savvy worker starts or a plan is reported; `any`: also once for any subagent | `savvy` |
| `budgetTokens` | tokens per subagent; `0` is off | `0` |
| `budgetUsd` | estimated USD per subagent; `0` is off | `0` |

## Limits

- **No stop button.** The plugin API's `$.agent` has `spawn`, `list` and `register`, but no way to stop one agent. Over budget, the mod warns only; stop the agent yourself, for example by asking Claude to stop it with TaskStop (background agents).
- Cost is an estimate from token counts and a built-in price table (`PRICES` in `hooks/register.tsx`, list prices as of 2026-10-10), not a bill. Cache writes are priced at the 1-hour rate.
- The effort-fit dot is a heuristic. It reads the brief's length and the description's words, not the work itself.
- The task list is followed from the moment the mod loads; tasks created before that are not counted.
- The original savvy-flow skill names `mcp__savvy-progress__progress`. With only this fork installed, tell the skill (or the model) to use `mcp__savvy-progress-plus__progress` instead; the task-list and subagent bars need no tool at all.
- No network calls, no processes, no file writes.

## Tests

```
claude plugin validate plugins/savvy-progress-plus
claude plugin test plugins/savvy-progress-plus
```
