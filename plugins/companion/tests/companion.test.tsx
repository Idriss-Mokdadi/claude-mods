import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PLUGIN = 'companion'
const NOW = Date.parse('2026-11-17T20:00:00Z')
const MIN = 60_000

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 6, bodyColumns: 120, scroll: { offset: 0, bodyRows: 6 }, view: {} },
} as const
const BACKDROP = {
  component: 'Backdrop',
  props: { scene: 'lagoon', plugin: 'companion', glass: { blur: 12, opacity: 0.55 } },
} as const

type World = {
  toasts: string[]
  plays: { asset?: string; gain?: number }[]
  themeSets: unknown[]
  themeClears: number
  store: Map<string, unknown>
  model: string
  five: number
  seven: number
  tool: (e: { tool: string; command?: string }) => unknown
  compactGate: Promise<void> | null
}

type Setup = { store?: Record<string, unknown>; model?: string; five?: number; seven?: number; env?: Record<string, string> }

async function start($: Engine, on: On, setup: Setup = {}) {
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, setup.env ?? { LANG: 'en_US.UTF-8' })
  const w: World = {
    toasts: [],
    plays: [],
    themeSets: [],
    themeClears: 0,
    store: new Map(Object.entries(setup.store ?? {})),
    model: setup.model ?? 'claude-opus-5-5',
    five: setup.five ?? 12,
    seven: setup.seven ?? 25,
    tool: () => ({ result: 'ok' }),
    compactGate: null,
  }
  on('ui.render', ($e, e) => {
    const { Text } = $e.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  on('session.measure', (_$, e) => ({ changed: e.changed }) as never)
  on('session.model', () => ({ value: w.model }) as never)
  on('session.usage', () => ({
    value: {
      startedAt: NOW,
      context: { tokens: 1000, window: 200_000, percent: 1 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: w.five, resetsAt: '2026-11-17T23:00:00Z' },
        { kind: 'seven_day', percentUsed: w.seven, resetsAt: '2026-11-20T10:00:00Z' },
      ],
      cost: { usd: 0.5 },
    },
  }) as never)
  on('settings.read', async () => ({ value: {} }) as never)
  on('command.register', (_$, e) => ({ value: { command: e.name } }) as never)
  on('command.run', () => ({ text: 'ran' }) as never)
  on('store.get', (_$, e) => ({ value: w.store.get((e as { key: string }).key) }) as never)
  on('store.set', (_$, e) => {
    const { key, value } = e as { key: string; value: unknown }
    w.store.set(key, value)
    return { value: undefined } as never
  })
  on('theme.set', (_$, e) => {
    w.themeSets.push(e)
    return { value: { isDrawn: true, requestId: 'backdrop' } } as never
  })
  on('theme.clear', () => {
    w.themeClears += 1
    return { value: { isDrawn: false, reason: 'cleared' } } as never
  })
  on('audio.play', (_$, e) => {
    const a = e as unknown as { clip?: { asset?: string }; gain?: number }
    w.plays.push({ asset: a.clip?.asset, gain: a.gain })
    return { value: undefined } as never
  })
  on('ui.toast', (_$, e) => {
    w.toasts.push(e.text)
    return { value: undefined } as never
  })
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('tool.call', (_$, e) => w.tool(e as never) as never)
  on('classic.Notification', () => ({}) as never)
  on('session.compact', async () => {
    if (w.compactGate) await w.compactGate
    return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] } as never
  })
  await $.session.start({ source: 'startup', cwd: '/repo', surface: 'desktop', isInteractive: true } as never)
  return { clock, w }
}

const measure = ($: Engine, five: number, seven: number) =>
  ($.session as unknown as { measure: (e: unknown) => Promise<unknown> }).measure({
    startedAt: NOW,
    context: { tokens: 1000, window: 200_000, percent: 1 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: five },
      { kind: 'seven_day', percentUsed: seven },
    ],
    changed: ['rateLimits'],
  })

