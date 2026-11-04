import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

// Tests for what savvy-progress-plus adds to savvy-progress: languages, the band for
// any multi-step work, effort fit, budget warnings, the totals and the narrow layout.

const PLUGIN = 'savvy-progress-plus'
const PROGRESS = 'mcp__savvy-progress-plus__progress'
const band = (bodyColumns = 100) => ({ hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns, scroll: { offset: 0, bodyRows: 4 }, view: {} })
const pane = (bodyColumns = 60) => ({ title: '', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }) as const

type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }

// What the next model request reports; `step` sets it before running one.
let usageNext: Usage | null = null
const MODEL = 'claude-opus-5-5'

// Stands for the engine's own drawing beneath the plugin: an empty row.
const drawsNothing = (on: On) =>
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

// The engine beneath the plugin: spawns answer agent ids a1, a2, ... in order.
const engine = (on: On) => {
  mock.clock(on)
  drawsNothing(on)
  let n = 0
  usageNext = null
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', () => ({ model: MODEL, agentId: `a${++n}` }))
  on('turn.complete', () => ({ text: '' }) as never)
  on('turn.step', async function* () {
    return { turnId: 'turn', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: usageNext ? { model: MODEL, ...usageNext } : null } as never
  })
}

const toastsOf = (on: On): string[] => {
  const toasts: string[] = []
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined } as never
  })
  return toasts
}

const spawn = ($: Engine, description: string, subagentType = 'general-purpose', prompt = 'p') =>
  $.agent.spawn({ tool_use_id: `t-${description}`, prompt, description, subagentType, provider: 'engine', parentModel: 'claude-opus-5-5', background: true, fork: false } as never)

// One model request of agent `agentId`, reporting `usage` and `effort`.
const step = async ($: Engine, agentId: string, usage: Usage | null, effort?: string) => {
  usageNext = usage
  const stream = ($.turn.step as (e: unknown) => AsyncIterable<unknown>)({ turnId: 'turn', index: 0, model: MODEL, messageCount: 1, agentId, effort })
  for await (const _ of stream) void _
}

const finish = ($: Engine, agentId: string) =>
  ($.turn.complete as (e: unknown) => Promise<unknown>)({ agentId, reason: 'answer', answer: 'ok' })

const bandText = async ($: Engine, surface: 'terminal' | 'desktop' | 'mobile', columns = 100) => {
  const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: band(columns) })
  const svg = await ui.findAll({ type: 'Svg' })
  const texts = await ui.findAll({ type: 'Text' })
  const out = [...svg.map(el => `${String(el.props.alt)}\n${String(el.props.source)}`), ...texts.map(el => el.text ?? '')].join('\n')
  await ui.unmount()
  return out
}

const paneSvgs = async ($: Engine, surface: 'desktop' | 'mobile', columns = 60) => {
  const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'crew', props: pane(columns) })
  const svgs = (await ui.findAll({ type: 'Svg' })).map(el => ({
    alt: String(el.props.alt),
    source: String(el.props.source),
    width: Number(el.props.width),
    height: Number(el.props.height),
  }))
  await ui.unmount()
  return svgs.filter(s => s.alt !== 'dotted grid')
}

// --- 1. Languages ------------------------------------------------------------

