# claude-mods

Personal Claude Code mods by Mohamed Idriss Mokdadi. Private repo, personal use.

| Mod | What it does | Main command |
|---|---|---|
| cockpit | Usage band and panel (limits, cost, context by category, per-tool estimate), model and effort advisor, budget guard, handoff notes, cache idle timer | `/usage-panel`, `/handoff` |
| savvy-progress-plus | Progress bar for multi-step work and a panel of subagents with model, effort fit, cost and budget warnings (fork of JohnnyVizz/claude-kit savvy-progress, MIT) | `/crew` |
| workspace | Read-only file tree pane with marks on files Claude read, edited or created | `/tree` |
| memory | Spots preferences in your prompts (EN/FR/AR) and asks before saving each one to `CLAUDE.md` | `/memory-list`, `/memory-hold`, `/memory-resume` |

## Install

Type each line at the Claude Code prompt (answer `y` to add the marketplace, then pick a scope):

```
/plugin install cockpit --marketplace Idriss-Mokdadi/claude-mods
/plugin install savvy-progress-plus --marketplace Idriss-Mokdadi/claude-mods
/plugin install workspace --marketplace Idriss-Mokdadi/claude-mods
/plugin install memory --marketplace Idriss-Mokdadi/claude-mods
```

Each mod's own README lists its settings and limits. Rules for building mods here: `CONVENTIONS.md`.