const turnStart = ($: Engine, agentId?: string) => $.turn.start({ text: 'go', turnId: `t-${agentId ?? 'main'}`, ...(agentId ? { agentId } : {}) } as never)
const turnEnd = ($: Engine, o: { agentId?: string; reason?: string; durationMs?: number } = {}) =>
  $.turn.complete({
    turnId: `t-${o.agentId ?? 'main'}`,
    answer: 'ok',
    durationMs: o.durationMs ?? 1000,
    isAborted: o.reason === 'aborted',
    reason: o.reason ?? 'answer',
    ...(o.agentId ? { agentId: o.agentId } : {}),
  } as never)
const bash = ($: Engine, command: string) => $.tool.call({ tool: 'Bash', command } as never)

// The Lagoon's SVG source as the desktop draws it.
async function scene($: Engine, surface: 'desktop' | 'mobile' = 'desktop'): Promise<string> {
  const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...BACKDROP } as never)
  const svg = (await ui.find({ type: 'Svg' })) as unknown as { props: { source: string; alt: string } } | undefined
  await ui.unmount()
  return svg?.props.source ?? ''
}
const count = (s: string, re: RegExp) => (s.match(new RegExp(re.source, 'g')) ?? []).length
const band = ($: Engine, surface: 'terminal' | 'desktop', props: Record<string, unknown> = {}) =>
  $.ui.mount({ plugin: PLUGIN, surface, ...BAND, props: { ...BAND.props, ...props } } as never)
// The band's word: its first Text that is not the stand-in for the bands beneath.
async function moodText(ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }): Promise<string> {
  return (await ui.findAll({ type: 'Text' })).map(t => t.text).find(t => t !== 'engine') ?? ''
}
async function word($: Engine, surface: 'terminal' | 'desktop' = 'desktop'): Promise<string> {
  const ui = await band($, surface)
  const t = await moodText(ui as never)
  await ui.unmount()
  return t
}

// ---------------------------------------------------------------------------
// The Lagoon's mappings.

