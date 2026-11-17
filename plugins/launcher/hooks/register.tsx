import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Order, Term } from '../types'
import { CLAY, crabSvg, crabText } from './crab'
import type { Mood } from './crab'
import { STRINGS, fill, langOf } from './i18n'
import type { Lang, Strings } from './i18n'
import {
  LANGS,
  MODES,
  SHORTCUTS,
  collectTerms,
  fitRow,
  installedShortcuts,
  resolveShortcut,
  tagOf,
  tagText,
  termsMarkdown,
  textWidth,
  toggleSticky,
  toggleTag,
  visibleTerms,
  withSticky,
} from './lib'
import type { CommandLike, Item, Tag } from './lib'

export const MODES_PANE = 'launcher-modes'
export const GLOSSARY_PANE = 'launcher-glossary'
const STORE_COLLAPSED = 'launcher.collapsed'

const collapsed = atom({ plugin: 'launcher', key: 'collapsed' } as const, false)
const sticky = atom({ plugin: 'launcher', key: 'sticky' } as const, [] as string[])
const installed = atom({ plugin: 'launcher', key: 'installed' } as const, [] as string[])
const terms = atom({ plugin: 'launcher', key: 'terms' } as const, [] as Term[], { shape: 'terms-1' })
const query = atom({ plugin: 'launcher', key: 'query' } as const, '')
const order = atom({ plugin: 'launcher', key: 'order' } as const, 'seen' as Order)

type Opts = { sticky: boolean; language: string }
let opts: Opts = { sticky: false, language: 'auto' }
let lang: Lang = 'en'
const tr = (): Strings => STRINGS[lang]
const isRtl = (): boolean => lang === 'ar'

const readOpts = (o: unknown): Opts => {
  const v = (o ?? {}) as Record<string, unknown>
  return { sticky: v.sticky === true, language: typeof v.language === 'string' ? v.language : 'auto' }
}

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

const isPersonOrigin = (kind: string): boolean => kind === 'composer' || kind === 'bridge' || kind === 'sdk'

// ---------------------------------------------------------------------------
// Actions.

async function refreshInstalled($: EngineInterface): Promise<void> {
  try {
    const list = (await $.command.list()) as readonly CommandLike[]
    const names = installedShortcuts(list)
    resolved = new Map(names.map(n => [n, resolveShortcut(list, n) ?? n]))
    await update($, installed, prev => (prev.join() === names.join() ? prev : names))
  } catch {
    // Keep what we had.
  }
}

async function refreshTerms($: EngineInterface): Promise<void> {
  try {
    const msgs = await $.session.messages()
    const found = collectTerms(msgs.filter(m => m.role === 'assistant').map(m => m.text))
    await update($, terms, prev => (JSON.stringify(prev) === JSON.stringify(found) ? prev : found))
  } catch {
    // Keep what we had.
  }
}

// A mode or language button: into the prompt box, or, with sticky mode on,
// into the sticky set that goes in front of every prompt sent.
async function pressTag($: EngineInterface, t: Tag, surface?: string): Promise<void> {
  const s = tr()
  if (opts.sticky) {
    const next = await update($, sticky, cur => toggleSticky(cur, t))
    $.ui.toast(next.length ? fill(s.stickySet, { tags: next.map(id => tagText(tagOf(id) ?? t)).join(' ') }) : s.stickyCleared)
    return
  }
  try {
    const box = await $.prompt.read()
    const want = toggleTag(box.text, box.cursor, t)
    const r = await $.prompt.fill({ text: want.text, mode: 'replace', cursor: want.cursor })
    if (r.isFilled) return
  } catch {
    // No box to write: fall back to the clipboard.
  }
  const text = `${tagText(t)} `
  try {
    const c = await $.ui.copy({ text, surface: surface as never })
    $.ui.toast(fill(c.isCopied ? s.copied : s.notCopied, { text: text.trim() }))
  } catch {
    $.ui.toast(fill(s.notCopied, { text: text.trim() }))
  }
}

