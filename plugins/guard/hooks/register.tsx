// guard: a danger guard and a secret guard on tool calls, and checkpoints of
// every file Claude edits, with /undo and a /checkpoints timeline. Hooks only:
// no model call, no network, no process.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ToolCallResult } from 'claude-code'

import type { Blocked, Checkpoint, Confirm, FileMeta, GuardKind, Restored } from '../types'
import { checkCommand, dialectOf, parseAllow, type Finding } from './danger'
import { findSecrets, pathAllowed, type SecretHit } from './secrets'
import { crabSvg, crabText, crabWidth, type Mood } from './crab'
import { STRINGS, fill, langOf, type Lang, type Strings } from './i18n'
import { baseName, clip, clockOf, fingerprint, isBinaryText, joinPath, lineDelta, resolveFrom, shQuote, shortPath } from './lib'

const PANE = 'guard-checkpoints'

const blocked = atom({ plugin: 'guard', key: 'blocked' } as const, null)
const restored = atom({ plugin: 'guard', key: 'restored' } as const, null)
const allowOnce = atom({ plugin: 'guard', key: 'allowOnce' } as const, [])
const checkpoints = atom({ plugin: 'guard', key: 'checkpoints' } as const, [])
const nextId = atom({ plugin: 'guard', key: 'nextId' } as const, 1)
const confirming = atom({ plugin: 'guard', key: 'confirm' } as const, null)

// ---------------------------------------------------------------------------
// Settings

type Opts = {
  dangerGuard: boolean
  secretGuard: boolean
  checkpoints: boolean
  allow: string[]
  secretAllowPaths: string[]
  maxFiles: number
  maxFileKB: number
  maxCheckpoints: number
  maxSnapshotFiles: number
  language: string
}