test('5-hour limit: water bands fill from the bottom, one per started 10%', async ($, on) => {
  await start($, on, { five: 12 })
  let s = await scene($)
  expect(count(s, /class="band on/)).toBe(2)
  expect(s).toContain('5h 12%')
  await measure($, 55, 25)
  s = await scene($)
  expect(count(s, /class="band on/)).toBe(6)
  // The highest lit band shimmers.
  expect(s).toMatch(/class="band on top" data-band="5"/)
  await measure($, 100, 25)
  s = await scene($)
  expect(count(s, /class="band on/)).toBe(10)
  await measure($, 0, 25)
  expect(count(await scene($), /class="band on/)).toBe(0)
})

test('7-day limit: ten shells on the sand light up one by one', async ($, on) => {
  await start($, on, { seven: 25 })
  let s = await scene($)
  expect(count(s, /class="shell on"/)).toBe(3)
  expect(count(s, /data-shell=/)).toBe(10)
  expect(s).toContain('7d 25%')
  await measure($, 12, 71)
  s = await scene($)
  expect(count(s, /class="shell on"/)).toBe(8)
})

test('cache age: sun to moon, crabs fall asleep one by one, all asleep when cold', async ($, on) => {
  const { clock } = await start($, on)
  await turnStart($)
  await turnEnd($)
  // A subscription (limits reported): 1-hour TTL.
  let s = await scene($)
  expect(s).toContain('data-sky="sun"')
  expect(count(s, /class="crab c\d sleep/)).toBe(0)
  await clock.advance(20 * MIN)
  expect(count(await scene($), /class="crab c\d sleep/)).toBe(1)
  await clock.advance(20 * MIN)
  s = await scene($)
  expect(count(s, /class="crab c\d sleep/)).toBe(2)
  expect(s).toContain('data-sky="sun"')
  await clock.advance(21 * MIN)
  s = await scene($)
  expect(count(s, /class="crab c\d sleep/)).toBe(3)
  expect(s).toContain('data-sky="moon"')
  expect(await word($)).toBe('sleeping')
  // A new turn wakes everyone.
  await turnStart($)
  s = await scene($)
  expect(count(s, /class="crab c\d sleep/)).toBe(0)
  expect(s).toContain('data-sky="sun"')
})

test('cache age follows the 5-minute TTL when set', { options: { cacheTtl: '5m' } }, async ($, on) => {
  const { clock } = await start($, on)
  await turnStart($)
  await turnEnd($)
  await clock.advance(5 * MIN + 2000)
  expect(count(await scene($), /class="crab c\d sleep/)).toBe(3)
})

test('subagents: one jellyfish each; green and away when done, red flicker on failure, then gone', async ($, on) => {
  const { clock } = await start($, on)
  await turnStart($)
  for (const id of ['a1', 'a2', 'a3']) await turnStart($, id)
  let s = await scene($)
  expect(count(s, /data-agent="run"/)).toBe(3)
  await turnEnd($, { agentId: 'a1' })
  await turnEnd($, { agentId: 'a3', reason: 'error' })
  s = await scene($)
  expect(count(s, /data-agent="run"/)).toBe(1)
  expect(count(s, /data-agent="done"/)).toBe(1)
  expect(count(s, /data-agent="fail"/)).toBe(1)
  expect(s).toContain('#6ee7a2')
  await clock.advance(7000)
  s = await scene($)
  expect(count(s, /data-agent=/)).toBe(1)
})

test('tasks: the sandcastle grows one level per done step, a flag when all are done', async ($, on) => {
  const { w } = await start($, on)
  const todos = (done: number, total: number) =>
    Array.from({ length: total }, (_, i) => ({ content: `step ${i}`, activeForm: `step ${i}`, status: i < done ? 'completed' : 'pending' }))
  await $.tool.call({ tool: 'TodoWrite', todos: todos(1, 3) } as never)
  let s = await scene($)
  expect(count(s, /data-level=/)).toBe(1)
  expect(s).not.toContain('data-flag')
  await $.tool.call({ tool: 'TodoWrite', todos: todos(2, 3) } as never)
  expect(count(await scene($), /data-level=/)).toBe(2)
  await $.tool.call({ tool: 'TodoWrite', todos: todos(3, 3) } as never)
  s = await scene($)
  expect(count(s, /data-level=/)).toBe(3)
  expect(s).toContain('data-flag')
  // All done is a celebration.
  expect(s).toContain('class="party"')
  expect(w.plays.some(p => p.asset === 'assets/happy.wav')).toBe(true)
})

test('tasks from TaskCreate and TaskUpdate build the castle too', async ($, on) => {
  const { w } = await start($, on)
  let n = 0
  w.tool = e => (e.tool === 'TaskCreate' ? { result: { task: { id: String(++n), subject: 's' } } } : { result: { success: true } })
  await $.tool.call({ tool: 'TaskCreate', subject: 'a', description: 'a' } as never)
  await $.tool.call({ tool: 'TaskCreate', subject: 'b', description: 'b' } as never)
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' } as never)
  let s = await scene($)
  expect(count(s, /data-level=/)).toBe(1)
  expect(s).not.toContain('data-flag')
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'completed' } as never)
  s = await scene($)
  expect(count(s, /data-level=/)).toBe(2)
  expect(s).toContain('data-flag')
})

for (const [tool, act, mood, extra] of [
  ['Read', 'read', 'reading', { file_path: '/repo/a.ts' }],
  ['Grep', 'read', 'reading', { pattern: 'x' }],
  ['Edit', 'edit', 'editing', { file_path: '/repo/a.ts', old_string: 'a', new_string: 'b' }],
  ['Write', 'edit', 'editing', { file_path: '/repo/a.ts', content: 'x' }],
  ['Bash', 'bash', 'running', { command: 'ls' }],
  ['WebSearch', 'web', 'working', { query: 'tides' }],
] as const) {
  test(`activity: ${tool} puts the ${act} prop on a crab and the band says ${mood}`, async ($, on) => {
    await start($, on)
    await turnStart($)
    await $.tool.call({ tool, ...extra } as never)
    expect(await scene($)).toContain(`data-act="${act}"`)
    expect(await word($)).toBe(mood)
    await turnEnd($)
    expect(await scene($)).not.toContain('data-act=')
    expect(await word($)).toBe('done')
  })
}

test('confused crab: a hard task on a small model shows a "?"; a fitting model does not', async ($, on) => {
  const { w } = await start($, on, { model: 'claude-haiku-5-5' })
  await $.prompt.submit({ text: 'Refactor the architecture of the auth service and debug the race condition', wait: false, origin: { kind: 'composer' } } as never)
  expect(await scene($)).toContain('class="q"')
  await $.prompt.submit({ text: 'rename foo to bar', wait: false, origin: { kind: 'composer' } } as never)
  expect(await scene($)).not.toContain('class="q"')
  w.model = 'claude-opus-5-5'
  await $.prompt.submit({ text: 'Refactor the architecture of the auth service', wait: false, origin: { kind: 'composer' } } as never)
  expect(await scene($)).not.toContain('class="q"')
})

test('angry crab: a failed tool turns a crab red with steam, then it calms down', async ($, on) => {
  const { w, clock } = await start($, on)
  await turnStart($)
  w.tool = () => ({ result: 'boom', isError: true })
  await bash($, 'false')
  let s = await scene($)
  expect(s).toMatch(/class="crab c0 aw angry"/)
  expect(count(s, /class="steam/)).toBe(3)
  expect(await word($)).toBe('error')
  await clock.advance(9000)
  expect(await scene($)).not.toMatch(/class="crab c0 aw angry"/)
  expect(await word($)).toBe('running')
})

test('angry crab at the critical limit, with the limit as the word', async ($, on) => {
  await start($, on)
  await measure($, 95, 40)
  expect(await scene($)).toContain('angry')
  expect(await word($)).toBe('limit 95%')
})

test('compaction: crabs squeeze into a bucket, then pop out', async ($, on) => {
  const { w, clock } = await start($, on)
  let open = () => {}
  w.compactGate = new Promise<void>(r => (open = r))
  const running = $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'hi', toolUses: [] }] } as never)
  await clock.settle()
  let s = await scene($)
  expect(s).toContain('data-compact="in"')
  expect(count(s, /class="crab c\d [a-z]+ cin"/)).toBe(3)
  open()
  await running
  s = await scene($)
  expect(s).toContain('data-compact="out"')
  expect(count(s, / cout"/)).toBe(3)
  await clock.advance(3000)
  expect(await scene($)).not.toContain('data-compact')
})

test('handoff: a crab packs a suitcase and walks off, then comes back', async ($, on) => {
  const { clock } = await start($, on)
  await $.command.run({ command: 'handoff', args: '' } as never)
  let s = await scene($)
  expect(s).toMatch(/class="crab c2 aw ho"/)
  expect(s).toContain('class="case"')
  await clock.advance(7000)
  s = await scene($)
  expect(s).not.toContain(' ho"')
})

test('celebrations: tests passing after a failure, and a commit; at most one per 30 s', async ($, on) => {
  const { w, clock } = await start($, on)
  w.tool = () => ({ result: 'fail', isError: true })
  await bash($, 'npm test')
  expect(await scene($)).not.toContain('class="party"')
  w.tool = () => ({ result: 'ok' })
  await bash($, 'npm test')
  expect(await scene($)).toContain('class="party"')
  expect(await word($)).toBe('party!')
  expect(w.plays.filter(p => p.asset === 'assets/happy.wav').length).toBe(1)
  // A pass after a pass is no news.
  await clock.advance(31_000)
  await bash($, 'npm test')
  expect(await scene($)).not.toContain('class="party"')
  // A commit right after is rate limited, then allowed.
  await bash($, 'git commit -m "x"')
  expect(w.plays.filter(p => p.asset === 'assets/happy.wav').length).toBe(2)
  await bash($, 'git commit -m "y"')
  expect(w.plays.filter(p => p.asset === 'assets/happy.wav').length).toBe(2)
  await clock.advance(9000)
  expect(await scene($)).not.toContain('class="party"')
})

test('celebrations can be turned off', { options: { celebrations: false } }, async ($, on) => {
  const { w } = await start($, on)
  await bash($, 'git commit -m "x"')
  expect(await scene($)).not.toContain('class="party"')
  expect(w.plays.length).toBe(0)
})

// ---------------------------------------------------------------------------
// Done alerts.

test('done alert: toast and chirp after a long turn, none after a short one', async ($, on) => {
  const { w } = await start($, on)
  await turnStart($)
  await turnEnd($, { durationMs: 5000 })
  expect(w.toasts).toEqual([])
  expect(w.plays).toEqual([])
  await turnStart($)
  await turnEnd($, { durationMs: 95_000 })
  expect(w.toasts).toContain('Claude is done (1m 35s)')
  expect(w.plays).toEqual([{ asset: 'assets/chirp.wav', gain: 1.05 }])
})

test('waiting alert: a permission prompt or a question chirps once and the band says so', async ($, on) => {
  const { w } = await start($, on)
  await turnStart($)
  await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' } as never)
  expect(w.toasts).toContain('Claude is waiting for you')
  expect(w.plays.length).toBe(1)
  expect(await word($)).toBe('waiting for you')
  // Moving on clears it.
  await $.tool.call({ tool: 'Read', file_path: '/repo/a' } as never)
  expect(await word($)).toBe('reading')
})

test('the sound setting and the 🔔 toggle silence the chirps', async ($, on) => {
  const { w } = await start($, on)
  const ui = await band($, 'desktop')
  await ui.press({ key: 'companion-sound' })
  expect(w.store.get('companion.sound')).toBe(false)
  expect(((await ui.find({ key: 'companion-sound' })) as unknown as { props: { label: string } }).props.label).toBe('🔕')
  await ui.unmount()
  await turnStart($)
  await turnEnd($, { durationMs: 95_000 })
  expect(w.toasts).toEqual(['Sound off', 'Claude is done (1m 35s)'])
  expect(w.plays.length).toBe(0)
})

test('volume sets the gain', { options: { volume: 20, alertSeconds: 10 } }, async ($, on) => {
  const { w } = await start($, on)
  await turnStart($)
  await turnEnd($, { durationMs: 11_000 })
  expect(Math.round((w.plays[0]?.gain ?? 0) * 100)).toBe(30)
})

// ---------------------------------------------------------------------------
// Toggles.

test('the Lagoon is set at start with glass, and 🌊 switches it off and on, remembered', async ($, on) => {
  const { w } = await start($, on)
  expect(w.themeSets).toEqual([{ backdrop: { scene: 'lagoon', glass: { blur: 12, opacity: 0.55 } } }])
  const ui = await band($, 'desktop')
  await ui.press({ key: 'companion-theme' })
  expect(w.themeClears).toBe(1)
  expect(w.store.get('companion.theme')).toBe(false)
  expect(w.toasts).toContain('Lagoon off')
  await ui.press({ key: 'companion-theme' })
  expect(w.themeSets.length).toBe(2)
  expect(w.store.get('companion.theme')).toBe(true)
  await ui.unmount()
})

test('/theme on|off|toggle, and a Lagoon left off stays off next session', async ($, on) => {
  const { w } = await start($, on, { store: { 'companion.theme': false } })
  expect(w.themeSets.length).toBe(0)
  expect(w.themeClears).toBe(0)
  expect(await $.command.run({ command: 'theme', args: 'on' } as never)).toEqual({ text: 'Lagoon on' })
  expect(await $.command.run({ command: 'theme', args: 'off' } as never)).toEqual({ text: 'Lagoon off' })
  expect(await $.command.run({ command: 'lagoon', args: 'toggle' } as never)).toEqual({ text: 'Lagoon on' })
  expect(((await $.command.run({ command: 'lagoon', args: 'blue' } as never)) as { text: string }).text).toMatch(/Usage/)
  // Anything else on /theme is Claude Code's own command.
  expect(await $.command.run({ command: 'theme', args: '' } as never)).toEqual({ text: 'ran' })
  expect(w.themeSets.length).toBe(2)
  expect(w.themeClears).toBe(1)
})

// ---------------------------------------------------------------------------
// The scene document.

test('desktop draws a strip of the set width; mobile the full screen; another scene is left alone', { options: { stripWidth: 300 } }, async ($, on) => {
  await start($, on)
  const d = await scene($, 'desktop')
  expect(d).toContain('<clipPath id="strip"><rect x="0" y="0" width="300" height="100%"/>')
  expect(d).toContain('preserveAspectRatio="xMidYMax meet"')
  const m = await scene($, 'mobile')
  expect(m).not.toContain('clipPath')
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Backdrop', props: { ...BACKDROP.props, plugin: 'other' } } as never)
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})

test('the scene stays pure vector, under the size limit, and still under reduced motion', async ($, on) => {
  await start($, on)
  await turnStart($)
  for (const id of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']) await turnStart($, id)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m x' } as never)
  await measure($, 95, 95)
  const s = await scene($)
  expect(s.length).toBeLessThan(131_072)
  for (const bad of ['href', '<image', 'data:', 'foreignObject', '@import', '@font-face', '--', '\\', 'CDATA']) {
    // `--` only as CSS custom properties.
    if (bad === '--') expect(s.replace(/--(dx|bx|d)\b/g, '')).not.toContain('--')
    else expect(s).not.toContain(bad)
  }
  expect(s).toContain('@media (prefers-reduced-motion: reduce){*{animation:none!important}')
})

// ---------------------------------------------------------------------------
// The band.

test('terminal: the band is the text crab and its word only', async ($, on) => {
  await start($, on)
  const ui = await band($, 'terminal')
  expect(await moodText(ui as never)).toBe('(▣) ready')
  expect(await ui.find({ key: 'companion-theme' })).toBeUndefined()
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})

test('desktop: crab, word, 🌊 and 🔔 on one row that fits maxRows 1, other bands after', async ($, on) => {
  await start($, on)
  const ui = await band($, 'desktop', { maxRows: 1 })
  const root = (await ui.find({ key: 'companion-band' })) as unknown as { props: Record<string, unknown> }
  expect(root.props.flexWrap).toBe('nowrap')
  expect(root.props.flexDirection).toBe('row')
  const svg = (await ui.find({ type: 'Svg' })) as unknown as { props: { alt: string } }
  expect(svg.props.alt).toBe('crab: ready')
  expect(await ui.find({ key: 'companion-theme' })).toBeDefined()
  expect(await ui.find({ key: 'companion-sound' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  await ui.unmount()
})

test('French and Arabic words; Arabic runs right to left', { options: { language: 'ar' } }, async ($, on) => {
  await start($, on)
  const ui = await band($, 'desktop')
  const root = (await ui.find({ key: 'companion-band' })) as unknown as { props: Record<string, unknown> }
  expect(root.props.flexDirection).toBe('row-reverse')
  expect(await moodText(ui as never)).toBe('جاهز')
  await ui.unmount()
})

test('French follows the locale', async ($, on) => {
  const { w } = await start($, on, { env: { LANG: 'fr_FR.UTF-8' } })
  await turnStart($)
  await turnEnd($, { durationMs: 40_000 })
  expect(w.toasts).toContain('Claude a terminé (40s)')
  expect(await word($)).toBe('terminé')
})