async function clearSticky($: EngineInterface): Promise<void> {
  await update($, sticky, () => [])
  $.ui.toast(tr().stickyCleared)
}

// Shortcut -> the command that really serves it (e.g. tasks -> taskboard).
let resolved = new Map<string, string>()

async function runShortcut($: EngineInterface, command: string): Promise<void> {
  try {
    await $.command.run({ command: resolved.get(command) ?? command })
  } catch (err) {
    $.ui.toast(fill(tr().failed, { cmd: command, why: err instanceof Error ? err.message : String(err) }))
  }
}

async function togglePane($: EngineInterface, id: string): Promise<boolean> {
  if ((await $.ui.panes()).some(p => p.id === id)) {
    await $.ui.close({ id })
    return false
  }
  if (id === GLOSSARY_PANE) await refreshTerms($)
  else await refreshInstalled($)
  await $.ui.open({ id, title: id === GLOSSARY_PANE ? tr().glossary : tr().modesPane })
  return true
}

async function toggleBand($: EngineInterface): Promise<void> {
  const isDown = await update($, collapsed, v => !v)
  try {
    await $.store.set(STORE_COLLAPSED, isDown)
  } catch {
    // Remembered for this session only.
  }
}

async function copyAll($: EngineInterface, list: readonly Term[], surface?: string): Promise<void> {
  const s = tr()
  const md = termsMarkdown(list, [s.colEn, s.colFr, s.colAr, s.colNote])
  try {
    const c = await $.ui.copy({ text: md, surface: surface as never })
    $.ui.toast(c.isCopied ? fill(s.copiedAll, { n: list.length }) : s.copyFailed)
  } catch {
    $.ui.toast(s.copyFailed)
  }
}

// ---------------------------------------------------------------------------

export const register: Register = (on, options) => {
  opts = readOpts(options)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await detectLang($)
    const s = tr()
    await $.command.register({ name: 'modes', description: s.cmdModes })
    await $.command.register({ name: 'glossary', description: s.cmdGlossary })
    try {
      const was = await $.store.get(STORE_COLLAPSED)
      if (typeof was === 'boolean') await update($, collapsed, () => was)
    } catch {
      // Expanded by default.
    }
    await refreshInstalled($)
    await refreshTerms($)
    return started
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId) return r
    await refreshTerms($)
    await refreshInstalled($)
    return r
  })

  // Sticky mode: the sticky tags go in front of what the person sends.
  on('prompt.submit', async ($, e, next) => {
    if (!opts.sticky || e.isMeta || e.command || !isPersonOrigin(e.origin.kind)) return next(e)
    const tags = await read($, sticky)
    if (!tags.length) return next(e)
    return next({ ...e, text: withSticky(e.text, tags) })
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'modes' }, async $ => {
    await togglePane($, MODES_PANE)
    return { text: '' }
  })
  on('command.run', { command: 'glossary' }, async $ => {
    await togglePane($, GLOSSARY_PANE)
    return { text: '' }
  })

  on('ui.render', { component: 'Pane', requestId: MODES_PANE }, async ($, e) => drawModesPane($, e))
  on('ui.render', { component: 'Pane', requestId: GLOSSARY_PANE }, async ($, e) => drawGlossary($, e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    return drawBand($, e)
  })
}

// ---------------------------------------------------------------------------
// Drawing. The element table differs per surface; builders take it whole.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type El = any
type UI = { Box: El; Text: El; Button: El; Svg?: El; Input?: El }

// Cells a band button takes, its gap included: the terminal draws a plain
// button as its label; desktop and mobile add padding.
const btnWidth = (label: string, isSvg: boolean): number => textWidth(label) + (isSvg ? 4 : 1)
const CRAB_W = 4

export type BandEntry = Item & { label: string; kind: 'toggle' | 'tag' | 'shortcut' | 'glossary' | 'clear' | 'crab'; id: string; active?: boolean }