const startIn = async ($: Engine, on: On, env: Record<string, string>) => {
  mock.clock(on)
  mock.env(on, env)
  on('settings.read', async () => ({ value: {} }) as never)
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.session.start({ source: 'startup', cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
}

test('language: fr draws French words', { options: { language: 'fr' } }, async ($, on) => {
  await startIn($, on, {})
  expect(await $.tool.call({ tool: PROGRESS, title: 'Livrer', phase: 'delegate', total: 4, done: 1 } as never)).toMatchObject({ result: 'ok: Tâches 1/4' })
  expect(await bandText($, 'terminal')).toContain('Tâches 1/4')
})

test('language: auto picks French from the locale', async ($, on) => {
  await startIn($, on, { LANG: 'fr_FR.UTF-8' })
  expect(await $.tool.call({ tool: PROGRESS, title: 'Livrer', phase: 'review', total: 2, done: 1 } as never)).toMatchObject({ result: 'ok: Revue 1/2' })
})

test('language: ar draws Arabic right to left, like Hebrew', { options: { language: 'ar' } }, async ($, on) => {
  await startIn($, on, {})
  await $.tool.call({ tool: PROGRESS, title: 'إطلاق', phase: 'delegate', total: 4, done: 1 } as never)
  const drawn = await bandText($, 'desktop')
  expect(drawn).toContain('المهام 1/4')
  expect(drawn).toContain('direction="rtl"')
  // The crab faces left: mirrored with a negative x scale.
  expect(drawn).toMatch(/scale\(-0\.8,0\.8\)/)
})

test('language: auto picks Arabic from the locale; en, ru and he still work', async ($, on) => {
  await startIn($, on, { LANG: 'ar_MA.UTF-8' })
  expect(await $.tool.call({ tool: PROGRESS, title: 'x', phase: 'delegate', total: 2 } as never)).toMatchObject({ result: 'ok: المهام 0/2' })
})

for (const [language, word] of [['en', 'Tasks'], ['ru', 'Задачи'], ['he', 'משימות']] as const) {
  test(`language: ${language} is kept`, { options: { language } }, async ($, on) => {
    await startIn($, on, {})
    expect(await $.tool.call({ tool: PROGRESS, title: 'x', phase: 'delegate', total: 3, done: 2 } as never)).toMatchObject({ result: `ok: ${word} 2/3` })
  })
}

// --- 2. The band for any multi-step work ------------------------------------

// The engine's TaskCreate and TaskUpdate, answered as the built-in tools answer.
const taskTools = (on: On) => {
  drawsNothing(on)
  let n = 0
  on('tool.call', { tool: 'TaskCreate' }, (_$, e) => {
    const subject = (e as unknown as { subject: string }).subject
    return { result: { task: { id: String(++n), subject } } } as never
  })
  on('tool.call', { tool: 'TaskUpdate' }, (_$, e) => {
    const id = (e as unknown as { taskId: string }).taskId
    return { result: { success: true, taskId: id, updatedFields: ['status'] } } as never
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: the task list drives the band`, async ($, on) => {
    taskTools(on)
    await $.tool.call({ tool: 'TaskCreate', subject: 'Read the spec', description: 'd' } as never)
    // One task is not multi-step work: no band yet.
    expect(await bandText($, surface)).toBe('')

    await $.tool.call({ tool: 'TaskCreate', subject: 'Write the code', description: 'd' } as never)
    await $.tool.call({ tool: 'TaskCreate', subject: 'Run the tests', description: 'd' } as never)
    await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' } as never)
    await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'in_progress' } as never)
    let drawn = await bandText($, surface)
    expect(drawn).toContain('Tasks 1/3')
    // The title is the task in progress.
    expect(drawn).toContain('Write the code')

    await $.tool.call({ tool: 'TaskUpdate', taskId: '3', status: 'deleted' } as never)
    drawn = await bandText($, surface)
    expect(drawn).toContain('Tasks 1/2')

    await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'completed' } as never)
    expect(await bandText($, surface)).toContain('Done')
  })

  test(`${surface}: 2+ subagents drive the band with done/total`, async ($, on) => {
    engine(on)
    await spawn($, 'Only one')
    expect(await bandText($, surface)).toBe('')

    await spawn($, 'Second one')
    expect(await bandText($, surface)).toContain('Agents 0/2')
    await finish($, 'a1')
    expect(await bandText($, surface)).toContain('Agents 1/2')
    await finish($, 'a2')
    // All finished: the bar is full and says so.
    expect(await bandText($, surface)).toContain('Done')

    // A spawn once all are done starts a new batch: one agent again, no band.
    await spawn($, 'Later one')
    expect(await bandText($, surface)).toBe('')
  })
}

test('band: a savvy-flow report wins over the task list', async ($, on) => {
  taskTools(on)
  await $.tool.call({ tool: 'TaskCreate', subject: 'A', description: 'd' } as never)
  await $.tool.call({ tool: 'TaskCreate', subject: 'B', description: 'd' } as never)
  await $.tool.call({ tool: PROGRESS, title: 'Flow', phase: 'delegate', total: 5, done: 3 } as never)
  expect(await bandText($, 'terminal')).toContain('Tasks 3/5')
})

test('band: ✕ hides a task list until a new list starts', async ($, on) => {
  taskTools(on)
  await $.tool.call({ tool: 'TaskCreate', subject: 'A', description: 'd' } as never)
  await $.tool.call({ tool: 'TaskCreate', subject: 'B', description: 'd' } as never)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: band() })
  await ui.press({ key: 'crew-dismiss' })
  await ui.unmount()
  expect(await bandText($, 'terminal')).toBe('')
  // A failed update changes nothing either.
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' } as never)
  expect(await bandText($, 'terminal')).toBe('')
})

// --- 3. Effort fit ---------------------------------------------------------

test('effort fit: a short Explore search on max effort is red, a long design task on high is green', async ($, on) => {
  engine(on)
  await spawn($, 'Find the config file', 'Explore', 'Find where the config is read.')
  await spawn($, 'Design the storage layer', 'general-purpose', 'x'.repeat(4000))
  await step($, 'a1', null, 'max')
  await step($, 'a2', null, 'high')

  const rows = await paneSvgs($, 'desktop')
  const search = rows.find(r => r.alt.startsWith('Find the config file'))
  const design = rows.find(r => r.alt.startsWith('Design the storage layer'))
  expect(search?.alt).toContain('Opus 5.5 · max')
  expect(search?.alt).toContain('effort may be high for the task')
  expect(search?.source).toContain('fill="#D0453F">  ●')
  expect(design?.alt).toContain('effort fits the task')
  expect(design?.source).toContain('fill="#3B9C5F">  ●')
})

test('effort fit: one step off is yellow; the effort the Agent call asked for is shown before any turn', async ($, on) => {
  engine(on)
  // Beneath the plugin, the Agent tool answers; the spawn that follows carries the call's tool_use_id.
  let callId = ''
  on('tool.call', { tool: 'Agent' }, (_$, e) => {
    callId = e.tool_use_id
    return { result: 'started' } as never
  })
  await $.tool.call({ tool: 'Agent', description: 'List the routes', prompt: 'List the HTTP routes.', subagent_type: 'general-purpose', effort: 'high' } as never)
  await $.agent.spawn({ tool_use_id: callId, prompt: 'List the HTTP routes.', description: 'List the routes', subagentType: 'general-purpose', provider: 'engine', parentModel: MODEL, background: true, fork: false } as never)

  const [, row] = await paneSvgs($, 'desktop')
  expect(row?.alt).toContain('Opus 5.5 · high')
  expect(row?.alt).toContain('effort may be high for the task')
  expect(row?.source).toContain('fill="#D9A520">  ●')
})

test('effort fit: the terminal row shows the dot too', async ($, on) => {
  engine(on)
  await spawn($, 'Find the logo', 'Explore', 'short')
  await step($, 'a1', null, 'low')
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'crew', props: pane() })
  // The running glyph is a ● too, in the tier's color; the fit dot is green.
  const dots = (await ui.findAll({ type: 'Text', text: '●' })).map(el => el.props.color)
  expect(dots).toContain('#3B9C5F')
})

// --- 4. Budget per subagent ------------------------------------------------

const BIG: Usage = { input_tokens: 900, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

test('budget: a subagent past its token budget turns red and raises one toast', { options: { budgetTokens: 1000 } }, async ($, on) => {
  engine(on)
  const toasts = toastsOf(on)
  await spawn($, 'Hungry worker')
  await spawn($, 'Thrifty worker')
  await step($, 'a2', { ...BIG, output_tokens: 0 })
  expect(toasts).toEqual([])

  await step($, 'a1', BIG)
  expect(toasts).toEqual(['Hungry worker: over its budget (1k · ≈$0.01)'])
  // Once is enough: further requests raise no second toast.
  await step($, 'a1', BIG)
  expect(toasts.length).toBe(1)

  const rows = await paneSvgs($, 'desktop')
  const hungry = rows.find(r => r.alt.startsWith('Hungry worker'))
  const thrifty = rows.find(r => r.alt.startsWith('Thrifty worker'))
  expect(hungry?.alt).toContain('over budget')
  expect(hungry?.source).toContain('fill="#D0453F" style="fill:#D0453F"')
  expect(thrifty?.alt).not.toContain('over budget')

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'crew', props: pane() })
  expect((await ui.find({ type: 'Text', text: 'Hungry worker' }))?.props.color).toBe('#D0453F')
})

test('budget: a cost limit works the same way', { options: { budgetUsd: 0.01 } }, async ($, on) => {
  engine(on)
  const toasts = toastsOf(on)
  await spawn($, 'Costly worker')
  // 900 × $4 + 300 × $20 per million = $0.0096: under; the second request is over.
  await step($, 'a1', BIG)
  expect(toasts).toEqual([])
  await step($, 'a1', BIG)
  expect(toasts.length).toBe(1)
})

test('budget: off by default', async ($, on) => {
  engine(on)
  const toasts = toastsOf(on)
  await spawn($, 'Any worker')
  await step($, 'a1', { ...BIG, input_tokens: 5e6 })
  expect(toasts).toEqual([])
})

// --- 5. Totals in the panel header ----------------------------------------

test('totals: the header sums cost and tokens of every subagent and counts them', async ($, on) => {
  engine(on)
  await spawn($, 'One')
  await spawn($, 'Two')
  await step($, 'a1', BIG)
  await step($, 'a2', BIG)
  await finish($, 'a2')

  const [header] = await paneSvgs($, 'desktop')
  // 2 × 1,200 tokens; 2 × $0.0096.
  expect(header?.alt).toBe('≈$0.02, 2k tokens, 0:00, 2 agents')
  expect(header?.source).toContain('>Agents</text>')
  expect(header?.source).toContain('>1/2</text>')

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'crew', props: pane() })
  expect(await ui.find({ type: 'Text', text: /2k tokens · 0:00 · 2 agents/ })).toBeDefined()
})

// --- 6. Mobile: narrow band and panel --------------------------------------

test('mobile: a narrow band puts the title on its own line, the bar keeps its room', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.tool.call({ tool: PROGRESS, title: 'Ship the mobile build', phase: 'delegate', total: 4, done: 1 } as never)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'mobile', component: 'AbovePrompt', props: band(42) })
  expect(await ui.find({ type: 'Text', text: 'Ship the mobile build' })).toBeDefined()
  const row = await ui.find({ type: 'Svg' })
  expect(Number(row?.props.width)).toBeLessThanOrEqual(260)
  expect(String(row?.props.source)).toContain('Tasks 1/4')
  expect(String(row?.props.source)).not.toContain('Ship the mobile build')
  expect((await ui.find({ key: 'crew' }))?.props.label).toBe('×0')
})

test('mobile: wide band is one Svg as on the desktop', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.tool.call({ tool: PROGRESS, title: 'Ship', phase: 'delegate', total: 4, done: 1 } as never)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'mobile', component: 'AbovePrompt', props: band(100) })
  expect(await ui.findAll({ type: 'Text' })).toEqual([])
  expect(String((await ui.find({ type: 'Svg' }))?.props.source)).toContain('Ship')
})

test('mobile: a narrow pane stacks the totals and the numbers, crabs and reduced motion kept', async ($, on) => {
  engine(on)
  await spawn($, 'savvy work', 'savvy-careful')
  await step($, 'a1', BIG, 'high')

  const [header, row] = await paneSvgs($, 'mobile', 40)
  expect(header?.width).toBeLessThan(380)
  // Two rows of tiles: 2 × 40 + gap + margin.
  expect(header?.height).toBe(90)
  expect(row?.height).toBe(80)
  // Every row stays inside its width: the stats line starts at the text column.
  expect(row?.source).toContain('x="42" y="63"')
  // The careful tier's engineer crab, walking, with reduced-motion support.
  expect(row?.source).toContain('class="c-careful run"')
  expect(row?.source).toContain('prefers-reduced-motion: reduce')

  // The wide desktop pane keeps the one-line rows.
  const [, wide] = await paneSvgs($, 'desktop', 60)
  expect(wide?.height).toBe(66)
})

test('rename: the command is /crew and the pane is crew, apart from the original', async ($, on) => {
  const commands: string[] = []
  on('command.register', (_$, e) => {
    commands.push(e.name)
    return { value: { command: e.name } } as never
  })
  on('tool.register', (_$, e) => ({ value: { tool: `mcp__${PLUGIN}__${e.name}` } }) as never)
  const opened: string[] = []
  on('ui.open', (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({ value: [] }) as never)
  mock.clock(on)
  mock.env(on, {})
  on('settings.read', async () => ({ value: {} }) as never)
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  await $.session.start({ source: 'startup', cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  expect(commands).toEqual(['crew'])
  expect(await $.command.run({ command: 'crew', args: 'open' } as never)).toMatchObject({ text: 'Crew panel opened.' })
  expect(opened).toEqual(['crew'])
})
