import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { WorkspaceEntry, WorkspaceMark, WorkspaceTree, WorkspaceView } from '../types'
import {
  ALWAYS_SKIP,
  bashPaths,
  clamp,
  depthOf,
  isIgnored,
  isInside,
  keyOf,
  markedFolders,
  parseGitignore,
  sortEntries,
  strongest,
  visibleRows,
} from './lib'
import type { IgnoreRule } from './lib'

// ---------- state ----------

// The shape tags decline what an earlier version stored, which outlives a reload.
const tree = atom({ plugin: 'workspace', key: 'tree' } as const, null, { shape: 'tree-1' })
const marks = atom({ plugin: 'workspace', key: 'marks' } as const, {}, { shape: 'marks-1' })
const view = atom(
  { plugin: 'workspace', key: 'view' } as const,
  { expanded: [], selected: null, isChangedOnly: false },
  { shape: 'view-1' },
)
const isWalking = atom({ plugin: 'workspace', key: 'isWalking' } as const, false)
const isOpen = atom({ plugin: 'workspace', key: 'isOpen' } as const, false)

const PANE = 'workspace'
/** No automatic refresh more often than this. */
const MIN_REFRESH_MS = 5000
/** The crab walks at least this long, so a fast refresh is still seen. */
const WALK_MS = 1200
/** Rows drawn at most; the rest is counted. */
const ROW_LIMIT = 600

const COLOR: Record<WorkspaceMark, string> = { read: '#5B8DEF', edited: '#E0A030', created: '#3B9C5F' }
const GLYPH: Record<WorkspaceMark, string> = { read: 'R', edited: 'E', created: '+' }
const CLAY = '#D97757'
const INK = '#1F1E1D'

// ---------- language ----------

type Lang = 'en' | 'fr' | 'ar'

