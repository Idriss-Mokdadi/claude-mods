import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { bandEntries } from '../hooks/register'
import { STRINGS } from '../hooks/i18n'

const PLUGIN = 'launcher'
const bandAt = (bodyColumns: number, maxRows = 10) =>
  ({
    component: 'AbovePrompt',
    props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows, bodyColumns, scroll: { offset: 0, bodyRows: maxRows }, view: {} },
  }) as const
const paneOf = (requestId: string, bodyColumns = 100) =>
  ({
    component: 'Pane',
    requestId,
    props: { title: 'x', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  }) as const

type World = {
  box: { text: string; cursor: number }
  fillWorks: boolean
  copies: string[]
  toasts: string[]
  commands: string[]
  panes: string[]
  store: Map<string, unknown>
  list: { name: string; source: string; plugin?: string }[]
  messages: { role: 'user' | 'assistant'; text: string; toolUses: never[] }[]
}

const ALL_MODS = [
  { name: 'usage-panel', source: 'plugin', plugin: 'cockpit' },
  { name: 'handoff', source: 'plugin', plugin: 'cockpit' },
  { name: 'tree', source: 'plugin', plugin: 'workspace' },
  { name: 'crew', source: 'plugin', plugin: 'crew' },
  { name: 'memory-list', source: 'plugin', plugin: 'memory' },
  { name: 'tasks', source: 'plugin', plugin: 'taskboard' },
  { name: 'undo', source: 'plugin', plugin: 'changes' },
  { name: 'theme', source: 'plugin', plugin: 'crab-theme' },
]

const CHAT = [
  { role: 'user' as const, text: '[STUDY] explain modulation', toolUses: [] },
  {
    role: 'assistant' as const,
    text: '- **Modulation** (FR: modulation | AR: تضمين) — changing a carrier wave so it can carry information.\n- **Bandwidth** (FR: bande passante | AR: عرض النطاق): the range of frequencies.',
    toolUses: [],
  },
  { role: 'user' as const, text: '**Fake** (FR: faux | AR: مزيف) — the person wrote it', toolUses: [] },
  { role: 'assistant' as const, text: '**modulation** (FR: autre) — again\n**Antenna** (FR: antenne)', toolUses: [] },
]

async function start($: Engine, on: On, setup: Partial<World> = {}, surface = 'terminal') {
  const w: World = {
    box: { text: '', cursor: 0 },
    fillWorks: true,
    copies: [],
    toasts: [],
    commands: [],
    panes: [],
    store: new Map(),
    list: [{ name: 'compact', source: 'builtin' }, { name: 'theme', source: 'builtin' }, { name: 'tasks', source: 'builtin' }],
    messages: CHAT,
    ...setup,
  }
  on('ui.render', ($e, e) => {
    const { Text } = $e.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  on('settings.read', async () => ({ value: {} }) as never)
  on('env.get', () => ({ value: 'en_US.UTF-8' }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('command.register', (_$, e) => ({ value: { command: e.name } }) as never)
  on('command.list', () => ({ value: w.list }) as never)
  on('command.run', (_$, e) => {
    w.commands.push(e.command)
    return { text: '' } as never
  })
  on('store.get', (_$, e) => ({ value: w.store.get((e as { key: string }).key) }) as never)
  on('store.set', (_$, e) => {
    const { key, value } = e as { key: string; value: unknown }
    w.store.set(key, value)
    return { value: undefined } as never
  })
  on('session.messages', () => ({ value: w.messages }) as never)
  on('prompt.read', () => ({ value: w.box }) as never)
  on('prompt.fill', (_$, e) => {
    if (!w.fillWorks) return { isFilled: false, refusal: 'dialog' } as never
    w.box = { text: e.text, cursor: e.cursor ?? e.text.length }
    return { isFilled: true } as never
  })
  on('ui.copy', (_$, e) => {
    w.copies.push((e as { text: string }).text)
    return { value: { isCopied: true } } as never
  })
  on('ui.toast', (_$, e) => {
    w.toasts.push(e.text)
    return { value: undefined } as never
  })
  on('ui.open', (_$, e) => {
    const { id } = e as { id: string }
    w.panes = [...w.panes.filter(p => p !== id), id]
    return { value: { isPlaced: true } } as never
  })
  on('ui.close', (_$, e) => {
    w.panes = w.panes.filter(p => p !== (e as { id: string }).id)
    return { value: {} } as never
  })
  on('ui.panes', () => ({ value: w.panes.map(id => ({ id, isPlaced: true })) }) as never)
  await $.session.start({ source: 'startup', cwd: '/repo', surface, isInteractive: true } as never)
  return w
}

// Since Claude Code 2.1.326 the test kit draws a stand-in for the bands
// beneath; tests look at launcher's own tree only.
type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[]; part?: { plugin?: string } }
const own = (tree: unknown): Node => {
  const el = tree as Node
  const kids = el?.children ?? []
  const last = kids[kids.length - 1] as Node | undefined
  return (kids.length === 2 && last?.part?.plugin === 'test' ? kids[0] : tree) as Node
}
const buttons = (n: unknown, out: string[] = []): string[] => {
  const el = n as Node
  if (!el || typeof el !== 'object') return out
  if (el.type === 'Button') out.push(String(el.props?.key ?? el.props?.label))
  for (const c of el.children ?? []) buttons(c, out)
  return out
}
const band = ($: Engine, surface: 'terminal' | 'desktop' | 'mobile', columns = 400, maxRows = 10) =>
  $.ui.mount({ plugin: PLUGIN, surface, ...bandAt(columns, maxRows) } as never)
const submit = ($: Engine, text: string, kind = 'composer') => $.prompt.submit({ text, wait: false, origin: { kind } } as never)

const SURFACES = ['terminal', 'desktop'] as const

for (const surface of SURFACES) {
  test(`${surface}: a mode button puts its tag at the start of the prompt box`, async ($, on) => {
    const w = await start($, on, { box: { text: 'explain QAM', cursor: 11 } })
    const ui = await band($, surface)
    await ui.press({ key: 'launcher-tag-STUDY' })
    expect(w.box).toEqual({ text: '[STUDY] explain QAM', cursor: 19 })
    await ui.press({ key: 'launcher-tag-FR' })
    expect(w.box.text).toBe('[STUDY] Reply in French. explain QAM')
    // Pressed again, the tag comes off.
    await ui.press({ key: 'launcher-tag-STUDY' })
    expect(w.box.text).toBe('Reply in French. explain QAM')
    expect(w.toasts).toEqual([])
    await ui.unmount()
  })

  test(`${surface}: every mode and language has a button on a wide band`, async ($, on) => {
    await start($, on)
    const ui = await band($, surface)
    const keys = buttons(own(await ui.drawn()))
    for (const m of ['SHORT', 'STUDY', 'DEEP', 'ANALYSE', 'TECH', 'RESEARCH', 'TOOLS', 'DECIDE', 'WRITE', 'PLAN', 'CHALLENGE', 'SELF-CHECK', 'BRAINSTORM', 'CREATIVE', 'EN', 'FR', 'AR'])
      expect(keys).toContain(`launcher-tag-${m}`)
    expect(keys).toContain('launcher-glossary')
    expect(keys).not.toContain('launcher-more')
    await ui.unmount()
  })

  test(`${surface}: shortcuts show only for the mods that are installed`, async ($, on) => {
    await start($, on, {
      list: [
        { name: 'usage-panel', source: 'plugin', plugin: 'cockpit' },
        { name: 'memory-list', source: 'plugin', plugin: 'memory' },
        { name: 'tasks', source: 'builtin' },
        { name: 'theme', source: 'builtin' },
      ],
    })
    const ui = await band($, surface)
    const keys = buttons(own(await ui.drawn())).filter(k => k.startsWith('launcher-cmd-'))
    expect(keys).toEqual(['launcher-cmd-usage-panel', 'launcher-cmd-memory-list'])
    await ui.press({ key: 'launcher-cmd-memory-list' })
    expect(await ui.find({ key: 'launcher-cmd-tasks' })).toBeUndefined()
    await ui.unmount()
  })

  test(`${surface}: the band is one row at every width, the rest behind More`, async ($, on) => {
    const w = await start($, on, { list: ALL_MODS })
    const s = STRINGS.en
    for (const columns of [24, 40, 60, 80, 100, 140, 220, 400])
      for (const maxRows of [1, 3, 10]) {
        const ui = await band($, surface, columns, maxRows)
        const root = own(await ui.drawn())
        // One Box laid out as a single row that never wraps.
        expect(root.type).toBe('Box')
        expect(root.props?.flexWrap).toBe('nowrap')
        expect(['row', 'row-reverse']).toContain(root.props?.flexDirection)
        for (const c of root.children ?? []) expect((c as Node).props?.flexDirection === 'column').toBe(false)
        // What it draws fits the band's width.
        const fit = bandEntries({ columns, isSvg: surface !== 'terminal', isMobile: false, isDown: false, sticky: [], installed: ALL_MODS.map(m => m.name), s })
        const width = [...fit.shown, ...(fit.more ? [fit.more] : [])].reduce((n, x) => n + x.width, 0)
        if (columns >= 40) expect(width).toBeLessThanOrEqual(columns)
        const keys = buttons(root)
        expect(keys).toContain('launcher-glossary')
        expect(keys.includes('launcher-more')).toBe(fit.hidden.length > 0)
        if (columns <= 100) expect(keys).toContain('launcher-more')
        await ui.unmount()
      }
    // More opens the Modes pane, where everything is.
    const ui = await band($, surface, 60)
    await ui.press({ key: 'launcher-more' })
    expect(w.panes).toContain('launcher-modes')
    await ui.unmount()
    const pane = await $.ui.mount({ plugin: PLUGIN, surface, ...paneOf('launcher-modes', 60) } as never)
    const keys = buttons(await pane.drawn())
    for (const k of ['pane-tag-CREATIVE', 'pane-tag-AR', 'pane-cmd-theme', 'pane-cmd-undo', 'pane-glossary']) expect(keys).toContain(k)
    await pane.press({ key: 'pane-cmd-theme' })
    expect(w.commands).toContain('theme')
    await pane.unmount()
  })

  test(`${surface}: the band collapses to a single Modes button, remembered`, async ($, on) => {
    const w = await start($, on, { list: ALL_MODS })
    const ui = await band($, surface)
    await ui.press({ key: 'launcher-modes' })
    expect(buttons(own(await ui.drawn()))).toEqual(['launcher-modes'])
    expect(w.store.get('launcher.collapsed')).toBe(true)
    await ui.press({ key: 'launcher-modes' })
    expect(buttons(own(await ui.drawn())).length).toBeGreaterThan(10)
    await ui.unmount()
  })
}

test('a collapsed band from an earlier session starts collapsed', async ($, on) => {
  await start($, on, { store: new Map([['launcher.collapsed', true]]) })
  const ui = await band($, 'terminal')
  expect(buttons(own(await ui.drawn()))).toEqual(['launcher-modes'])
  await ui.unmount()
})

test('when the box cannot take the tag, it is copied and a toast says so', async ($, on) => {
  const w = await start($, on, { fillWorks: false })
  const ui = await band($, 'desktop')
  await ui.press({ key: 'launcher-tag-DEEP' })
  expect(w.copies).toEqual(['[DEEP] '])
  expect(w.toasts[0]).toMatch(/Copied "\[DEEP\]"/)
  await ui.unmount()
})

test('sticky mode is off by default: a sent prompt is left as typed', async ($, on) => {
  await start($, on)
  const ui = await band($, 'terminal')
  await ui.press({ key: 'launcher-tag-STUDY' })
  await ui.unmount()
  const r = (await submit($, 'what is OFDM?')) as { text: string }
  expect(r.text).toBe('what is OFDM?')
})

test('sticky mode: the chosen tags go in front of every prompt until cleared', { options: { sticky: true } }, async ($, on) => {
  const w = await start($, on)
  const ui = await band($, 'terminal')
  await ui.press({ key: 'launcher-tag-STUDY' })
  await ui.press({ key: 'launcher-tag-AR' })
  // Sticky does not touch the box; a toast says the cost.
  expect(w.box.text).toBe('')
  expect(w.toasts.at(-1)).toMatch(/\[STUDY\] Reply in Arabic\..*~3 tokens/)
  // The sticky buttons are marked, and a Clear button shows.
  const active = (await ui.find({ key: 'launcher-tag-STUDY' })) as unknown as { props: { variant?: string } }
  expect(active.props.variant).toBe('primary')
  expect(await ui.find({ key: 'launcher-clear' })).toBeDefined()
  expect(((await submit($, 'what is OFDM?')) as { text: string }).text).toBe('[STUDY] Reply in Arabic. what is OFDM?')
  expect(((await submit($, 'and FFT?')) as { text: string }).text).toBe('[STUDY] Reply in Arabic. and FFT?')
  // Not doubled, not added to a command, nor to what the person did not type.
  expect(((await submit($, '[STUDY] again')) as { text: string }).text).toBe('[STUDY] Reply in Arabic. again')
  expect(((await submit($, 'done', 'task-notification')) as { text: string }).text).toBe('done')
  await ui.press({ key: 'launcher-clear' })
  expect(await ui.find({ key: 'launcher-clear' })).toBeUndefined()
  expect(((await submit($, 'plain')) as { text: string }).text).toBe('plain')
  await ui.unmount()
})

test('mobile: the band is Modes and Glossary; each opens its pane', async ($, on) => {
  const w = await start($, on, { list: ALL_MODS }, 'mobile')
  const ui = await band($, 'mobile', 50)
  expect(buttons(own(await ui.drawn()))).toEqual(['launcher-modes', 'launcher-glossary'])
  await ui.press({ key: 'launcher-modes' })
  expect(w.panes).toEqual(['launcher-modes'])
  await ui.press({ key: 'launcher-glossary' })
  expect(w.panes).toEqual(['launcher-modes', 'launcher-glossary'])
  // The side button closes it again.
  await ui.press({ key: 'launcher-glossary' })
  expect(w.panes).toEqual(['launcher-modes'])
  await ui.unmount()
  const pane = await $.ui.mount({ plugin: PLUGIN, surface: 'mobile', ...paneOf('launcher-modes', 40) } as never)
  await pane.press({ key: 'pane-tag-TECH' })
  expect(w.box.text).toBe('[TECH] ')
  await pane.unmount()
})

test('/modes and /glossary open and close their panes', async ($, on) => {
  const w = await start($, on)
  await $.command.run({ command: 'glossary' } as never)
  expect(w.panes).toEqual(['launcher-glossary'])
  await $.command.run({ command: 'modes' } as never)
  await $.command.run({ command: 'glossary' } as never)
  expect(w.panes).toEqual(['launcher-modes'])
})

for (const surface of SURFACES) {
  test(`${surface}: the glossary lists this chat's assistant terms, once each`, async ($, on) => {
    await start($, on)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...paneOf('launcher-glossary', 100) } as never)
    expect(await ui.find({ type: 'Text', text: /^3 terms$/ })).toBeDefined()
    for (const t of [/^Modulation$/, /^Bandwidth$/, /^Antenna$/, /^bande passante$/, /تضمين/, /changing a carrier wave/]) expect(await ui.find({ type: 'Text', text: t })).toBeDefined()
    // What the person typed is not the assistant's glossary.
    expect(await ui.find({ type: 'Text', text: /Fake/ })).toBeUndefined()
    // Column headings on a wide pane.
    for (const h of ['English', 'French', 'Arabic', 'Explanation']) expect(await ui.find({ type: 'Text', text: new RegExp(`^${h}$`) })).toBeDefined()
    await ui.unmount()
  })
}

test('glossary: search, A-Z order and Copy all as Markdown', async ($, on) => {
  const w = await start($, on)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...paneOf('launcher-glossary', 100) } as never)
  const order = async () => {
    const out: string[] = []
    for (const n of ['Modulation', 'Bandwidth', 'Antenna']) {
      const el = await ui.find({ type: 'Text', text: new RegExp(`^${n}$`) })
      if (el) out.push(n)
    }
    return out
  }
  expect(await order()).toEqual(['Modulation', 'Bandwidth', 'Antenna'])
  await ui.press({ key: 'launcher-order' })
  await ui.press({ key: 'launcher-copy' })
  expect(w.copies[0]?.split('\n').slice(2).map(l => l.split(' | ')[0])).toEqual(['| **Antenna**', '| **Bandwidth**', '| **Modulation**'])
  expect(w.copies[0]).toContain('| **Antenna** | antenne | — | — |')
  expect(w.toasts.at(-1)).toBe('Copied 3 terms as Markdown.')
  await ui.input({ key: 'launcher-search', text: 'passante', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: /^Bandwidth$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Modulation$/ })).toBeUndefined()
  await ui.input({ key: 'launcher-search', text: 'zzz', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: /No term matches "zzz"/ })).toBeDefined()
  await ui.unmount()
})