// What the band shows for a width: the fixed items (crab, Modes, Glossary, the
// sticky Clear) and the modes, languages and shortcuts while they fit.
export function bandEntries(o: {
  columns: number
  isSvg: boolean
  isMobile: boolean
  isDown: boolean
  sticky: readonly string[]
  installed: readonly string[]
  s: Strings
}): { shown: BandEntry[]; hidden: BandEntry[]; more: BandEntry | null } {
  const { s, isSvg } = o
  const e = (x: Omit<BandEntry, 'width'>): BandEntry => ({ ...x, width: x.kind === 'crab' ? CRAB_W : btnWidth(x.label, isSvg) + (x.active ? 2 : 0) })
  const crab = isSvg ? [e({ key: 'launcher-crab', label: '', kind: 'crab', id: 'crab', fixed: true })] : []
  const toggle = e({
    key: 'launcher-modes',
    label: o.isMobile ? s.modes : o.isDown ? `${isSvg ? '' : crabText(o.sticky.length ? 'happy' : 'calm') + ' '}${s.modes} ▸` : `${isSvg ? '' : crabText(o.sticky.length ? 'happy' : 'calm') + ' '}${s.modes} ▾`,
    kind: 'toggle',
    id: 'toggle',
    fixed: true,
  })
  const glossary = e({ key: 'launcher-glossary', label: isSvg ? s.glossary : `📖 ${s.glossary}`, kind: 'glossary', id: 'glossary', fixed: true })
  if (o.isDown) return { shown: [...crab, toggle], hidden: [], more: null }
  if (o.isMobile) return { shown: [...crab, toggle, glossary], hidden: [], more: null }
  const tags = [...MODES, ...LANGS].map(id => e({ key: `launcher-tag-${id}`, label: id, kind: 'tag', id, active: o.sticky.includes(id) }))
  const cuts = SHORTCUTS.filter(c => o.installed.includes(c.command)).map(c =>
    e({ key: `launcher-cmd-${c.command}`, label: s.shortcut[c.id], kind: 'shortcut', id: c.command }),
  )
  const clear = o.sticky.length ? [e({ key: 'launcher-clear', label: `✕ ${s.clear}`, kind: 'clear', id: 'clear', fixed: true })] : []
  const more = e({ key: 'launcher-more', label: `${s.more} …`, kind: 'toggle', id: 'more' })
  const all = [...crab, toggle, ...clear, ...tags, ...cuts, glossary]
  const fit = fitRow(all, o.columns, more.width)
  return { ...fit, more: fit.hidden.length ? more : null }
}

const crabEl = (ui: UI, mood: Mood, isSvg: boolean, px = 22) => {
  const { Svg, Text } = ui
  if (isSvg && Svg) return <Svg key={`crab-${mood}`} source={crabSvg(mood, isRtl())} alt={`crab: ${mood}`} width={Math.round(px * 1.08)} height={px} />
  return <Text color={CLAY}>{crabText(mood)}</Text>
}

async function drawBand($: EngineInterface, e: El) {
  const ui = $.ui.resolve(e) as unknown as UI
  const { Box, Button } = ui
  const isSvg = e.surface !== 'terminal' && 'Svg' in ui
  const tags = opts.sticky ? await read($, sticky) : []
  const has = await read($, installed)
  const isDown = await read($, collapsed)
  const s = tr()
  const { shown, more } = bandEntries({
    columns: e.props.bodyColumns,
    isSvg,
    isMobile: e.surface === 'mobile',
    isDown,
    sticky: tags,
    installed: has,
    s,
  })
  const items = more ? [...shown.slice(0, -1), more, shown[shown.length - 1] as BandEntry] : shown
  return (
    <Box key="launcher-band" flexDirection={isRtl() ? 'row-reverse' : 'row'} gap={1} alignItems="center" flexWrap="nowrap">
      {items.map(x => {
        if (x.kind === 'crab') return <Box key={x.key} flexShrink={0}>{crabEl(ui, tags.length ? 'happy' : 'calm', isSvg)}</Box>
        if (x.id === 'toggle')
          return (
            <Button key={x.key} label={x.label} plain onPress={() => (e.surface === 'mobile' ? togglePane($, MODES_PANE) : toggleBand($))} />
          )
        if (x.id === 'more') return <Button key={x.key} label={x.label} plain onPress={() => togglePane($, MODES_PANE)} />
        if (x.kind === 'glossary') return <Button key={x.key} label={x.label} plain onPress={() => togglePane($, GLOSSARY_PANE)} />
        if (x.kind === 'clear') return <Button key={x.key} label={x.label} plain onPress={() => clearSticky($)} />
        if (x.kind === 'shortcut') return <Button key={x.key} label={x.label} plain onPress={() => runShortcut($, x.id)} />
        const t = tagOf(x.id) as Tag
        return x.active ? (
          <Button key={x.key} label={x.label} variant="primary" onPress={(p: { surface?: string }) => pressTag($, t, p?.surface)} />
        ) : (
          <Button key={x.key} label={x.label} plain onPress={(p: { surface?: string }) => pressTag($, t, p?.surface)} />
        )
      })}
    </Box>
  )
}

