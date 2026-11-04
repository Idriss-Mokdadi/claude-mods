# claude-mods

Personal Claude Code mods by Mohamed Idriss Mokdadi. Private repo, personal use.

| Mod | What it does | Main command |
|---|---|---|
| cockpit | Usage band and panel (limits, cost, context by category, per-tool estimate), model and effort advisor, budget guard, handoff notes, cache idle timer | `/usage-panel`, `/handoff` |
| savvy-progress-plus | Progress bar for multi-step work and a panel of subagents with model, effort fit, cost and budget warnings (fork of JohnnyVizz/claude-kit savvy-progress, MIT) | `/crew` |
| workspace | Read-only file tree pane with marks on files Claude read, edited or created | `/tree` |
| memory | Spots preferences in your prompts (EN/FR/AR) and asks before saving each one to `CLAUDE.md` | `/memory-list`, `/memory-hold`, `/memory-resume` |

## Install

First add this repo as a marketplace (once per machine or cloud environment):

```
/plugin marketplace add Idriss-Mokdadi/claude-mods
```

Then install each mod:

```
/plugin install cockpit@claude-mods
/plugin install savvy-progress-plus@claude-mods
/plugin install workspace@claude-mods
/plugin install memory@claude-mods
```

Run `/reload-plugins` or start a new session to load them. Private repo: the machine needs GitHub access to it (`gh auth login` locally; in a cloud session, select this repo for the session).

Each mod's own README lists its settings and limits. Rules for building mods here: `CONVENTIONS.md`.