const num = (v: unknown, d: number, lo: number, hi: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d

export function readOpts(o: Record<string, unknown>): Opts {
  return {
    dangerGuard: o.dangerGuard !== false,
    secretGuard: o.secretGuard !== false,
    checkpoints: o.checkpoints !== false,
    allow: parseAllow(typeof o.allowList === 'string' ? o.allowList : ''),
    secretAllowPaths: parseAllow(typeof o.secretAllowPaths === 'string' ? o.secretAllowPaths : ''),
    maxFiles: num(o.maxFiles, 20, 1, 10_000),
    maxFileKB: num(o.maxFileKB, 512, 1, 4096),
    maxCheckpoints: num(o.maxCheckpoints, 100, 1, 1000),
    maxSnapshotFiles: num(o.maxSnapshotFiles, 200, 1, 5000),
    language: typeof o.language === 'string' ? o.language : 'auto',
  }
}

let opts: Opts = readOpts({})
let lang: Lang = 'en'
const tr = (): Strings => STRINGS[lang]
const isRtl = (): boolean => lang === 'ar'

async function detectLang($: EngineInterface): Promise<Lang> {
  const fixed = langOf(opts.language)
  if (fixed) return fixed
  try {
    const s = (await $.settings.read()) as Record<string, unknown>
    const l = langOf(s.language)
    if (l) return l
  } catch {
    // No settings: fall through.
  }
  try {
    return langOf((await $.env.get('LC_ALL')) || (await $.env.get('LANG')) || '') ?? 'en'
  } catch {
    return 'en'
  }
}

// ---------------------------------------------------------------------------
// Judging a call

const SHELLS = new Set(['Bash', 'PowerShell'])
const WRITERS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const WATCHED = /^(Bash|PowerShell|Write|Edit|MultiEdit|NotebookEdit)$/

type In = Record<string, unknown>
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export type Verdict = {
  kind: GuardKind
  rules: string[]
  // Shown to the person and the model; never a secret's value.
  label: string
  ask: string
  deny: string
  // Files a destructive command names, for a checkpoint.
  paths: string[]
}

// The text a call writes or runs, and where it goes.
function payload(tool: string, input: In): { text: string; path?: string; isCommand: boolean } {
  if (SHELLS.has(tool)) return { text: str(input.command), isCommand: true }
  if (tool === 'Write') return { text: str(input.content), path: str(input.file_path), isCommand: false }
  if (tool === 'Edit') return { text: str(input.new_string), path: str(input.file_path), isCommand: false }
  if (tool === 'MultiEdit') {
    const edits = Array.isArray(input.edits) ? (input.edits as In[]) : []
    return { text: edits.map(x => str(x.new_string)).join('\n'), path: str(input.file_path), isCommand: false }
  }
  if (tool === 'NotebookEdit') return { text: str(input.new_source), path: str(input.notebook_path), isCommand: false }
  return { text: '', isCommand: false }
}

// What identifies a call for "Allow once": the fields that change what it does.
export function signature(tool: string, input: In): string {
  const keep: Record<string, readonly string[]> = {
    Bash: ['command'],
    PowerShell: ['command'],
    Write: ['file_path', 'content'],
    Edit: ['file_path', 'old_string', 'new_string', 'replace_all'],
    MultiEdit: ['file_path', 'edits'],
    NotebookEdit: ['notebook_path', 'cell_id', 'new_source', 'edit_mode', 'cell_type'],
  }
  const parts = (keep[tool] ?? Object.keys(input).sort()).map(k => `${k}=${JSON.stringify(input[k] ?? null)}`)
  return fingerprint(`${tool}\u0000${parts.join('\u0000')}`)
}

const kindsOf = (hits: SecretHit[]): string[] => [...new Set(hits.map(h => h.kind))]

export function judge(tool: string, input: In, root = ''): Verdict | null {
  const s = tr()
  const p = payload(tool, input)
  if (opts.secretGuard && p.text && !pathAllowed(p.path, opts.secretAllowPaths)) {
    const hits = findSecrets(p.text, p.path, p.isCommand)
    if (hits.length > 0) {
      const kinds = kindsOf(hits)
      const what = kinds.map(k => s[k as keyof Strings] ?? k).join(', ')
      const lines = [...new Set(hits.map(h => h.line))].slice(0, 3).join(', ')
      // A path is left-to-right text: isolate it inside right-to-left Arabic.
      const file = isRtl() ? `\u2066${shortPath(p.path ?? '', root)}\u2069` : shortPath(p.path ?? '', root)
      const where = `${p.isCommand ? s.inCommand : file}${s.comma}${fill(s.line, { n: lines })}`
      return {
        kind: 'secret',
        rules: kinds,
        label: fill(s.bandSecret, { what, where }),
        ask: fill(s.askSecret, { what, where }),
        deny: fill(s.denySecret, { what, where }),
        paths: [],
      }
    }
  }
  if (opts.dangerGuard && SHELLS.has(tool) && p.text) {
    const found: Finding[] = checkCommand(p.text, dialectOf(tool), { maxFiles: opts.maxFiles, allow: opts.allow })
    if (found.length > 0) {
      const rules = [...new Set(found.map(f => f.rule))]
      const what = rules.map(r => s[r as keyof Strings] ?? r).join(', ')
      const cmd = clip(found[0]?.text ?? p.text, 120)
      return {
        kind: 'danger',
        rules,
        label: `${fill(s.bandDanger, { what })} · ${cmd}`,
        ask: `${fill(s.askDanger, { what })}\n${cmd}`,
        deny: fill(s.denyDanger, { what }),
        paths: [...new Set(found.flatMap(f => f.paths))],
      }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Checkpoints: one JSON file per change in .claude/checkpoints/<session>/,
// written in ring slots so the folder never holds more than maxCheckpoints.

type Stored = { path: string; existed: boolean; content?: string }
type SnapshotFile = { id: number; label: string; files: Stored[] }

let dirCache: string | null = null

async function cpDir($: EngineInterface): Promise<string> {
  if (dirCache) return dirCache
  const root = await $.session.root()
  let sid = 'session'
  try {
    sid = (await $.session.id()).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'session'
  } catch {
    // keep the default
  }
  const base = joinPath(root, '.claude/checkpoints')
  try {
    if (!(await $.fs.exists(joinPath(base, '.gitignore')))) await $.fs.write(joinPath(base, '.gitignore'), '# guard checkpoints: local only\n*\n')
  } catch {
    // the snapshot write below reports a failure
  }
  dirCache = joinPath(base, sid)
  return dirCache
}

async function readText($: EngineInterface, path: string): Promise<string | null> {
  try {
    const st = await $.fs.stat(path)
    if (st.kind !== 'file') return null
    return (await $.fs.read(path)) as string
  } catch {
    return null
  }
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__', '.next', 'dist', 'build', 'target', '.cache', '.claude'])

// Files under a folder, breadth first, at most `cap`.
async function walk($: EngineInterface, dir: string, cap: number): Promise<{ files: string[]; isCut: boolean }> {
  const files: string[] = []
  const queue = [dir]
  while (queue.length > 0) {
    const d = queue.shift() as string
    let entries: { name: string; kind: string; isLink?: boolean }[] = []
    try {
      entries = await $.fs.list(d)
    } catch {
      continue
    }
    for (const en of entries) {
      if (en.isLink) continue
      const p = joinPath(d, en.name)
      if (en.kind === 'file') files.push(p)
      else if (en.kind === 'dir' && !SKIP_DIRS.has(en.name)) queue.push(p)
      if (files.length >= cap) return { files, isCut: true }
    }
  }
  return { files, isCut: false }
}

export type Snap = { cp: Checkpoint; contents: (string | null)[] }

async function snapshot($: EngineInterface, kind: Checkpoint['kind'], tool: string, label: string, paths: string[], of?: number): Promise<Snap | null> {
  const root = await $.session.root()
  const cap = opts.maxSnapshotFiles
  const totalCap = Math.max(opts.maxFileKB * 1024 * 8, 4 * 1024 * 1024)
  const metas: FileMeta[] = []
  const stored: Stored[] = []
  const contents: (string | null)[] = []
  let total = 0
  const list: string[] = []
  let isCut = false
  for (const p of paths) {
    const abs = resolveFrom(root, p)
    let st: { kind: string; size: number } | undefined
    try {
      st = await $.fs.stat(abs)
    } catch {
      st = undefined
    }
    if (st?.kind === 'dir') {
      const w = await walk($, abs, cap - list.length)
      list.push(...w.files)
      isCut ||= w.isCut
    } else list.push(abs)
    if (list.length >= cap) {
      isCut = true
      break
    }
  }
  for (const abs of list.slice(0, cap)) {
    let st: { kind: string; size: number } | undefined
    try {
      st = await $.fs.stat(abs)
    } catch {
      st = undefined
    }
    if (!st) {
      metas.push({ path: abs, existed: false })
      stored.push({ path: abs, existed: false })
      contents.push(null)
      continue
    }
    if (st.kind !== 'file') continue
    if (st.size > opts.maxFileKB * 1024 || total + st.size > totalCap) {
      metas.push({ path: abs, existed: true, skipped: 'size' })
      contents.push(null)
      continue
    }
    const text = await readText($, abs)
    if (text === null || isBinaryText(text)) {
      metas.push({ path: abs, existed: true, skipped: 'binary' })
      contents.push(null)
      continue
    }
    total += st.size
    metas.push({ path: abs, existed: true })
    stored.push({ path: abs, existed: true, content: text })
    contents.push(text)
  }
  if (isCut) metas.push({ path: '…', existed: true, skipped: 'cap' })
  if (metas.length === 0) return null
  let id = 0
  await update($, nextId, n => {
    id = n ?? 1
    return id + 1
  })
  const cp: Checkpoint = { id, slot: id % opts.maxCheckpoints, at: await $.clock.now(), tool, kind, label, files: metas, added: 0, removed: 0, ...(of !== undefined ? { of } : {}) }
  const body: SnapshotFile = { id, label, files: stored }
  await $.fs.write(joinPath(await cpDir($), `${cp.slot}.json`), JSON.stringify(body))
  const keep = opts.maxCheckpoints
  await update($, checkpoints, list => [...(list ?? []), cp].filter(c => c.id > id - keep).sort((a, b) => a.id - b.id))
  return { cp, contents }
}

const patchCp = ($: EngineInterface, id: number, change: Partial<Checkpoint>) =>
  update($, checkpoints, list => (list ?? []).map(c => (c.id === id ? { ...c, ...change } : c)))

const dropCp = ($: EngineInterface, id: number) => update($, checkpoints, list => (list ?? []).filter(c => c.id !== id))

async function loadSnapshot($: EngineInterface, cp: Checkpoint): Promise<SnapshotFile | null> {
  try {
    const raw = (await $.fs.read(joinPath(await cpDir($), `${cp.slot}.json`))) as string
    const v = JSON.parse(raw) as SnapshotFile
    return v && v.id === cp.id && Array.isArray(v.files) ? v : null
  } catch {
    return null
  }
}

// Deletes a file the change created: through the shell tool, so the person's
// permissions apply; emptied if that is refused.
async function removeFile($: EngineInterface, path: string): Promise<boolean> {
  try {
    const r = await $.tool.call({ tool: 'Bash', command: `rm -f -- ${shQuote(path)}`, description: 'guard: remove a file the restored change created' })
    if (!r.deny && !r.isError) return true
  } catch {
    // fall through
  }
  try {
    await $.fs.write(path, '')
  } catch {
    // nothing more to try
  }
  return false
}

export type RestoreOutcome = { ok: boolean; text: string; restoredId?: number; undoId?: number | null }

async function restore($: EngineInterface, id: number, fileIndex: number | null, markUndone = true): Promise<RestoreOutcome> {
  const s = tr()
  const list = await read($, checkpoints)
  const cp = list.find(c => c.id === id)
  const data = cp ? await loadSnapshot($, cp) : null
  if (!cp || !data) return { ok: false, text: fill(s.notFound, { id }) }
  const metas = fileIndex === null ? cp.files : cp.files.slice(fileIndex, fileIndex + 1)
  const targets = metas.filter(m => m.path !== '…')
  // The restore is a change too: snapshot what is there now, so it can be undone.
  const pre = await snapshot($, 'restore', 'guard', fill(s.restoreOf, { id }), targets.map(m => m.path), id).catch(() => null)
  let done = 0
  let skipped = 0
  const notes: string[] = []
  for (const m of targets) {
    const f = data.files.find(x => x.path === m.path)
    if (m.skipped || !f) {
      skipped++
      continue
    }
    try {
      if (f.existed) {
        await $.fs.write(f.path, f.content ?? '')
        done++
      } else if (await $.fs.exists(f.path)) {
        if (await removeFile($, f.path)) done++
        else notes.push(fill(s.notDeleted, { file: baseName(f.path) }))
      } else done++
    } catch {
      skipped++
    }
  }
  if (pre) {
    const before = pre.contents
    let added = 0
    let removed = 0
    for (let k = 0; k < pre.cp.files.length; k++) {
      const meta = pre.cp.files[k] as FileMeta
      const d = lineDelta(before[k] ?? null, await readText($, meta.path))
      added += d.added
      removed += d.removed
    }
    await patchCp($, pre.cp.id, { added, removed })
  }
  if (markUndone && fileIndex === null) await patchCp($, id, { undone: true })
  const r: Restored = { id, files: done, skipped, undoId: pre?.cp.id ?? null, at: await $.clock.now() }
  await update($, restored, () => r)
  await update($, confirming, () => null)
  const text = [fill(s.restored, { n: done, id }), skipped > 0 ? fill(s.restoredSkipped, { n: skipped }) : '', ...notes].filter(Boolean).join(' ')
  $.ui.toast(text)
  return { ok: true, text, restoredId: id, undoId: r.undoId }
}

async function undoLast($: EngineInterface): Promise<string> {
  const s = tr()
  const list = await read($, checkpoints)
  const target = [...list].reverse().find(c => c.kind !== 'restore' && !c.undone)
  if (!target) return s.nothingToUndo
  const out = await restore($, target.id, null)
  if (!out.ok) return out.text
  const r = await read($, restored)
  return fill(s.undid, { id: target.id, label: target.label, n: r?.files ?? 0, undo: out.undoId ?? '?' })
}

// Checkpoints before every edit: the file as it was, or "did not exist".
async function beforeEdit($: EngineInterface, tool: string, input: In, run: () => Promise<ToolCallResult>): Promise<ToolCallResult> {
  const path = str(input.file_path) || str(input.notebook_path)
  if (!opts.checkpoints || !path || input._host) return run()
  let snap: Snap | null = null
  try {
    snap = await snapshot($, 'change', tool, baseName(path), [path])
  } catch {
    snap = null
  }
  const r = await run()
  if (snap) {
    try {
      if (r.isError || r.deny) await dropCp($, snap.cp.id)
      else {
        const meta = snap.cp.files[0]
        const d = lineDelta(snap.contents[0] ?? null, await readText($, meta?.path ?? path))
        await patchCp($, snap.cp.id, d)
      }
    } catch {
      // the counts stay at zero
    }
  }
  return r
}

// ---------------------------------------------------------------------------
// The hooks

export const register: Register = (on, options) => {
  opts = readOpts((options ?? {}) as Record<string, unknown>)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await detectLang($)
    dirCache = null
    await $.command.register({ name: 'undo-edit', description: 'guard: restore the files of the last change Claude made (it is checkpointed, so it can be undone too)' })
    await $.command.register({ name: 'checkpoints', description: 'guard: show or hide the checkpoints timeline, with Restore buttons per change and per file' })
    return started
  })

  // Danger and secret guard: ask the person through the engine, or, when
  // nobody can be asked, refuse and show the band with Allow once.
  on('tool.check', { tool: WATCHED }, async ($, e, next) => {
    const tool = String(e.tool)
    const input = (e.input ?? {}) as In
    let v: Verdict | null = null
    try {
      v = judge(tool, input, await $.session.root())
    } catch {
      v = null
    }
    if (!v) return next(e)
    const below = await next(e)
    if (below.decision === 'deny') return below
    if (e.tool_use_id === undefined) return { decision: 'ask', reason: v.ask }
    const fp = signature(tool, input)
    const once = await read($, allowOnce)
    const isAllowed = once.includes(fp)
    if (isAllowed) await update($, allowOnce, list => (list ?? []).filter(x => x !== fp))
    if (isAllowed || e.approver) {
      if (v.kind === 'danger' && opts.checkpoints && v.paths.length > 0 && !input._host) {
        try {
          await snapshot($, 'bash', tool, clip(str(input.command), 80), v.paths)
        } catch {
          // a checkpoint that fails never blocks the command
        }
      }
      if (isAllowed) return below
      $.ui.toast(fill(tr().asked, { what: v.label }))
      return { decision: 'ask', reason: v.ask }
    }
    const b: Blocked = { fp, tool, kind: v.kind, rules: v.rules, label: v.label, at: await $.clock.now() }
    await update($, blocked, () => b)
    return { decision: 'deny', reason: v.deny }
  }).catch(() => ({ decision: 'deny', reason: 'guard could not check this call; it was refused to be safe.' }))

  on('tool.run', { tool: 'Edit' }, ($, e, next) => beforeEdit($, 'Edit', e as unknown as In, () => next(e))).catch(($, e, next) => next(e))
  on('tool.run', { tool: 'Write' }, ($, e, next) => beforeEdit($, 'Write', e as unknown as In, () => next(e))).catch(($, e, next) => next(e))
  on('tool.run', { tool: 'NotebookEdit' }, ($, e, next) => beforeEdit($, 'NotebookEdit', e as unknown as In, () => next(e))).catch(($, e, next) => next(e))

  on('command.run', { command: 'undo-edit' }, async $ => ({ text: await undoLast($) }))
  on('command.run', { command: 'checkpoints' }, async $ => {
    if ((await $.ui.panes()).some(p => p.id === PANE)) {
      await $.ui.close({ id: PANE })
      return { text: tr().closed }
    }
    await $.ui.open({ id: PANE, title: tr().pane })
    return { text: tr().opened }
  })

  // The band: only while a call is blocked or right after a restore.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const b = await read($, blocked)
    const r = await read($, restored)
    if (!b && !r) return next(e)
    const ui = $.ui.resolve(e) as unknown as UI
    const { Box } = ui
    const isSvg = e.surface !== 'terminal' && 'Svg' in ui
    const narrow = e.props.bodyColumns < 70
    return (
      <Box key="guard-band" flexDirection="column" alignItems={isRtl() ? 'flex-end' : undefined}>
        {b ? blockedRow(ui, $, b, isSvg, narrow) : null}
        {r ? restoredRow(ui, $, r, isSvg, narrow) : null}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => drawPane($, e as unknown as PaneEl))
}

// ---------------------------------------------------------------------------
// Drawing

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type El = any
type UI = { Box: El; Text: El; Button: El; Svg?: El }
type PaneEl = { surface: string; props: { bodyColumns: number }; viewport?: { rows?: number } }

const crabEl = (ui: UI, mood: Mood, isSvg: boolean, px = 22) => {
  const { Svg, Text } = ui
  if (isSvg && Svg) return <Svg source={crabSvg(mood, px, isRtl())} alt={`crab: ${mood}`} width={crabWidth(px)} height={px} />
  return <Text color={mood === 'angry' || mood === 'lock' ? 'red' : undefined}>{crabText(mood)}</Text>
}

function blockedRow(ui: UI, $: EngineInterface, b: Blocked, isSvg: boolean, narrow: boolean) {
  const s = tr()
  const { Box, Text, Button } = ui
  const allow = async () => {
    await update($, allowOnce, list => [...(list ?? []).filter(x => x !== b.fp), b.fp].slice(-20))
    await update($, blocked, () => null)
    $.ui.toast(s.allowed)
    try {
      await $.prompt.submit({ text: s.retry })
    } catch {
      // the person can ask Claude to retry
    }
  }
  const keep = async () => {
    await update($, blocked, () => null)
    $.ui.toast(s.keptBlocked)
  }
  return (
    <Box key="guard-blocked" flexDirection={narrow ? 'column' : 'row'} gap={1}>
      <Box flexDirection="row" gap={1} flexShrink={1}>
        <Box flexShrink={0}>{crabEl(ui, b.kind === 'secret' ? 'lock' : 'angry', isSvg)}</Box>
        <Text color="red" bold>
          {isSvg ? '' : '🛑 '}
          {b.label}
        </Text>
      </Box>
      <Box flexDirection="row" gap={1} flexShrink={0}>
        <Button key="guard-allow" label={s.allowOnce} onPress={allow} />
        <Button key="guard-keep" label={s.keepBlocked} variant="primary" onPress={keep} />
      </Box>
    </Box>
  )
}

function restoredRow(ui: UI, $: EngineInterface, r: Restored, isSvg: boolean, narrow: boolean) {
  const s = tr()
  const { Box, Text, Button } = ui
  const undo = async () => {
    if (r.undoId !== null) {
      await restore($, r.undoId, null, true)
      await patchCp($, r.id, { undone: false })
    }
    await update($, restored, () => null)
  }
  return (
    <Box key="guard-restored" flexDirection={narrow ? 'column' : 'row'} gap={1}>
      <Box flexDirection="row" gap={1} flexShrink={1}>
        <Box flexShrink={0}>{crabEl(ui, 'happy', isSvg)}</Box>
        <Text color="green">
          {isSvg ? '' : '↩ '}
          {fill(s.bandRestored, { n: r.files, id: r.id })}
          {r.skipped > 0 ? ` · ${fill(s.restoredSkipped, { n: r.skipped })}` : ''}
        </Text>
      </Box>
      <Box flexDirection="row" gap={1} flexShrink={0}>
        {r.undoId !== null ? <Button key="guard-undo-restore" label={s.undoRestore} onPress={undo} /> : null}
        <Button key="guard-dismiss" label={s.dismiss} role="dismiss" onPress={() => update($, restored, () => null)} />
      </Box>
    </Box>
  )
}

const moodOf = (c: Checkpoint): Mood => (c.kind === 'restore' ? 'happy' : c.kind === 'bash' ? 'sweat' : 'shield')

const skipText = (s: Strings, f: FileMeta): string =>
  f.skipped === 'size' ? s.skippedSize : f.skipped === 'binary' ? s.skippedBinary : f.skipped === 'cap' ? s.skippedCap : !f.existed ? s.newFile : ''

async function drawPane($: EngineInterface, e: PaneEl) {
  const s = tr()
  const ui = $.ui.resolve(e as never) as unknown as UI
  const { Box, Text, Button } = ui
  const isSvg = e.surface !== 'terminal' && 'Svg' in ui
  const list = [...(await read($, checkpoints))].reverse()
  const ask: Confirm | null = await read($, confirming)
  const root = await $.session.root().catch(() => '')
  const cols = Math.max(20, e.props.bodyColumns)
  const room = Math.max(3, Math.floor(((e.viewport?.rows ?? 40) - 4) / 2))
  const askCp = ask ? list.find(c => c.id === ask.id) : undefined
  const askText = askCp
    ? ask?.file === null || ask?.file === undefined
      ? fill(s.confirmAll, { n: askCp.files.filter(f => f.path !== '…').length, id: askCp.id })
      : fill(s.confirmFile, { file: baseName(askCp.files[ask.file]?.path ?? ''), id: askCp.id })
    : ''
  return (
    <Box flexDirection="column" alignItems={isRtl() ? 'flex-end' : undefined}>
      <Box flexDirection="row" gap={1}>
        {crabEl(ui, 'shield', isSvg, 26)}
        <Text bold>{list.length === 0 ? s.pane : fill(s.paneHead, { n: list.length })}</Text>
      </Box>
      {askCp ? (
        <Box key="guard-confirm" flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text color="yellow">{askText}</Text>
          <Box flexDirection="row" gap={1}>
            <Button key="guard-confirm-yes" label={s.confirm} variant="primary" onPress={() => restore($, askCp.id, ask?.file ?? null)} />
            <Button key="guard-confirm-no" label={s.cancel} onPress={() => update($, confirming, () => null)} />
          </Box>
        </Box>
      ) : null}
      {list.length === 0 ? <Text dimColor>{s.none}</Text> : null}
      {list.slice(0, room).map(c => {
        const real = c.files.filter(f => f.path !== '…')
        const one = real.length === 1 ? shortPath(real[0]?.path ?? '', root) : fill(s.files, { n: real.length })
        const what = c.kind === 'restore' ? `↩ ${c.label} · ${one}` : real.length === 1 ? one : `${c.label} · ${one}`
        const tool = c.kind === 'restore' ? '' : `${c.tool} `
        const stat = c.kind === 'bash' ? '' : ` +${c.added} −${c.removed}`
        const head = clip(`#${c.id} ${clockOf(c.at)} ${tool}${what}${stat}${c.undone ? ` (${s.undone})` : ''}`, cols - 14)
        return (
          <Box key={`cp-${c.id}`} flexDirection="column">
            <Box flexDirection="row" gap={1}>
              <Box flexShrink={0}>{crabEl(ui, moodOf(c), isSvg, 22)}</Box>
              <Text dimColor={c.undone === true}>{isRtl() ? `\u2066${head}\u2069` : head}</Text>
              <Button key={`guard-r-${c.id}`} label={s.restore} onPress={() => update($, confirming, () => ({ id: c.id, file: null }))} />
            </Box>
            {real.length > 1 || real.some(f => f.skipped || !f.existed)
              ? c.files.map((f, k) => (
                  <Box key={`cpf-${c.id}-${k}`} flexDirection="row" gap={1} paddingLeft={4}>
                    <Text dimColor>{clip(`${f.path === '…' ? '…' : shortPath(f.path, root)}${skipText(s, f) ? ` · ${skipText(s, f)}` : ''}`, cols - 22)}</Text>
                    {real.length > 1 && f.path !== '…' && !f.skipped ? (
                      <Button key={`guard-rf-${c.id}-${k}`} label={s.restoreFile} plain onPress={() => update($, confirming, () => ({ id: c.id, file: k }))} />
                    ) : null}
                  </Box>
                ))
              : null}
          </Box>
        )
      })}
    </Box>
  )
}
