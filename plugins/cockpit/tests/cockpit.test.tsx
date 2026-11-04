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
    model: 'claude-opus-5-5', configSets: [], commands: [], logs: [], modelSwitchWorks: true,
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
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.panes', () => ({ value: [] }) as never)
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

const band = ($: Engine, surface: 'terminal' | 'desktop') => $.ui.mount({ plugin: PLUGIN, surface, ...BAND } as never)

for (const surface of SURFACES) {
  test(`${surface}: collapsed, the band is one Usage button with a mood, the other bands beside it`, async ($, on) => {
    await start($, on)
    const ui = await band($, surface)
    const btn = (await ui.find({ key: 'cockpit-usage' })) as unknown as { props: { label: string } } | undefined
    expect(btn?.props.label).toMatch(/📊 Usage 😊$/)
    expect(await ui.find({ type: 'Text', text: /Context/ })).toBeUndefined()
    expect(await ui.find({ key: 'cockpit-compact' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
    await ui.unmount()
  })

  test(`${surface}: pressing Usage shows every item on its own line, and the breakdown`, async ($, on) => {
    const { w } = await start($, on)
    await submit($, 'Fix the bug in parser.py where empty lines crash the import')
    const ui = await band($, surface)
    await ui.press({ key: 'cockpit-usage' })
    for (const label of [/🧠 Context/, /⏱️ 5-hour limit.*resets in 2h 13m/, /📅 7-day limit/, /💵 Session cost.*\$1\.23 of \$5\.00 budget/, /🧊 Cache/, /🤖 Model & effort/, /🔎 What uses your tokens/])
      expect(await ui.find({ type: 'Text', text: label })).toBeDefined()
    // Collapsing again; the choice is remembered across sessions.
    expect(w.store.get('cockpit.expanded')).toBe(true)
    await ui.press({ key: 'cockpit-usage' })
    expect(await ui.find({ type: 'Text', text: /🧠 Context/ })).toBeUndefined()
    expect(w.store.get('cockpit.expanded')).toBe(false)
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
    expect(btn?.props.label).toMatch(/😡$/)
    await ui.press({ key: 'cockpit-usage' })
    expect(await ui.find({ key: 'cockpit-compact' })).toBeDefined()
    expect(await ui.find({ key: 'cockpit-handoff' })).toBeDefined()
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
  await clock.advance(60 * 60_000)
  expect(await ui.find({ type: 'Text', text: /🧊 Cache cold.*😴/ })).toBeDefined()
  await ui.unmount()
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
  test(`${surface}: the expanded band lists what uses the tokens, with icons`, async ($, on) => {
    await start($, on, 30, { usage: BREAKDOWN })
    const ui = await band($, surface)
    await ui.press({ key: 'cockpit-usage' })
    for (const re of [/📜 System prompt/, /🔧 System tools/, /🔌 MCP tools/, /🧩 Skills/, /🗂️ Memory files/, /💬 Messages/, /Top tools, skills and subagents/, /🔧 Write/])
      expect(await ui.find({ type: 'Text', text: re })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Free space/ })).toBeUndefined()
    await ui.unmount()
  })

  test(`${surface}: /usage-panel shows the same lines, and Show all adds the full lists`, async ($, on) => {
    await start($, on, 30, { usage: BREAKDOWN })
    await $.command.run({ command: 'usage-panel', args: 'open' } as never)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...PANE } as never)
    expect(await ui.find({ key: 'refresh' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /⏱️ 5-hour limit/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /🔎 What uses your tokens/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Estimate:/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /🔌 github/ })).toBeUndefined()
    await ui.press({ key: 'show-all' })
    expect(await ui.find({ type: 'Text', text: /🔌 github/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /🗂️ repo\/CLAUDE\.md/ })).toBeDefined()
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

test('keep-alive on: pings with a fork before the TTL, at most N times', { options: { keepAlive: true, keepAliveMaxPings: 2 } }, async ($, on) => {
  const { clock, w } = await start($, on)
  await $.turn.complete({ turnId: 't', answer: 'a', durationMs: 1, isAborted: false, reason: 'answer' } as never)
  // 1h TTL on a subscription (limits are reported): pings start 3 min before the end.
  for (let i = 0; i < 6 * 12; i++) await clock.advance((60 * 60_000) / 12)
  expect(w.forks).toBe(2)
})