test('glossary refreshes when a turn completes', async ($, on) => {
  const w = await start($, on, { messages: [] })
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...paneOf('launcher-glossary', 50) } as never)
  expect(await ui.find({ type: 'Text', text: /No terms yet/ })).toBeDefined()
  w.messages = CHAT
  await ($ as unknown as { turn: { complete: (e: unknown) => Promise<unknown> } }).turn.complete({ answer: 'done', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(await ui.find({ type: 'Text', text: /^Antenna$/ })).toBeDefined()
  await ui.unmount()
})

test('French and Arabic UI', { options: { language: 'ar' } }, async ($, on) => {
  await start($, on)
  const ui = await band($, 'terminal')
  expect(await ui.find({ key: 'launcher-glossary' })).toBeDefined()
  const root = own(await ui.drawn())
  expect(root.props?.flexDirection).toBe('row-reverse')
  const g = (await ui.find({ key: 'launcher-glossary' })) as unknown as { props: { label: string } }
  expect(g.props.label).toMatch(/المسرد/)
  await ui.unmount()
})

test('French UI labels', { options: { language: 'fr' } }, async ($, on) => {
  await start($, on, { list: ALL_MODS })
  const ui = await band($, 'desktop')
  const g = (await ui.find({ key: 'launcher-glossary' })) as unknown as { props: { label: string } }
  expect(g.props.label).toBe('Glossaire')
  const f = (await ui.find({ key: 'launcher-cmd-tree' })) as unknown as { props: { label: string } }
  expect(f.props.label).toBe('Fichiers')
  await ui.unmount()
})
