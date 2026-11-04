import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PLUGIN = 'cockpit'
const NOW = Date.parse('2026-11-04T20:15:00Z')
const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 140, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const
const PANE = {
  component: 'Pane',
  requestId: 'cockpit-usage',
  props: { title: 'Usage', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const usageAt = (ctx: number, five = 20, seven = 5) => ({
  startedAt: NOW - 60_000,
  context: { tokens: ctx * 10_000, window: 1_000_000, percent: ctx },
  rateLimits: [
    { kind: 'five_hour', percentUsed: five, resetsAt: '2026-11-04T22:28:00Z' },
    { kind: 'seven_day', percentUsed: seven, resetsAt: '2026-11-08T10:00:00Z' },
  ],
  cost: { usd: 1.23 },
})

type World = {
  toasts: string[]
  writes: { path: string; text: string }[]
  forks: number
  completes: number
  compacted: number
  usage: (e: { breakdown?: string }) => unknown
  model: string
  configSets: { key: string; value: unknown }[]
  commands: string[]
  logs: string[]
  configRows: unknown[]
  modelSwitchWorks: boolean
  panes: { id: string; title?: string }[]
  store: Map<string, unknown>
  ctx: number
  five: number
}

type Setup = { usage?: World['usage']; env?: Record<string, string>; rows?: unknown[]; store?: Record<string, unknown> }

async function start($: Engine, on: On, ctx = 30, setup: Setup = {}) {
  const env = setup.env ?? { LANG: 'en_US.UTF-8', CLAUDE_EFFORT: 'high' }
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, env)
  const w: World = {
    toasts: [], writes: [], forks: 0, completes: 0, compacted: 0, usage: () => usageAt(w.ctx, w.five), store: new Map(Object.entries(setup.store ?? {})), ctx, five: 20,
    model: 'claude-opus-5-5', panes: [], configSets: [], commands: [], logs: [], modelSwitchWorks: true,
    configRows: setup.rows ?? [{ key: 'model', label: 'Model', kind: 'choice', value: 'opus', options: ['default', 'sonnet', 'opus', 'haiku'], provider: { plugin: 'engine', tier: 'core' }, isLocked: false }],
  }
  on('ui.render', ($e, e) => {
    const { Text } = $e.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('session.measure', (_$, e) => ({ changed: e.changed }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('command.run', (_$, e) => {
    w.commands.push(`${e.command} ${e.args}`.trim())
    return { text: '' } as never
  })
  on('command.list', () => ({ value: [{ name: 'model' }, { name: 'effort' }, { name: 'compact' }] }) as never)
  on('config.list', () => ({ value: w.configRows }) as never)
  on('store.get', (_$, e) => ({ value: w.store.get((e as { key: string }).key) }) as never)
  on('store.set', (_$, e) => {
    const { key, value } = e as { key: string; value: unknown }
    w.store.set(key, value)
    return { value: undefined } as never
  })
  on('config.set', (_$, e) => {
    w.configSets.push({ key: e.key, value: e.value })
    if (e.key === 'model' && w.modelSwitchWorks) w.model = `claude-${String(e.value)}-5-5`
    return { value: e.value } as never
  })
  on('ui.log', (_$, e) => {
    w.logs.push(String((e as { text?: string }).text ?? e))
    return { value: undefined } as never
  })
  on('ui.open', (_$, e) => {
    const { id, title } = e as { id: string; title?: string }
    w.panes = [...w.panes.filter(p => p.id !== id), { id, title }]
    return { value: { isPlaced: true } } as never
  })
  on('ui.close', (_$, e) => {
    w.panes = w.panes.filter(p => p.id !== (e as { id: string }).id)
    return { value: {} } as never
  })
  on('ui.panes', () => ({ value: w.panes }) as never)
  on('session.compact', () => {
    w.compacted += 1
    return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] } as never
  })
  on('settings.read', async () => ({ value: {} }) as never)
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  on('command.register', (_$, e) => ({ value: { command: e.name } }) as never)
  on('session.model', () => ({ value: w.model }) as never)
  on('session.cwd', () => ({ value: '/repo' }) as never)
  on('session.usage', (_$, e) => ({ value: w.usage(e as { breakdown?: string }) }) as never)
  on('ui.toast', (_$, e) => {
    w.toasts.push(e.text)
    return { value: undefined } as never
  })
  on('fs.write', (_$, e) => {
    w.writes.push({ path: (e as { path: string }).path, text: (e as { text: string }).text })
    return { value: undefined } as never
  })
  on('model.fork', () => {
    w.forks += 1
    return { value: { isAnswered: true, text: 'ok', usage: { input_tokens: 40, output_tokens: 2, cache_read_input_tokens: 200_000, cache_creation_input_tokens: 0 } } } as never
  })
  on('model.complete', () => {
    w.completes += 1
    return {
      value: {
        isAnswered: true,
        text: '## Goal\n- Ship cockpit\n## Decisions\n- None\n## Open problems\n- None\n## Next steps\n- Push',
        usage: { input_tokens: 3000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    } as never
  })
  on('session.messages', () => ({
    value: [
      { role: 'user', text: 'Build the cockpit mod', toolUses: [] },
      { role: 'assistant', text: 'Done.', toolUses: [{ tool_use_id: 't1', tool: 'Write', input: { file_path: '/repo/a.ts', content: 'x' }, text: 'ok' }] },
    ],
  }) as never)
  if (setup.usage) w.usage = setup.usage
  await $.session.start({ source: 'startup', cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  return { clock, w }
}

const measure = ($: Engine, w: World, ctx: number, five = 20) => {
  w.ctx = ctx
  w.five = five
  return ($.session as unknown as { measure: (e: unknown) => Promise<unknown> }).measure({ ...usageAt(ctx, five), changed: ['context', 'rateLimits'] })
}

const submit = ($: Engine, text: string, kind = 'composer') => $.prompt.submit({ text, wait: false, origin: { kind } } as never)

const SURFACES = ['terminal', 'desktop'] as const

// On desktop and mobile the emoji is a pixel crab: the words stay, the emoji goes.
const say = (surface: 'terminal' | 'desktop', re: RegExp): RegExp =>
  surface === 'terminal' ? re : new RegExp(re.source.replace(/^(\\p\{Extended_Pictographic\}|[^\x00-\x7F]+)\s*/u, ''), re.flags)

// The crabs a drawing holds, by their alt text: `<kind> <tone>`.
const crabs = async (ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) =>
  (await ui.findAll({ type: 'Svg' })).map(x => String(x.props.alt)).filter(a => /^[a-z_]+ (green|yellow|orange|red|cold)$/.test(a))

const band = ($: Engine, surface: 'terminal' | 'desktop') => $.ui.mount({ plugin: PLUGIN, surface, ...BAND } as never)

for (const surface of SURFACES) {
  test(`${surface}: collapsed, the band is one Usage button with a mood, the other bands beside it`, async ($, on) => {
    await start($, on)
    const ui = await band($, surface)
    const btn = (await ui.find({ key: 'cockpit-usage' })) as unknown as { props: { label: string } } | undefined
    if (surface === 'terminal') expect(btn?.props.label).toMatch(/📊 Usage 😊$/)
    else {
      expect(btn?.props.label).toBe('Usage')
      expect(await crabs(ui)).toEqual(['usage green'])
    }
    expect(await ui.find({ type: 'Text', text: /Context/ })).toBeUndefined()
    expect(await ui.find({ key: 'cockpit-compact' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
    await ui.unmount()
  })

  test(`${surface}: pressing Usage shows the six lines, one row each, and no breakdown`, async ($, on) => {
    const { w } = await start($, on)
    await submit($, 'Fix the bug in parser.py where empty lines crash the import')
    const ui = await band($, surface)
    await ui.press({ key: 'cockpit-usage' })
    for (const label of [/🧠 Context/, /⏱️ 5-hour limit.*resets in 2h 13m/, /📅 7-day limit/, /💵 Session cost.*\$1\.23 of \$5\.00 budget/, /🧊 Cache/, /🤖 Model & effort/])
      expect(await ui.find({ type: 'Text', text: say(surface, label) })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /What uses your tokens/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Top tools/ })).toBeUndefined()
    // The top row, then one row per item.
    const root = (await ui.drawn()) as unknown as { children: unknown[] }
    expect(root.children.length).toBe(7)
    // Collapsing again; the choice is remembered across sessions.
    expect(w.store.get('cockpit.expanded')).toBe(true)
    await ui.press({ key: 'cockpit-usage' })
    expect(await ui.find({ type: 'Text', text: say(surface, /🧠 Context/) })).toBeUndefined()
    expect(w.store.get('cockpit.expanded')).toBe(false)
    await ui.unmount()
  })

  test(`${surface}: the top row reads Usage · Full list · the other bands`, async ($, on) => {
    await start($, on)
    const ui = await band($, surface)
    const order = async () => {
      const out: string[] = []
      const walk = (n: unknown): void => {
        if (!n || typeof n !== 'object') return
        const el = n as { type?: string; props?: Record<string, unknown>; children?: unknown[] }
        if (el.type === 'Button') out.push(String(el.props?.key ?? el.props?.label))
        if (el.type === 'Text' && Array.isArray(el.children) && el.children.join('') === 'engine') out.push('engine')
        for (const c of el.children ?? []) walk(c)
      }
      walk(await ui.drawn())
      return out
    }
    expect(await order()).toEqual(['cockpit-usage', 'cockpit-full', 'engine'])
    await ui.press({ key: 'cockpit-usage' })
    expect((await order()).slice(0, 3)).toEqual(['cockpit-usage', 'cockpit-full', 'engine'])
    await ui.unmount()
  })

  test(`${surface}: at the critical level the mood is angry and Compact now and Handoff show`, async ($, on) => {
    const { w } = await start($, on)
    await measure($, w, 72)
    expect(w.toasts.some(t => /Budget at 72%/.test(t))).toBe(true)
    await measure($, w, 90)
    expect(w.toasts.some(t => /Budget at 90%.*Compact now/.test(t))).toBe(true)
    const ui = await band($, surface)
    const btn = (await ui.find({ key: 'cockpit-usage' })) as unknown as { props: { label: string } } | undefined
    if (surface === 'terminal') expect(btn?.props.label).toMatch(/😡$/)
    else expect((await crabs(ui))[0]).toBe('usage red')
    await ui.press({ key: 'cockpit-usage' })
    expect(await ui.find({ key: 'cockpit-compact' })).toBeDefined()
    expect(await ui.find({ key: 'cockpit-handoff' })).toBeDefined()
    // On the top row, right after Full list.
    const root = (await ui.drawn()) as unknown as { children: { children: { props?: { key?: string } }[] }[] }
    const keys = (root.children[0]?.children ?? []).map(c => c.props?.key).filter(Boolean)
    expect(keys.slice(0, 4)).toEqual(['cockpit-usage', 'cockpit-full', 'cockpit-compact', 'cockpit-handoff'])
    await ui.unmount()
  })
}

test('the band remembers it was expanded in an earlier session', async ($, on) => {
  await start($, on, 30, { store: { 'cockpit.expanded': true } })
  const ui = await band($, 'terminal')
  expect(await ui.find({ type: 'Text', text: /🧠 Context/ })).toBeDefined()
  await ui.unmount()
})

test('a plan limit past the threshold triggers the guard too', async ($, on) => {
  const { w } = await start($, on)
  await measure($, w, 10, 88)
  expect(w.toasts.some(t => /Budget at 88% \(5-hour limit\)/.test(t))).toBe(true)
})

test('Compact now calls the session compaction', async ($, on) => {
  const { w } = await start($, on)
  await measure($, w, 95)
  const ui = await band($, 'terminal')
  await ui.press({ key: 'cockpit-usage' })
  await ui.press({ key: 'cockpit-compact' })
  expect(w.compacted).toBe(1)
  await ui.unmount()
})

test('advisor: "hi" typed by the person on Opus at high is the wrong model, angry', async ($, on) => {
  await start($, on)
  const r = await submit($, 'hi')
  expect((r as { text: string }).text).toBe('hi')
  const ui = await band($, 'terminal')
  const btn = (await ui.find({ key: 'cockpit-usage' })) as unknown as { props: { label: string } } | undefined
  expect(btn?.props.label).toMatch(/😡$/)
  await ui.press({ key: 'cockpit-usage' })
  expect(await ui.find({ type: 'Text', text: /now: Opus 5\.5 · high → try haiku · low · too high/ })).toBeDefined()
  expect(await ui.find({ key: 'cockpit-switch' })).toBeDefined()
  await ui.unmount()
})

test('advisor ignores what the person did not type: notifications, peers, commands, hidden prompts', async ($, on) => {
  await start($, on)
  await submit($, 'hi')
  await submit($, 'Think deeply about the whole architecture and migrate it step by step', 'task-notification')
  await submit($, 'Think deeply about the architecture', 'peer')
  await submit($, '/compact think deeply')
  await $.prompt.submit({ text: 'Think deeply about the architecture', wait: false, isMeta: true, origin: { kind: 'composer' } } as never)
  const ui = await band($, 'terminal')
  await ui.press({ key: 'cockpit-usage' })
  expect(await ui.find({ type: 'Text', text: /try haiku · low/ })).toBeDefined()
  await ui.unmount()
})

test('advisor drops wrapped engine text before classifying', async ($, on) => {
  await start($, on)
  await submit($, 'hi\n<system-reminder>' + 'Think deeply about the architecture. '.repeat(300) + '</system-reminder>')
  const ui = await band($, 'terminal')
  await ui.press({ key: 'cockpit-usage' })
  expect(await ui.find({ type: 'Text', text: /try haiku · low/ })).toBeDefined()
  await ui.unmount()
})

test('debug option logs the origin and length of each submission', { options: { debug: true } }, async ($, on) => {
  const { w } = await start($, on)
  await submit($, 'hi', 'task-notification')
  expect(w.logs.some(l => /origin=task-notification length=2 advised=false/.test(l))).toBe(true)
})

test('Switch changes the model through the /config row, checks it, then sets the effort', async ($, on) => {
  const { w } = await start($, on)
  await submit($, 'hi')
  const ui = await band($, 'terminal')
  await ui.press({ key: 'cockpit-usage' })
  await ui.press({ key: 'cockpit-switch' })
  expect(w.configSets).toEqual([{ key: 'model', value: 'haiku' }])
  expect(w.commands).toContain('effort low')
  expect(w.toasts.some(t => /Switched to haiku, effort low/.test(t))).toBe(true)
  // Now it fits: no Switch button, and a happy face.
  expect(await ui.find({ key: 'cockpit-switch' })).toBeUndefined()
  await ui.unmount()
})

test('Switch says so when the model did not change', async ($, on) => {
  const { w } = await start($, on)
  w.modelSwitchWorks = false
  await submit($, 'hi')
  const ui = await band($, 'terminal')
  await ui.press({ key: 'cockpit-usage' })
  await ui.press({ key: 'cockpit-switch' })
  expect(w.commands).toContain('model haiku')
  expect(w.toasts.some(t => /Model not changed: pick haiku in the model menu/.test(t))).toBe(true)
  await ui.unmount()
})

test('effort is read before the first turn from the /config rows, and again after /effort', async ($, on) => {
  await start($, on, 30, { env: { LANG: 'en_US.UTF-8' } })
  await submit($, 'Fix the bug in parser.py where empty lines crash the import')
  const ui = await band($, 'terminal')
  await ui.press({ key: 'cockpit-usage' })
  expect(await ui.find({ type: 'Text', text: /effort \?/ })).toBeDefined()
  await $.command.run({ command: 'effort', args: 'medium' } as never)
  expect(await ui.find({ type: 'Text', text: /now: Opus 5\.5 · medium → try sonnet · medium · fits/ })).toBeDefined()
  await ui.unmount()
})

test('effort from a /config row when the environment has none', async ($, on) => {
  await start($, on, 30, {
    env: { LANG: 'en_US.UTF-8' },
    rows: [{ key: 'effortLevel', label: 'Effort', kind: 'choice', value: 'xhigh', options: ['low', 'xhigh'], provider: { plugin: 'engine', tier: 'core' }, isLocked: false }],
  })
  const ui = await band($, 'terminal')
  await ui.press({ key: 'cockpit-usage' })
  expect(await ui.find({ type: 'Text', text: /now: Opus 5\.5 · xhigh/ })).toBeDefined()
  await ui.unmount()
})

test('cache line counts down m:ss left, then sleeps when cold', async ($, on) => {
  const { clock } = await start($, on)
  await $.turn.complete({ turnId: 't', answer: 'a', durationMs: 1, isAborted: false, reason: 'answer' } as never)
  await clock.advance(60_000)
  const ui = await band($, 'terminal')
  await ui.press({ key: 'cockpit-usage' })
  expect(await ui.find({ type: 'Text', text: /🧊 Cache 59:00 left \(\?\)/ })).toBeDefined()
  // Unmounted while the hour passes: the 5 s ticks then redraw nothing, so the
  // advance is quick; the band stays expanded and is mounted again after.
  await ui.unmount()
  await clock.advance(60 * 60_000)
  const later = await band($, 'terminal')
  expect(await later.find({ type: 'Text', text: /🧊 Cache cold.*😴/ })).toBeDefined()
  await later.unmount()
})

test('/handoff writes one note with a single cheap call', async ($, on) => {
  const { w } = await start($, on)
  const r = (await $.command.run({ command: 'handoff' } as never)) as { text: string }
  expect(w.completes).toBe(1)
  expect(w.writes.length).toBe(1)
  expect(w.writes[0]?.path).toBe('/repo/handoff/HANDOFF-2026-11-04-2015.md')
  expect(w.writes[0]?.text).toContain('## Goal')
  expect(w.writes[0]?.text).toContain('## Files touched\n- /repo/a.ts')
  expect(r.text).toContain('read handoff/HANDOFF-2026-11-04-2015.md')
})

const BREAKDOWN = (e: { breakdown?: string }) =>
  !e.breakdown
    ? usageAt(30)
    : {
        ...usageAt(30),
        context: {
          ...usageAt(30).context,
          breakdown: {
            categories: [
              { name: 'System prompt', tokens: 4000, color: 'x', isDeferred: false, kind: 'used' },
              { name: 'System tools', tokens: 12000, color: 'x', isDeferred: false, kind: 'used' },
              { name: 'MCP tools', tokens: 9000, color: 'x', isDeferred: false, kind: 'used' },
              { name: 'Skills', tokens: 300, color: 'x', isDeferred: false, kind: 'used' },
              { name: 'Memory files', tokens: 1200, color: 'x', isDeferred: false, kind: 'used' },
              { name: 'Messages', tokens: 280000, color: 'x', isDeferred: false, kind: 'used' },
              { name: 'Free space', tokens: 700000, color: 'x', isDeferred: false, kind: 'free' },
            ],
            totalTokens: 306500,
            maxTokens: 1_000_000,
            rawMaxTokens: 1_000_000,
            autocompactSource: 'auto',
            percentage: 30,
            gridRows: [],
            model: 'claude-opus-5-5',
            memoryFiles: [{ path: '/repo/CLAUDE.md', type: 'Project', tokens: 1200 }],
            mcpTools: [{ name: 'mcp__github__get_me', serverName: 'github', tokens: 9000, isLoaded: true }],
            agents: [],
            skills: { totalSkills: 1, includedSkills: 1, tokens: 300, skillFrontmatter: [{ name: 'pdf', source: 'plugin', tokens: 300 }] },
            isAutoCompactEnabled: true,
            apiUsage: null,
          },
        },
      }

for (const surface of SURFACES) {
  test(`${surface}: Full list opens the "What uses your tokens" pane, and closes it when pressed again`, async ($, on) => {
    const { w, clock } = await start($, on, 30, { usage: BREAKDOWN })
    const ui = await band($, surface)
    await ui.press({ key: 'cockpit-full' })
    await clock.settle()
    expect(w.panes).toEqual([{ id: 'cockpit-tokens', title: 'What uses your tokens' }])
    const pane = await $.ui.mount({ plugin: PLUGIN, surface, ...PANE, requestId: 'cockpit-tokens' } as never)
    for (const re of [/📜 System prompt/, /🔧 System tools/, /🔌 MCP tools/, /🧩 Skills/, /🗂️ Memory files/, /💬 Messages/, /Top tools, skills and subagents/, /🔧 Write/])
      expect(await pane.find({ type: 'Text', text: say(surface, re) })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /Free space/ })).toBeUndefined()
    // The limits stay in the band and in /usage-panel, not here.
    expect(await pane.find({ type: 'Text', text: /5-hour limit/ })).toBeUndefined()
    expect(await pane.find({ key: 'show-all' })).toBeDefined()
    expect(await pane.find({ key: 'refresh' })).toBeDefined()
    if (surface === 'desktop') {
      const kinds = await crabs(pane)
      for (const k of ['system_prompt', 'tools', 'mcp', 'skills', 'memory', 'messages', 'usage']) expect(kinds.some(c => c.startsWith(k + ' '))).toBe(true)
    }
    await pane.unmount()
    await ui.press({ key: 'cockpit-full' })
    expect(w.panes).toEqual([])
    await ui.unmount()
  })

  test(`${surface}: /usage-panel shows the same lines, and Show all adds the full lists`, async ($, on) => {
    const { clock } = await start($, on, 30, { usage: BREAKDOWN })
    await $.command.run({ command: 'usage-panel', args: 'open' } as never)
    await clock.settle()
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...PANE } as never)
    expect(await ui.find({ key: 'refresh' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: say(surface, /⏱️ 5-hour limit/) })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: say(surface, /🔎 What uses your tokens/) })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Estimate:/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: say(surface, /🔌 github/) })).toBeUndefined()
    await ui.press({ key: 'show-all' })
    expect(await ui.find({ type: 'Text', text: say(surface, /🔌 github/) })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: say(surface, /🗂️ repo\/CLAUDE\.md/) })).toBeDefined()
    if (surface === 'desktop') expect((await ui.findAll({ type: 'Svg' })).length).toBeGreaterThan(8)
    await ui.unmount()
  })
}