const STRINGS = {
  en: {
    pane: 'Files',
    title: 'Workspace',
    refresh: 'Refresh',
    changed: 'Changed',
    all: 'All files',
    mention: 'Mention in prompt',
    copy: 'Copy path',
    close: 'Close',
    empty: 'Empty folder',
    unreadable: 'Cannot read this folder',
    noChanges: 'Nothing read or changed this session yet.',
    listing: 'Listing…',
    refreshing: 'refreshing…',
    truncated: (n: number) => `List stopped at ${n} entries (maxEntries setting).`,
    more: (n: number) => `${n} more rows not drawn.`,
    tooDeep: 'too deep',
    outside: 'outside the folder',
    entries: (n: number) => `${n} entries`,
    changedCount: (n: number) => `${n} touched`,
    legend: 'R read · E edited · + created',
    mentioned: (p: string) => `Added @${p} to the prompt`,
    copied: (p: string) => `Copied ${p}`,
    copiedInstead: (p: string) => `The prompt box could not take it; copied ${p} instead`,
    notCopied: (p: string) => `Could not copy here. Path: ${p}`,
    opened: 'Files pane opened.',
    closed: 'Files pane closed.',
    waiting: 'Files pane is open; it shows when the window is wide enough or you open it.',
    bandOpen: 'Files',
    bandClose: 'Hide files',
    cmd: 'Toggle the file tree pane',
  },
  fr: {
    pane: 'Fichiers',
    title: 'Espace de travail',
    refresh: 'Actualiser',
    changed: 'Modifiés',
    all: 'Tous les fichiers',
    mention: 'Mentionner dans le prompt',
    copy: 'Copier le chemin',
    close: 'Fermer',
    empty: 'Dossier vide',
    unreadable: 'Lecture du dossier impossible',
    noChanges: 'Aucun fichier lu ou modifié pour l’instant.',
    listing: 'Lecture…',
    refreshing: 'actualisation…',
    truncated: (n: number) => `Liste arrêtée à ${n} entrées (réglage maxEntries).`,
    more: (n: number) => `${n} lignes de plus non affichées.`,
    tooDeep: 'trop profond',
    outside: 'hors du dossier',
    entries: (n: number) => `${n} entrées`,
    changedCount: (n: number) => `${n} touchés`,
    legend: 'R lu · E modifié · + créé',
    mentioned: (p: string) => `@${p} ajouté au prompt`,
    copied: (p: string) => `${p} copié`,
    copiedInstead: (p: string) => `Le prompt n’a pas pu le prendre ; ${p} copié à la place`,
    notCopied: (p: string) => `Copie impossible ici. Chemin : ${p}`,
    opened: 'Panneau Fichiers ouvert.',
    closed: 'Panneau Fichiers fermé.',
    waiting: 'Panneau Fichiers ouvert ; il s’affiche quand la fenêtre est assez large ou quand vous l’ouvrez.',
    bandOpen: 'Fichiers',
    bandClose: 'Masquer',
    cmd: 'Afficher ou masquer l’arborescence des fichiers',
  },
  ar: {
    pane: 'الملفات',
    title: 'مساحة العمل',
    refresh: 'تحديث',
    changed: 'المعدّلة',
    all: 'كل الملفات',
    mention: 'أشر إليه في الطلب',
    copy: 'انسخ المسار',
    close: 'إغلاق',
    empty: 'مجلد فارغ',
    unreadable: 'تعذّرت قراءة هذا المجلد',
    noChanges: 'لم تُقرأ أو تُعدَّل أي ملفات بعد.',
    listing: 'جارٍ العرض…',
    refreshing: 'جارٍ التحديث…',
    truncated: (n: number) => `توقفت القائمة عند ${n} عنصرًا (إعداد maxEntries).`,
    more: (n: number) => `${n} صفًا إضافيًا غير معروض.`,
    tooDeep: 'عميق جدًا',
    outside: 'خارج المجلد',
    entries: (n: number) => `${n} عنصرًا`,
    changedCount: (n: number) => `${n} ملفًا`,
    legend: 'R قُرئ · E عُدّل · + أُنشئ',
    mentioned: (p: string) => `أُضيف @${p} إلى الطلب`,
    copied: (p: string) => `نُسخ ${p}`,
    copiedInstead: (p: string) => `تعذّر وضعه في الطلب؛ نُسخ ${p} بدلًا من ذلك`,
    notCopied: (p: string) => `تعذّر النسخ هنا. المسار: ${p}`,
    opened: 'فُتحت لوحة الملفات.',
    closed: 'أُغلقت لوحة الملفات.',
    waiting: 'لوحة الملفات مفتوحة؛ تظهر عندما تتسع النافذة أو تفتحها.',
    bandOpen: 'الملفات',
    bandClose: 'إخفاء',
    cmd: 'إظهار أو إخفاء شجرة الملفات',
  },
} as const

// ---------- the crab with a map ----------

// Pixel Clawd as savvy-progress draws it (MIT, johnnyvizz/claude-kit): a 24×18 crab
// on a 30×28 grid. Its front claw is raised and holds a folded map.
type Fill = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void

const stamp = (f: Fill, x: number, y: number, rows: string[], map: Record<string, string>, cls?: string): void =>
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => map[ch] && f(x + dx, y + dy, 1, 1, map[ch] ?? '', cls)))

const crabBody = (f: Fill, armFront = 0, armCls?: string): void => {
  f(7, 10, 16, 12, CLAY)
  f(3, 14, 4, 4, CLAY)
  f(23, 14 + armFront, 4, 4, CLAY, armCls)
  f(9, 12, 2, 2, INK)
  f(19, 12, 2, 2, INK)
  f(7, 22, 2, 4, CLAY, 'la')
  f(17, 22, 2, 4, CLAY, 'la')
  f(11, 22, 2, 4, CLAY, 'lb')
  f(21, 22, 2, 4, CLAY, 'lb')
}

const MAP_ROWS = [
  'qqqqqqqqqqqq',
  'pppfpppfpppp',
  'prpfpppfpxpx',
  'pprfrppfppxp',
  'ppprfrrfpxpx',
  'pppfpppfrppp',
  'pppfpppfpppp',
  'qqqqqqqqqqqq',
]

const cartographer = (f: Fill): void => {
  crabBody(f, -4, 'map')
  stamp(f, 17, 2, MAP_ROWS, { p: '#EBD9A8', q: '#D4BC82', f: '#C9B27A', r: '#D0453F', x: '#B4312B' }, 'map')
}