// The Modes pane (/modes, the band's More, and the mobile band's Modes): every
// mode, the reply languages, the installed shortcuts and the sticky state.
async function drawModesPane($: EngineInterface, e: El) {
  const ui = $.ui.resolve(e) as unknown as UI
  const { Box, Text, Button } = ui
  const isSvg = e.surface !== 'terminal' && 'Svg' in ui
  const s = tr()
  const tags = opts.sticky ? await read($, sticky) : []
  const has = await read($, installed)
  const dir = isRtl() ? 'row-reverse' : 'row'
  const tagBtn = (id: string) => {
    const t = tagOf(id) as Tag
    const on = tags.includes(id)
    return on ? (
      <Button key={`pane-tag-${id}`} label={id} variant="primary" onPress={(p: { surface?: string }) => pressTag($, t, p?.surface)} />
    ) : (
      <Button key={`pane-tag-${id}`} label={id} {...(isSvg ? {} : { plain: true as const })} onPress={(p: { surface?: string }) => pressTag($, t, p?.surface)} />
    )
  }
  const cuts = SHORTCUTS.filter(c => has.includes(c.command))
  return (
    <Box flexDirection="column" gap={1} alignItems={isRtl() ? 'flex-end' : undefined}>
      <Box flexDirection={dir} gap={1} alignItems="center">
        {crabEl(ui, tags.length ? 'happy' : 'calm', isSvg, 28)}
        <Text bold>{s.modesPane}</Text>
      </Box>
      <Box flexDirection={dir} gap={1} flexWrap="wrap">
        {MODES.map(tagBtn)}
      </Box>
      <Text bold>{s.replyIn}</Text>
      <Box flexDirection={dir} gap={1} flexWrap="wrap">
        {LANGS.map(tagBtn)}
      </Box>
      {cuts.length ? <Text bold>{s.shortcuts}</Text> : null}
      {cuts.length ? (
        <Box flexDirection={dir} gap={1} flexWrap="wrap">
          {cuts.map(c => (
            <Button key={`pane-cmd-${c.command}`} label={s.shortcut[c.id]} {...(isSvg ? {} : { plain: true as const })} onPress={() => runShortcut($, c.command)} />
          ))}
          <Button key="pane-glossary" label={s.glossary} {...(isSvg ? {} : { plain: true as const })} onPress={() => togglePane($, GLOSSARY_PANE)} />
        </Box>
      ) : (
        <Box flexDirection={dir}>
          <Button key="pane-glossary" label={s.glossary} {...(isSvg ? {} : { plain: true as const })} onPress={() => togglePane($, GLOSSARY_PANE)} />
        </Box>
      )}
      {opts.sticky ? (
        <Box flexDirection={dir} gap={1} alignItems="center" flexWrap="wrap">
          <Text dimColor>{tags.length ? fill(s.stickyOn, { tags: tags.map(id => tagText(tagOf(id) as Tag)).join(' ') }) : s.stickySet.replace(/\{tags\}\s*/, '')}</Text>
          {tags.length ? <Button key="pane-clear" label={`✕ ${s.clear}`} plain onPress={() => clearSticky($)} /> : null}
        </Box>
      ) : (
        <Text dimColor>{s.stickyOff}</Text>
      )}
    </Box>
  )
}