test('keep-alive is off by default: no ping when the cache nears its TTL', async ($, on) => {
  const { clock, w } = await start($, on)
  await $.turn.complete({ turnId: 't', answer: 'a', durationMs: 1, isAborted: false, reason: 'answer' } as never)
  await clock.advance(5 * 60_000)
  expect(w.forks).toBe(0)
})

test('keep-alive on: pings with a fork before the TTL, at most N times', { options: { keepAlive: true, keepAliveMaxPings: 2, cacheTtl: '5m' } }, async ($, on) => {
  const { clock, w } = await start($, on)
  await $.turn.complete({ turnId: 't', answer: 'a', durationMs: 1, isAborted: false, reason: 'answer' } as never)
  // 5 min TTL: a ping 45 s before the end refreshes the cache; after two, no more.
  await clock.advance(4 * 60_000)
  expect(w.forks).toBe(0)
  await clock.advance(30_000)
  expect(w.forks).toBe(1)
  await clock.advance(16 * 60_000)
  expect(w.forks).toBe(2)
})

test('desktop: each line picks its crab kind and the tone of its own bar', async ($, on) => {
  const { w } = await start($, on, 30, { usage: BREAKDOWN })
  await $.turn.complete({ turnId: 't', answer: 'a', durationMs: 1, isAborted: false, reason: 'answer' } as never)
  await submit($, 'hi')
  w.five = 75
  w.usage = e => {
    const b = BREAKDOWN(e) as ReturnType<typeof usageAt>
    return { ...b, context: { ...b.context, percent: 60, tokens: 600_000 }, rateLimits: usageAt(60, 75).rateLimits }
  }
  await measure($, w, 60, 75)
  const ui = await band($, 'desktop')
  await ui.press({ key: 'cockpit-usage' })
  const got = await crabs(ui)
  // Worst first (the header), then the lines in order: context yellow (60%), 5h orange (75%),
  // 7d green, cost green, cache green, model red (Opus at high for "hi").
  expect(got.slice(0, 7)).toEqual(['usage red', 'context yellow', 'five_hour orange', 'seven_day green', 'cost green', 'cache green', 'model red'])
  expect(got.length).toBe(7)
  await ui.unmount()
})