const CRAB_CSS = `<style>
.t{fill:#1f1f1f}.s{fill:#6b6b68}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.s{fill:#a8a8a4}}
.run .la{animation:st .5s steps(1) infinite}.run .lb{animation:st .5s steps(1) infinite -.25s}
.run .bd{animation:bob .5s steps(1) infinite -.125s}
.run g{transform-box:fill-box}
.run .map{transform-origin:50% 100%;animation:peek 1s ease-in-out infinite}
.pace{animation:pace 2s ease-in-out infinite}
@keyframes st{50%{transform:translateY(-1px)}}@keyframes bob{50%{transform:translateY(1px)}}
@keyframes peek{50%{transform:rotate(-8deg)}}@keyframes pace{50%{transform:translateX(6px)}}
@media (prefers-reduced-motion: reduce){.run,.run g,.pace{animation:none!important}}
</style>`

const CRAB_SCALE = 1.1
const CRAB_BOX = 30

const crabSvg = (x: number, y: number, isWalk: boolean, mirror: boolean): string => {
  const groups = new Map<string, string[]>([['bd', []]])
  const f: Fill = (cx, cy, w, h, c, cls = 'bd') => {
    if (!groups.has(cls)) groups.set(cls, [])
    groups.get(cls)?.push(`<rect x="${cx}" y="${cy}" width="${w}" height="${h}" fill="${c}"/>`)
  }
  cartographer(f)
  const group = (cls: string) => `<g class="${cls}">${(groups.get(cls) ?? []).join('')}</g>`
  const body = `<g class="bd">${(groups.get('bd') ?? []).join('')}${group('map')}</g>`
  const s = CRAB_SCALE
  const place = mirror ? `translate(${x + CRAB_BOX * s},${y}) scale(${-s},${s})` : `translate(${x},${y}) scale(${s})`
  return `<g class="${isWalk ? 'pace' : ''}"><g transform="${place}" shape-rendering="crispEdges"><g class="${isWalk ? 'run' : ''}">${body}${group('la')}${group('lb')}</g></g></g>`
}

const xml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s)

const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"
export const HEADER_H = 40

/** The pane's header: the crab with its map, the folder's name and the counts. */
export const headerSvg = (W: number, title: string, sub: string, isWalk: boolean, isRtl: boolean): string => {
  const crabX = isRtl ? W - 8 - CRAB_BOX * CRAB_SCALE - 6 : 2
  const textX = isRtl ? W - 50 : 50
  const anchor = isRtl ? ' direction="rtl" text-anchor="start"' : ''
  const chars = Math.max(8, Math.floor((W - 60) / 7))
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HEADER_H}" viewBox="0 0 ${W} ${HEADER_H}">${CRAB_CSS}` +
    crabSvg(crabX, 4, isWalk, isRtl) +
    `<text class="t" x="${textX}" y="17" font-family="${FONT}" font-size="13" font-weight="600"${anchor}>${xml(clip(title, chars))}</text>` +
    `<text class="s" x="${textX}" y="33" font-family="${FONT}" font-size="11"${anchor}>${xml(clip(sub, chars + 6))}</text>` +
    `</svg>`
  )
}

// ---------- the module ----------

// Settings and session facts: set by `register`, read by the helpers below.
// Module variables are lost on a reload, which only resets the throttle.
let s: (typeof STRINGS)[Lang] = STRINGS.en
let isRtl = false
let maxDepth = 8
let maxEntries = 3000
let showHidden = false
let showBand = true
let root = ''
let rules: IgnoreRule[] = []
let lastRefresh = 0
let pending: { cancel: () => void } | null = null
let walkTimer: { cancel: () => void } | null = null
let isListing = false

const getRoot = async ($: EngineInterface): Promise<string> => {
  if (root === '') root = await $.session.cwd()
  return root
}

const absOf = (rel: string): string => (root === '/' ? `/${rel}` : rel === '' ? root : `${root}/${rel}`)

