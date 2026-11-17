# Mod catalog: what exists and what we can build

Searched: Anthropic plugin directory, 2026-11-17. Licenses are not listed in the directory; check each repo before installing. "Privileged" means the plugin can change Claude settings or run hooks on your machine: audit it first (the `agent-supply-chain-audit` skill does this).

## 1. Best next mod: Taskboard (your request)

Shows what Claude is working on, live, in the same crab style as cockpit.

- **Band (collapsed):** working crab + current task + bar `3/7 tasks · 43%` + "Tasks" button.
- **Pane (expanded):** one row per task:
  - pending: sleeping crab, grey bar
  - in progress: crab holding the tool it uses now (wrench = Edit, magnifier = Read/Grep, terminal = Bash, antenna = web), animated bar, elapsed time
  - done: happy crab with a check, green bar, time taken
  - failed or blocked: angry red crab, error line
- **Live activity line:** "Reading parser.py", "Running tests", "Editing api.ts" from tool calls.
- **Timeline chart:** horizontal bars per task (start to end), like a mini Gantt.
- **Per-task cost estimate:** tokens and tool calls per task.
- **Celebration:** crab dance and optional sound when all tasks are done.
- **Data source:** the task tools (TaskCreate/TaskUpdate) and tool calls. Zero extra tokens.
- **Overlap:** savvy-progress-plus already draws a task-list bar. Plan: Taskboard owns tasks, `/crew` keeps subagents only.

## 2. Existing plugins worth a look (fit your setup)

| Plugin | Publisher | What it does | Fit / note |
|---|---|---|---|
| theme-examples | Anthropic | 20 animated backdrops behind the chat in the desktop app, frosted panels, fireworks | Good base for a crab theme; read and copy its code |
| session-report | Anthropic | Explorable HTML report of past sessions: tokens, cache, subagents, skills, costly prompts | Complements cockpit (history, not live) |
| notif-sound | community, privileged | Sound when Claude finishes, asks, or waits for permission | Useful if you switch windows |
| sounds | community, privileged | Event sounds with themes | Same idea, theme store |
| Simple Progress Bars | community, privileged | Progress bar with time estimate for long scripts Claude runs | Good for data/ML scripts |
| claude-todo-mirror | community, privileged | Mirrors the task list to a markdown file | Taskboard covers this visually |
| Multi-repo Diff | community, privileged | `/multi-diff`: diff viewer, uncommitted / staged / since this session | Useful for reviewing Claude's changes |
| Session Recall | community, privileged | Search past sessions, gives the quote and a resume command | Handy for "what did we decide" |
| session-recharge | community, privileged | Saves key decisions before compaction, re-injects after | Pairs with cockpit's Compact button |
| claude-context-optimizer | community, privileged | Read dedup, file digests, `.contextignore`, prompt coach, cost view | Overlaps cockpit partly; read-dedup idea is good |
| Mission | community | Long tasks split into milestones with validation gates | For big projects (PFA) |
| Persona | community | Expert personas, run one as a subagent | Optional |
| Smart Commits | community | Commit messages from staged diff | Git helper |
| Dev Loop | community | `/fix`, `/commit`, `/ship` flow with review pause | Git helper |
| opencode subagents | community, remote | Runs subagents on cheaper non-Claude models | Cost saver, but data leaves to another provider |

**Skip (overlap with your mods):** Desktop Statusline, Token Status Line, craft/rich statuslines, claude-usage-statusline, token-usage (cockpit covers them); Memory Bank, claude-memory, memory-toolkit, Cowork Memory, Memex, Active Memory (memory + `/handoff` cover them); WezTerm Agent Cards (terminal only).

## 3. Mods we can build (all zero-token unless noted)

### See what Claude does
1. **Taskboard**: section 1.
2. **Activity feed**: every tool call as a crab row: tool, file, duration, success or failure, size of output.
3. **Changes pane**: files changed this session with +/− line bars, "view diff" and "undo file" buttons.
4. **Test band**: detects test runs and shows pass/fail counts with crab moods, red crab on a new failure.
5. **Git band**: branch, uncommitted files, ahead/behind, Commit button.

### Spend fewer tokens
6. **Read guard**: warns when Claude re-reads a large file that did not change.
7. **Big output guard**: warns or trims when a command prints a huge output into the context.
8. **Usage history**: daily and weekly charts across sessions (cockpit stores the numbers).
9. **Paste coach**: before sending a long paste, offers to trim it or attach the file instead.

### Stay safe
10. **Danger guard**: asks before `rm -rf`, force push, `git reset --hard`, deleting many files.
11. **Secret guard**: blocks writing API keys or tokens into files or commands.
12. **Checkpoints**: snapshot of files before each edit, `/undo` to roll back the last change.
13. **FOSS license guard**: shows the license on each install command, flags non-FOSS.

### Work faster, your way
14. **Modes bar**: buttons STUDY · TECH · DEEP · SHORT · RESEARCH that add your mode tag to the prompt, plus the language (EN/FR/AR).
15. **Prompt library**: save prompts and insert them with `/p name` or a button.
16. **Quick actions**: buttons "explain", "write tests", "review diff", "commit".
17. **Glossary pane**: collects technical terms with EN/FR/AR translations; flashcards on demand.
18. **Focus timer**: Pomodoro or deadline countdown band (hackathons, exams) with a crab that sleeps on breaks.
19. **Done alerts**: crab chirp sound and toast when Claude finishes or waits for permission.

### Look and feel
20. **Crab theme**: animated backdrop (ocean, pixel waves) using the theme-examples approach.
21. **Celebrations**: crab dance or fireworks when tests pass, a commit lands, or all tasks finish.
22. **Mood crab companion**: one crab in the band that reacts to everything (busy, waiting, error, done).

## 4. Suggested order
1. Taskboard (asked for) — 3 to 4 h
2. Danger guard + Secret guard (one "guard" mod) — 2 to 3 h
3. Modes bar + Prompt library (one "prompts" mod) — 2 h
4. Changes pane + Checkpoints (one "changes" mod) — 3 to 4 h
5. Done alerts + Celebrations — 1 to 2 h