test('desktop: a cold cache shows the sleeping crab', async ($, on) => {
  const { clock } = await start($, on)
  await $.turn.complete({ turnId: 't', answer: 'a', durationMs: 1, isAborted: false, reason: 'answer' } as never)
  await clock.advance(61 * 60_000)
  const ui = await band($, 'desktop')
  await ui.press({ key: 'cockpit-usage' })
  expect(await crabs(ui)).toContain('cache cold')
  await ui.unmount()
})

test('desktop: at the critical level the guard buttons carry the compact and handoff crabs', async ($, on) => {
  const { w } = await start($, on)
  await measure($, w, 92)
  const ui = await band($, 'desktop')
  await ui.press({ key: 'cockpit-usage' })
  const got = await crabs(ui)
  expect(got).toContain('compact red')
  expect(got).toContain('handoff orange')
  expect(got).toContain('context red')
  expect((await ui.find({ key: 'cockpit-compact' }) as unknown as { props: { label: string } }).props.label).toBe('Compact now')
  await ui.unmount()
})

test('advisor: the owner\'s complex prompt gets opus · high with its reasons, and "yes" keeps it', async ($, on) => {
  await start($, on)
  await submit($, 'i have a too complex app that needs a lot of analysing and a lot of coding knowledge and that has a lot of bugs so help me in it')
  const ui = await band($, 'terminal')
  await ui.press({ key: 'cockpit-usage' })
  expect(await ui.find({ type: 'Text', text: /try opus · high · fits · why: complex · many bugs · whole app/ })).toBeDefined()
  await submit($, 'yes')
  expect(await ui.find({ type: 'Text', text: /try opus · high · fits · why: follow-up of the task/ })).toBeDefined()
  await ui.unmount()
})