const keep = (dir: string, entry: { name: string; kind: string }): boolean => {
  if (ALWAYS_SKIP.has(entry.name)) return false
  if (!showHidden && entry.name.startsWith('.')) return false
  const rel = dir === '' ? entry.name : `${dir}/${entry.name}`
  return !isIgnored(rules, rel, entry.kind === 'dir')
}

/** Lists one folder, filtered and sorted; `undefined` when it cannot be read. */
const listDir = async ($: EngineInterface, dir: string): Promise<WorkspaceEntry[] | undefined> => {
  try {
    const raw = await $.fs.list(absOf(dir))
    return sortEntries(raw.filter(en => keep(dir, en)).map(en => ({ name: en.name, isDir: en.kind === 'dir' })))
  } catch {
    return undefined
  }
}

const startWalk = async ($: EngineInterface): Promise<void> => {
  walkTimer?.cancel()
  walkTimer = null
  await update($, isWalking, () => true)
}

const stopWalk = ($: EngineInterface): void => {
  walkTimer?.cancel()
  walkTimer = $.clock.after(WALK_MS, () => {
    walkTimer = null
    void update($, isWalking, () => false)
  })
}

/** Lists the root and every open folder, up to the entry cap. Read-only. */
const refresh = async ($: EngineInterface): Promise<void> => {
  if (isListing) return
  isListing = true
  pending?.cancel()
  pending = null
  try {
    await startWalk($)
    const cwd = await getRoot($)
    lastRefresh = await $.clock.now()
    try {
      rules = parseGitignore(await $.fs.read(`${cwd === '/' ? '' : cwd}/.gitignore`))
    } catch {
      rules = []
    }
    const v = await read($, view)
    const open = new Set(v.expanded)
    const dirs: Record<string, WorkspaceEntry[]> = {}
    let count = 0
    let isTruncated = false
    // Breadth-first over the open folders, so the top of the tree is listed first.
    const queue: string[] = ['']
    while (queue.length > 0) {
      const dir = queue.shift() as string
      const list = await listDir($, dir)
      if (list === undefined) continue
      const room = maxEntries - count
      if (list.length > room) isTruncated = true
      const kept = list.slice(0, Math.max(0, room))
      dirs[dir] = kept
      count += kept.length
      if (count >= maxEntries) {
        isTruncated = isTruncated || queue.length > 0
        break
      }
      for (const en of kept) {
        const rel = dir === '' ? en.name : `${dir}/${en.name}`
        if (en.isDir && open.has(rel) && depthOf(rel) < maxDepth) queue.push(rel)
      }
    }
    const at = await $.clock.now()
    const next: WorkspaceTree = { root: cwd, dirs, count, isTruncated, at }
    await update($, tree, () => next)
  } finally {
    isListing = false
    stopWalk($)
  }
}

/** A refresh now, or once 5 s have passed since the last one. */
const requestRefresh = async ($: EngineInterface): Promise<void> => {
  if (!(await read($, isOpen))) return
  const now = await $.clock.now()
  const wait = lastRefresh + MIN_REFRESH_MS - now
  if (wait <= 0) return refresh($)
  if (pending === null) {
    pending = $.clock.after(wait, () => {
      pending = null
      void refresh($)
    })
  }
}

/** Opens a folder the person clicked: lists it alone if it was never listed. */
const toggleFolder = async ($: EngineInterface, rel: string): Promise<void> => {
  let isNowOpen = false
  await update($, view, v => {
    const set = new Set(v.expanded)
    if (set.has(rel)) set.delete(rel)
    else set.add(rel)
    isNowOpen = set.has(rel)
    return { ...v, expanded: [...set].slice(-500), selected: null }
  })
  if (!isNowOpen) return
  const t = await read($, tree)
  if (t === null || t.dirs[rel] !== undefined) return
  await startWalk($)
  const list = await listDir($, rel)
  const room = Math.max(0, maxEntries - t.count)
  const kept = (list ?? []).slice(0, room)
  await update($, tree, prev =>
    prev === null
      ? prev
      : {
          ...prev,
          dirs: { ...prev.dirs, [rel]: kept },
          count: prev.count + kept.length,
          isTruncated: prev.isTruncated || (list?.length ?? 0) > room,
        },
  )
  stopWalk($)
}

