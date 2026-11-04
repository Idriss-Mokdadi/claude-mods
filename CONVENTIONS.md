# Conventions for every mod in this repo

Each mod is built by its own agent on its own branch. Follow these rules so the mods merge cleanly.

## Layout

- One folder per mod: `plugins/<mod-name>/`.
- Inside it: `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx`, `types/index.d.ts` (when `$.state` is used), `README.md`, and `*.test.ts(x)` tests.
- Touch nothing outside your own `plugins/<mod-name>/` folder. The root `README.md` and `.claude-plugin/marketplace.json` are written by the coordinating session when it merges.
- Work on the branch `mod/<mod-name>` only. Never push to `main`.

## Identity

- `plugin.json` author: `{ "name": "Mohamed Idriss Mokdadi", "url": "https://github.com/Idriss-Mokdadi" }`, `"license": "MIT"`, version `0.1.0` (savvy-progress-plus: `2.0.0`).
- Code or art copied from JohnnyVizz/claude-kit (MIT): keep its copyright line in `plugins/<mod-name>/THIRD_PARTY_NOTICES.md`:
  `MIT License — Copyright (c) 2026 johnnyvizz — https://github.com/JohnnyVizz/claude-kit`

## Shared look: the crabs

- Reuse the pixel crab characters and their per-tier props from `plugins/savvy-progress/hooks/register.tsx` in https://github.com/JohnnyVizz/claude-kit (public, clone it read-only to `/home/user/johnnyvizz/claude-kit`).
- Copy the drawing code you need into your own mod (no cross-mod imports). Keep `prefers-reduced-motion` support.
- Desktop and mobile draw SVG; the terminal gets the same content as text rows. Test `e.surface` like savvy-progress does.
- The owner uses these crabs for personal, private use only. Do not publish them anywhere else.

## Surfaces and language

- The owner mostly follows sessions from the Claude desktop and mobile apps; the terminal must still work.
- UI text: English by default. Add French (`fr`) and Arabic (`ar`, right to left) when the mod has a `language` setting.

## Safety

- No `$.http` and no network calls.
- No `$.process` unless the mod's spec says so.
- Never write a file without the owner's explicit approval in the UI, except where the spec says otherwise (`/handoff` writes its own note when the owner runs it).
- No secrets, tokens, hostnames or personal data in code or tests.

## Done means

1. `claude plugin validate plugins/<mod-name>` passes.
2. The mod type-checks (`tsc -p plugins/<mod-name>` once its types are laid, or the tsconfig from the types header).
3. `claude plugin test plugins/<mod-name>` passes, with tests for the main behaviours.
4. `plugins/<mod-name>/README.md`: what it does, commands, settings, limits, install line:
   `/plugin marketplace add Idriss-Mokdadi/claude-mods` then `/plugin install <mod-name>@claude-mods`
5. Committed and pushed to `mod/<mod-name>`.