test('advisor: the AI check is off by default', async ($, on) => {
  const { w } = await start($, on)
  await submit($, 'debug why the login API returns 500 errors for some users and review the auth code')
  expect(w.completes).toBe(0)
})

test('advisor: with advisorAi on, an ambiguous prompt gets one Haiku check and its cost shows', { options: { advisorAi: true } }, async ($, on) => {
  const { w, clock } = await start($, on)
  await submit($, 'hi')
  expect(w.completes).toBe(0)
  await submit($, 'debug why the login API returns 500 errors for some users and review the auth code')
  await clock.settle()
  expect(w.completes).toBe(1)
  const ui = await band($, 'terminal')
  await ui.press({ key: 'cockpit-usage' })
  expect(await ui.find({ type: 'Text', text: /AI check ≈\$0\.00/ })).toBeDefined()
  await ui.unmount()
})

for (const [cols, maxRows, ctx] of [[60, 12, 62], [60, 8, 62], [60, 6, 62], [140, 7, 62], [140, 5, 62], [100, 4, 62], [60, 9, 92], [60, 6, 92]] as const) {
  test(`desktop: at ${cols} columns and maxRows ${maxRows} (context ${ctx}%) the expanded band fits the window, Switch included`, async ($, on) => {
    const { w } = await start($, on)
    // "hi" on Opus at high: the wrong model, so the Switch button shows.
    await submit($, 'hi')
    await measure($, w, ctx, 74)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: { ...BAND.props, bodyColumns: cols, maxRows } } as never)
    await ui.press({ key: 'cockpit-usage' })
    const rows = bandRows(await ui.drawn(), cols)
    expect(rows).toBeLessThanOrEqual(maxRows)
    // Every item is still there, and the Switch button with it.
    for (const label of [/Context|ctx/, /5-hour limit|5h/, /7-day limit|7d/, /Session cost|\$1\.23/, /Model & effort|→ haiku·low/])
      expect(await ui.find({ type: 'Text', text: label })).toBeDefined()
    expect(await ui.find({ key: 'cockpit-switch' })).toBeDefined()
    await ui.unmount()
  })
}