const openPane = async ($: EngineInterface) => {
  await update($, isOpen, () => true)
  const opened = await $.ui.open({ id: PANE, title: s.pane })
  if ((await read($, tree)) === null) await refresh($)
  else await requestRefresh($)
  return opened
}

const closePane = async ($: EngineInterface): Promise<void> => {
  await $.ui.close({ id: PANE })
  await update($, isOpen, () => false)
}

const togglePane = async ($: EngineInterface): Promise<string> => {
  const isUp = (await $.ui.panes()).some(p => p.id === PANE)
  if (isUp) {
    await closePane($)
    return s.closed
  }
  const opened = await openPane($)
  return opened.isPlaced ? s.opened : s.waiting
}

const mark = async ($: EngineInterface, path: unknown, how: WorkspaceMark): Promise<void> => {
  if (typeof path !== 'string') return
  const key = keyOf(await getRoot($), path)
  if (key === undefined) return
  await update($, marks, m => {
    const prev = m[key]
    const nextMark = strongest(prev, how)
    if (prev === nextMark) return m
    const all = { ...m, [key]: nextMark }
    const keys = Object.keys(all)
    // Keep the record small in a very long session.
    if (keys.length > 5000) for (const k of keys.slice(0, keys.length - 5000)) delete all[k]
    return all
  })
}

const existsNow = async ($: EngineInterface, path: string): Promise<boolean> => {
  try {
    const cwd = await getRoot($)
    return await $.fs.exists(path.startsWith('/') ? path : `${cwd}/${path}`)
  } catch {
    return true
  }
}

const mention = async ($: EngineInterface, key: string, surface: Parameters<EngineInterface['ui']['copy']>[0]['surface']) => {
  const ref = /\s/.test(key) ? `@"${key}"` : `@${key}`
  let isFilled = false
  try {
    isFilled = (await $.prompt.fill({ text: `${ref} `, mode: 'insert' })).isFilled
  } catch {
    isFilled = false
  }
  if (isFilled) {
    $.ui.toast(s.mentioned(key))
    return
  }
  const copied = await $.ui.copy({ text: ref, surface }).catch(() => ({ isCopied: false }))
  $.ui.toast(copied.isCopied ? s.copiedInstead(key) : s.notCopied(key))
}

const copyPath = async ($: EngineInterface, key: string, surface: Parameters<EngineInterface['ui']['copy']>[0]['surface']) => {
  const copied = await $.ui.copy({ text: key, surface }).catch(() => ({ isCopied: false }))
  $.ui.toast(copied.isCopied ? s.copied(key) : s.notCopied(key))
}