// The Glossary pane: every STUDY term of this chat, English, French, Arabic
// (right to left) and the explanation; search, order, Copy all.
async function drawGlossary($: EngineInterface, e: El) {
  const ui = $.ui.resolve(e) as unknown as UI
  const { Box, Text, Button, Input } = ui
  const isSvg = e.surface !== 'terminal' && 'Svg' in ui
  const s = tr()
  const all = await read($, terms)
  const q = await read($, query)
  const by = await read($, order)
  const list = visibleTerms(all, q, by)
  const cols = Math.max(20, e.props.bodyColumns || 60)
  const isWide = cols >= 72
  const dir = isRtl() ? 'row-reverse' : 'row'
  const rtlText = (t: string) => (t ? `⁧${t}⁩` : '—')
  return (
    <Box flexDirection="column" gap={isWide ? 0 : 1}>
      <Box flexDirection={dir} gap={1} alignItems="center">
        {crabEl(ui, 'book', isSvg, 28)}
        <Text bold>{s.glossary}</Text>
        <Text dimColor>{fill(s.count, { n: all.length })}</Text>
      </Box>
      <Box flexDirection={dir} gap={1} alignItems="center" flexWrap="wrap">
        {Input ? (
          <Input key="launcher-search" label={`${s.search}:`} placeholder={s.searchHint} value={q} onInput={(v: string) => update($, query, () => v)} onSubmit={(v: string) => update($, query, () => v)} />
        ) : null}
        <Button key="launcher-order" label={by === 'az' ? `⇅ ${s.seen}` : `⇅ ${s.az}`} plain onPress={() => update($, order, o => (o === 'az' ? 'seen' : 'az'))} />
        <Button key="launcher-copy" label={`⧉ ${s.copyAll}`} plain onPress={(p: { surface?: string }) => copyAll($, list, p?.surface)} />
      </Box>
      {all.length === 0 ? <Text dimColor>{s.noTerms}</Text> : null}
      {all.length > 0 && list.length === 0 ? <Text dimColor>{fill(s.noHits, { q })}</Text> : null}
      {isWide && list.length ? (
        <Box key="g-head" flexDirection={dir} gap={1}>
          <Box width="22%"><Text bold>{s.colEn}</Text></Box>
          <Box width="20%"><Text bold>{s.colFr}</Text></Box>
          <Box width="20%" flexDirection="row" justifyContent="flex-end"><Text bold>{s.colAr}</Text></Box>
          <Box flexGrow={1} flexShrink={1}><Text bold>{s.colNote}</Text></Box>
        </Box>
      ) : null}
      {list.map(t =>
        isWide ? (
          <Box key={`g-${t.seen}`} flexDirection={dir} gap={1}>
            <Box width="22%"><Text bold color={CLAY}>{t.en}</Text></Box>
            <Box width="20%"><Text>{t.fr || '—'}</Text></Box>
            <Box width="20%" flexDirection="row" justifyContent="flex-end"><Text>{rtlText(t.ar)}</Text></Box>
            <Box flexGrow={1} flexShrink={1}><Text dimColor>{t.note || '—'}</Text></Box>
          </Box>
        ) : (
          <Box key={`g-${t.seen}`} flexDirection="column">
            <Text bold color={CLAY}>{t.en}</Text>
            <Text>
              <Text dimColor>{s.colFr}: </Text>
              {t.fr || '—'}
            </Text>
            <Text>
              <Text dimColor>{s.colAr}: </Text>
              {rtlText(t.ar)}
            </Text>
            {t.note ? <Text dimColor>{t.note}</Text> : null}
          </Box>
        ),
      )}
    </Box>
  )
}
