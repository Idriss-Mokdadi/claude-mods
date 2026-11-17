# claude-mods

Personal Claude Code mods by Mohamed Idriss Mokdadi. Private repo, personal use.

| Mod | What it does | Main command |
|---|---|---|
| cockpit | Usage band and panel (limits, cost, context by category, per-tool estimate), model and effort advisor, budget guard, handoff notes, cache idle timer | `/usage-panel`, `/handoff` |
| savvy-progress-plus | Progress bar for multi-step work and a panel of subagents with model, effort fit, cost and budget warnings (fork of JohnnyVizz/claude-kit savvy-progress, MIT) | `/crew` |
| workspace | Read-only file tree pane with marks on files Claude read, edited or created | `/tree` |
| memory | Spots preferences in your prompts (EN/FR/AR) and asks before saving each one to `CLAUDE.md` | `/memory-list`, `/memory-hold`, `/memory-resume` |
| launcher | Mode buttons, EN/FR/AR, shortcuts to the other mods, glossary side panel (EN/FR/AR, no duplicates) | `/modes`, `/glossary` |
| taskboard | One crab per task (sleeping, working with the tool it uses, done, failed), live activity line, mini timeline, time and estimated tokens per task | `/taskboard` (or `/tasks`) |
| companion | Animated Lagoon in the left sidebar (5-hour bands, 7-day shells, cache sun/moon and sleeping crabs, one jellyfish per subagent, sandcastle tasks), mood crab, done alerts, celebrations | `/lagoon on\|off\|toggle` |

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
/plugin install launcher@claude-mods
/plugin install taskboard@claude-mods
/plugin install companion@claude-mods
```

Run `/reload-plugins` or start a new session to load them. Private repo: the machine needs GitHub access to it (`gh auth login` locally; in a cloud session, select this repo for the session).

Each mod's own README lists its settings and limits. Rules for building mods here: `CONVENTIONS.md`.
