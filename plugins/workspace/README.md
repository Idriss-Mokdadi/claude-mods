# workspace

A read-only file tree pane beside the chat. It lists the session's working directory and marks the files Claude read, edited or created in this session, live.

## Install

```
/plugin marketplace add Idriss-Mokdadi/claude-mods
/plugin install workspace@claude-mods
```

## What it does

- **Tree**: the working directory, folders first, folders open and close on a press. Skips `.git`, `node_modules`, dotfiles (unless `showHidden`) and what the root `.gitignore` lists.
- **Marks**: `R` read, `E` edited, `+` created, from `Read`, `Edit`, `Write`, `NotebookEdit` and simple `Bash` commands (`cat f`, `> f`, `touch f`, `cp a b`, `sed -i … f`). A folder holding marked files shows `•`.
- **Changed filter**: one press lists only the files touched this session, including files outside the folder.
- **Click a file**: `Mention in prompt` inserts `@path` into the prompt box; `Copy path` copies it. Where the box cannot take text (some app surfaces), Mention copies `@path` instead and says so.
- **Refresh**: after tool calls that change files, at most once every 5 s, plus a `Refresh` button. Only open folders are listed again. No polling.
- **Header**: a pixel crab holding a map; it walks while the tree refreshes (still under `prefers-reduced-motion`).
- **Surfaces**: desktop and mobile draw the crab as SVG; the terminal gets the same tree as indented text rows.

It never opens, writes, moves or deletes a file, and uses no network and no processes.

## Commands

| Command | Does |
| --- | --- |
| `/tree` | Opens or closes the Files pane |

The band above the prompt (terminal and desktop) has a small `Files` button that does the same.

Pane keys while focused: `r` refresh, `c` changed filter, `m` mention, `y` copy.

## Settings

Set them in `/config` (or `pluginConfigs.workspace.options` in settings).

| Setting | Default | Meaning |
| --- | --- | --- |
| `language` | `en` | `en`, `fr` or `ar` (Arabic, right to left) |
| `maxDepth` | `8` | Deepest folder level that opens (1 to 32) |
| `maxEntries` | `3000` | Most files and folders listed in all (50 to 20000) |
| `showHidden` | `false` | List dotfiles (`.git` is always skipped) |
| `showBand` | `true` | Show the `Files` button above the prompt |

## Limits

- Only the root `.gitignore` is read; nested `.gitignore` files and `!` negations are ignored.
- `Bash` marks only clear paths: commands with variables, globs, `$(…)` or here-documents are skipped.
- A file changed outside Claude's tool calls shows up after the next refresh or a press of `Refresh`.
- The band above the prompt exists on the terminal and desktop only; on mobile use `/tree`.
- At most 600 rows are drawn at once; the rest is counted.

## Development

```
claude plugin validate plugins/workspace
claude plugin test plugins/workspace
tsc -p plugins/workspace   # once the engine has laid .claude-plugin/types
```

MIT License. Crab art: see `THIRD_PARTY_NOTICES.md`.