export const register: Register = (on, options) => {
  const lang: Lang = options.language === 'fr' || options.language === 'ar' ? options.language : 'en'
  s = STRINGS[lang]
  isRtl = lang === 'ar'
  maxDepth = clamp(options.maxDepth, 1, 32, 8)
  maxEntries = clamp(options.maxEntries, 50, 20_000, 3000)
  showHidden = options.showHidden === true
  showBand = options.showBand !== false
  root = ''
  lastRefresh = 0
  pending = null
  walkTimer = null
  isListing = false

  // ---------- events ----------

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    root = started.cwd || e.cwd
    await $.command.register({ name: 'tree', description: s.cmd })
    // A reload keeps the pane open: list again so the new code's rules apply.
    if ((await $.ui.panes()).some(p => p.id === PANE)) {
      await update($, isOpen, () => true)
      void refresh($)
    }
    return started
  })

  on('command.run', { command: 'tree' }, async $ => ({ text: await togglePane($) }))

  on('ui.close', async ($, e, next) => {
    const done = await next(e)
    if (e.id === PANE) {
      pending?.cancel()
      pending = null
      await update($, isOpen, () => false)
    }
    return done
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    // Paths are taken from the call's input: what the tool was asked to touch.
    let reads: string[] = []
    let writes: string[] = []
    if (e.tool === 'Read') reads = [e.file_path]
    else if (e.tool === 'Edit' || e.tool === 'Write') writes = [e.file_path]
    else if (e.tool === 'NotebookEdit') writes = [e.notebook_path]
    else if (e.tool === 'Bash') ({ read: reads, written: writes } = bashPaths(e.command))
    else return next(e)

    writes = writes.filter(p => typeof p === 'string').slice(0, 50)
    reads = reads.filter(p => typeof p === 'string').slice(0, 50)
    const before = await Promise.all(writes.map(p => existsNow($, p)))
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) {
      // A failed Bash may still have written; a failed Edit did not.
      if (e.tool === 'Bash') void requestRefresh($)
      return ran
    }
    for (const p of reads) await mark($, p, 'read')
    for (const [i, p] of writes.entries()) {
      const was = before[i] === true
      // Bash redirections and Write alike: a file that was not there was created.
      if (!was && (await existsNow($, p))) await mark($, p, 'created')
      else await mark($, p, 'edited')
    }
    if (e.tool !== 'Read') void requestRefresh($)
    return ran
  }).catch(($, e, next) => next(e))

  // ---------- drawing: the pane ----------

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const t = await read($, tree)
    const v = await read($, view)
    const m = await read($, marks)
    const walking = await read($, isWalking)
    const dir = isRtl ? 'row-reverse' : 'row'
    const align = isRtl ? 'flex-end' : undefined
    const surface = e.surface

    const rootName = (t?.root ?? root).split('/').filter(Boolean).pop() ?? '/'
    const markKeys = Object.keys(m)
    const sub = [t ? s.entries(t.count) : s.listing, s.changedCount(markKeys.length)]
    if (walking) sub.push(s.refreshing)

    const markText = (k: WorkspaceMark | undefined, isFolder = false) =>
      k === undefined ? null : (
        <Text color={COLOR[k]} dimColor={isFolder ? true : undefined}>
          {isFolder ? ' •' : ` ${GLYPH[k]}`}
        </Text>
      )

    const actions = (key: string, depth: number) => (
      <Box flexDirection={dir} gap={1} paddingLeft={isRtl ? 0 : depth * 2 + 2} paddingRight={isRtl ? depth * 2 + 2 : 0}>
        <Button key="mention" label={s.mention} hotkey="m" onPress={p => void mention($, key, p.surface)} />
        <Button key="copy" label={s.copy} hotkey="y" onPress={p => void copyPath($, key, p.surface)} />
        <Button key="unselect" label="✕" plain onPress={() => void update($, view, x => ({ ...x, selected: null }))} />
      </Box>
    )

    const select = (key: string) => () => void update($, view, x => ({ ...x, selected: x.selected === key ? null : key }))

    // Header: the crab with its map on a surface that draws SVG, a text row on the terminal.
    const header =
      surface !== 'terminal' && 'Svg' in ui ? (
        <ui.Svg
          source={headerSvg(Math.max(200, Math.min(900, (e.props.bodyColumns || 40) * 8 - 8)), `${s.title} · ${rootName}`, sub.join(' · '), walking, isRtl)}
          alt={`${s.title}: ${rootName}, ${sub.join(', ')}`}
          width={Math.max(200, Math.min(900, (e.props.bodyColumns || 40) * 8 - 8))}
          height={HEADER_H}
        />
      ) : (
        <Box flexDirection={dir} gap={1}>
          <Text color={CLAY}>{walking ? '▞' : '▣'}</Text>
          <Text bold wrap="truncate-end">
            {s.title} · {rootName}
          </Text>
          <Text dimColor wrap="truncate-end">
            {sub.join(' · ')}
          </Text>
        </Box>
      )

    const toolbar = (
      <Box flexDirection={dir} gap={1}>
        <Button key="refresh" label={s.refresh} hotkey="r" onPress={() => void refresh($)} />
        <Button
          key="filter"
          label={v.isChangedOnly ? s.all : `${s.changed} · ${markKeys.length}`}
          hotkey="c"
          variant={v.isChangedOnly ? 'primary' : undefined}
          onPress={() => void update($, view, x => ({ ...x, isChangedOnly: !x.isChangedOnly, selected: null }))}
        />
        <Text dimColor wrap="truncate-end">
          {s.legend}
        </Text>
      </Box>
    )

    const body: unknown[] = []
    if (v.isChangedOnly) {
      const keys = markKeys.sort((a, b) => Number(!isInside(a)) - Number(!isInside(b)) || a.localeCompare(b))
      if (keys.length === 0) body.push(<Text dimColor>{s.noChanges}</Text>)
      for (const key of keys.slice(0, ROW_LIMIT)) {
        body.push(
          <Box flexDirection={dir}>
            <Button key={`c:${key}`} plain onPress={select(key)}>
              {key}
              {markText(m[key])}
              {!isInside(key) ? <Text dimColor> ({s.outside})</Text> : ''}
            </Button>
          </Box>,
        )
        if (v.selected === key) body.push(actions(key, 0))
      }
      if (keys.length > ROW_LIMIT) body.push(<Text dimColor>{s.more(keys.length - ROW_LIMIT)}</Text>)
    } else if (t === null) {
      body.push(<Text dimColor>{s.listing}</Text>)
    } else if (t.dirs[''] === undefined) {
      body.push(<Text dimColor>{s.unreadable}</Text>)
    } else {
      const folders = markedFolders(m)
      const rows = visibleRows(t, new Set(v.expanded), maxDepth, ROW_LIMIT + 1)
      if (rows.length === 0) body.push(<Text dimColor>{s.empty}</Text>)
      for (const row of rows.slice(0, ROW_LIMIT)) {
        const pad = { paddingLeft: isRtl ? 0 : row.depth * 2, paddingRight: isRtl ? row.depth * 2 : 0 }
        if (row.isDir) {
          const glyph = row.isCapped ? '·' : row.isOpen ? '▾' : isRtl ? '◂' : '▸'
          body.push(
            <Box flexDirection={dir} {...pad}>
              <Button key={`d:${row.rel}`} plain onPress={() => (row.isCapped ? undefined : void toggleFolder($, row.rel))}>
                {glyph} {row.name}/{markText(folders.get(row.rel), true)}
                {row.isCapped ? <Text dimColor> ({s.tooDeep})</Text> : ''}
              </Button>
            </Box>,
          )
          if (row.isOpen && t.dirs[row.rel] !== undefined && t.dirs[row.rel]?.length === 0) {
            body.push(
              <Box {...{ paddingLeft: isRtl ? 0 : row.depth * 2 + 2, paddingRight: isRtl ? row.depth * 2 + 2 : 0 }}>
                <Text dimColor>{s.empty}</Text>
              </Box>,
            )
          }
        } else {
          body.push(
            <Box flexDirection={dir} {...pad}>
              <Button key={`f:${row.rel}`} plain onPress={select(row.rel)}>
                {'  '}
                {row.name}
                {markText(m[row.rel])}
              </Button>
            </Box>,
          )
          if (v.selected === row.rel) body.push(actions(row.rel, row.depth))
        }
      }
      if (rows.length > ROW_LIMIT) body.push(<Text dimColor>{s.more(rows.length - ROW_LIMIT)}</Text>)
      if (t.isTruncated) body.push(<Text dimColor>{s.truncated(maxEntries)}</Text>)
    }

    return (
      <Box flexDirection="column" gap={0} alignItems={align}>
        {header}
        {toolbar}
        <Box flexDirection="column" alignItems={align}>
          {body as never}
        </Box>
      </Box>
    )
  })

  // ---------- drawing: the band above the prompt ----------

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!showBand || e.props.hasSurvey) return next(e)
    // Draw this row with the other mods' bands beneath it; the engine's own
    // placeholder ({ type: 'engine' }) is never nested.
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null
    const { Box, Button, Text } = $.ui.resolve(e)
    const up = await read($, isOpen)
    const touched = Object.keys(await read($, marks)).length
    return (
      <Box flexDirection="column">
        <Box flexDirection={isRtl ? 'row-reverse' : 'row'} gap={1}>
          <Button key="workspace-toggle" label={up ? s.bandClose : s.bandOpen} plain onPress={() => void togglePane($)} />
          {touched > 0 ? <Text dimColor>{s.changedCount(touched)}</Text> : ''}
        </Box>
        {below as never}
      </Box>
    )
  })
}