// Rows a drawn band takes, as a surface lays it out: a column adds its children,
// a row takes its tallest child; a Text wraps at the row's width (its letters
// over the columns left beside the fixed-width icons, bars and buttons).
function bandRows(tree: unknown, cols: number): number {
  type El = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
  const textOf = (n: unknown): string =>
    typeof n === 'string' ? n : n && typeof n === 'object' ? ((n as El).children ?? []).map(textOf).join('') : ''
  const fixedCols = (n: El): number =>
    n.type === 'Svg' ? Math.ceil(Number(n.props?.width ?? 0) / 8) : n.type === 'Button' ? String(n.props?.label ?? '').length + 4 : (n.children ?? []).reduce((a: number, c) => a + (c && typeof c === 'object' && (c as El).type !== 'Text' ? fixedCols(c as El) : 0), 0)
  const rows = (n: unknown, width: number): number => {
    if (!n || typeof n !== 'object') return 0
    const el = n as El
    const kids = (el.children ?? []).filter(c => c && typeof c === 'object') as El[]
    if (el.type === 'Text') return Math.max(1, Math.ceil(textOf(el).length / Math.max(8, width)))
    if (el.type === 'Svg') return Math.max(1, Math.ceil(Number(el.props?.height ?? 0) / 28))
    if (el.type === 'Button') return 1
    if (el.props?.flexDirection === 'row' || el.props?.flexDirection === 'row-reverse') {
      const fixed = kids.reduce((a, c) => a + (c.type === 'Text' || (c.type === 'Box' && c.children?.some(k => (k as El).type === 'Text')) ? 0 : fixedCols(c) + 1), 0)
      if (el.props?.flexWrap === 'wrap') {
        // Wrapping rows: lay the children out greedily.
        let line = 0
        let count = 1
        for (const c of kids) {
          const wc = c.type === 'Text' ? textOf(c).length : fixedCols(c) + 1
          if (line + wc > width && line > 0) ((count += 1), (line = 0))
          line += wc
        }
        return count
      }
      return Math.max(1, ...kids.map(c => rows(c, width - fixed)))
    }
    return kids.reduce((a, c) => a + rows(c, width), 0)
  }
  return rows(tree, cols)
}
