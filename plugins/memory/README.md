# memory

Spots corrections and preferences in your prompts and **asks before every save**. Nothing is written to any file until you press Save.

## What it does

1. **Detect** (zero tokens). On each prompt, keyword rules in English, French and Arabic look for corrections and preferences: "no, use X", "always…", "never…", "I prefer…", "don't…", "remember that…", "from now on…", "toujours", "jamais", "je préfère", "n'utilise pas", "دائما", "أبدا", "أفضل", "لا تستخدم", "تذكر أن". Questions, slash commands and code blocks are ignored. The prompt is never changed.
2. **Ask.** A band above the prompt shows the rule as one short line, a crab holding a notebook, and four buttons: **Save to project**, **Save to user**, **Edit**, **Skip**. The band warns that the user-level file is lost when a cloud container ends, so project is the default (primary) choice.
3. **Write, only after Save.** The rule is appended as `- <rule>` under `## Preferences (memory mod)` in `CLAUDE.md` in the session directory (project) or in `~/.claude/CLAUDE.md` (user). The section is created when missing; the rest of the file is kept.
4. **Dedupe.** A rule already saved (case-insensitive, punctuation ignored, one containing the other, or 80% shared words) is not proposed again, and neither is one you skipped in this session.

## Commands

| Command | What it does |
| --- | --- |
| `/memory-list` | Pane with the saved project and user rules. Each has **Remove**, which asks for confirmation before writing. The waiting rule (if any) is shown with the same Save / Edit / Skip buttons. Also: Pause/Resume and **Propose from this turn**. |
| `/memory-hold` | Stop proposing rules. |
| `/memory-resume` | Propose rules again. |
| `/memory-edit <text>` | Change the wording of the waiting rule (or propose your own). Still waits for Save. |

**Propose from this turn** (in the pane) makes one cheap Haiku call on the last user message and reply to extract one rule. The result is only proposed; Save is still asked.

## Settings

- `language`: `auto` (default; follows Claude Code's `language` setting, then the locale), `en`, `fr`, `ar` (Arabic, drawn right to left).

## Limits

- The band is drawn on the terminal and desktop only (the engine raises `AbovePrompt` there). On mobile, open `/memory-list`: the pane shows the waiting rule with the same buttons. A toast also says when a rule is waiting.
- `/memory-pause` is a name Claude Code ships, so the pause command is `/memory-hold`.
- Detection is keyword based: it can miss rules phrased another way and can propose a rule you do not want. Skip costs nothing.
- One rule waits at a time; a newer detection replaces the waiting one.
- The project file is `CLAUDE.md` in the session's working directory, not the git root.
- User-level rules (`~/.claude/CLAUDE.md`) are lost when a cloud container ends.

## Install

```
/plugin install memory --marketplace Idriss-Mokdadi/claude-mods
```

## Development

```
claude plugin validate plugins/memory
tsc -p plugins/memory        # after the engine lays .claude-plugin/types/
claude plugin test plugins/memory
```

License: MIT. See `THIRD_PARTY_NOTICES.md`.
