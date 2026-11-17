import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PLUGIN = 'taskboard'
const NOW = Date.parse('2026-11-17T20:00:00Z')
const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: true, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const
const PANE = {
  component: 'Pane',
  requestId: 'taskboard-tasks',
  props: { title: 'Tasks', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
} as const
const SURFACES = ['terminal', 'desktop'] as const
type Surface = (typeof SURFACES)[number]

type World = { panes: { id: string; title?: string }[]; registered: string[]; next: number; calls: string[] }

async function start($: Engine, on: On, env: Record<string, string> = { LANG: 'en_US.UTF-8' }) {
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, env)
  const w: World = { panes: [], registered: [], next: 1, calls: [] }
  on('ui.render', ($e, e) => {
    const { Text } = $e.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('settings.read', async () => ({ value: {} }) as never)
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  on('command.register', (_$, e) => {
    w.registered.push(e.name)
    return { value: { command: e.name } } as never
  })
  on('turn.complete', () => ({ text: '' }) as never)
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
  // The engine's tools: the task tools answer as Claude Code does.
  on('tool.call', (_$, e) => {
    const x = e as unknown as Record<string, unknown>
    w.calls.push(String(x.tool))
    if (x.tool === 'TaskCreate') {
      const id = String(w.next++)
      return { result: { task: { id, subject: x.subject } }, text: `Task #${id} created` } as never
    }
    if (x.tool === 'TaskUpdate') return { result: { success: true, taskId: x.taskId, updatedFields: ['status'] }, text: 'Updated' } as never
    if (x.tool === 'Bash' && String(x.command).includes('fail')) return { result: {}, text: 'Error: 3 tests failed\nmore', isError: true } as never
    return { result: {}, text: 'ok '.repeat(40) } as never
  })
  await $.session.start({ source: 'startup', cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  return { clock, w }
}

const call = ($: Engine, input: Record<string, unknown>) => $.tool.call(input as never)
const createTasks = async ($: Engine, subjects: string[]) => {
  for (const s of subjects) await call($, { tool: 'TaskCreate', subject: s, description: s, activeForm: `${s}ing` })
}
const status = ($: Engine, taskId: string, s: string, extra: Record<string, unknown> = {}) => call($, { tool: 'TaskUpdate', taskId, status: s, ...extra })

// Since Claude Code 2.1.326 the test kit draws a stand-in for the bands beneath
// (a Text tagged with the test's own part): tests look at taskboard's own tree.
const own = (tree: unknown): unknown => {
  const el = tree as { children?: unknown[] }
  const kids = el?.children ?? []
  const last = kids[kids.length - 1] as { part?: { plugin?: string } } | undefined
  return kids.length === 2 && last?.part?.plugin === 'test' ? kids[0] : tree
}
const texts = (n: unknown, out: string[] = []): string[] => {
  if (typeof n === 'string') out.push(n)
  else if (n && typeof n === 'object') {
    const el = n as { type?: string; children?: unknown[] }
    if (el.type === 'Text') {
      out.push(flat(el))
      return out
    }
    for (const c of el.children ?? []) texts(c, out)
  }
  return out
}
const flat = (n: unknown): string =>
  typeof n === 'string' || typeof n === 'number' ? String(n) : ((n as { children?: unknown[] })?.children ?? []).map(flat).join('')
const crabs = async (ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) =>
  (await ui.findAll({ type: 'Svg' })).map(x => String(x.props.alt)).filter(a => a.startsWith('crab '))

const band = ($: Engine, surface: Surface, props: Record<string, unknown> = {}) =>
  $.ui.mount({ plugin: PLUGIN, surface, ...BAND, props: { ...BAND.props, ...props } } as never)
const pane = ($: Engine, surface: Surface) => $.ui.mount({ plugin: PLUGIN, surface, ...PANE } as never)

test('registers /tasks and /taskboard', async ($, on) => {
  const { w } = await start($, on)
  expect(w.registered).toEqual(['tasks', 'taskboard'])
})

for (const surface of SURFACES) {
  test(`${surface}: no task list, no band`, async ($, on) => {
    await start($, on)
    await call($, { tool: 'Bash', command: 'ls' })
    const ui = await band($, surface)
    expect(await ui.find({ key: 'taskboard-open' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
    await ui.unmount()
  })

  test(`${surface}: the band shows the working crab, the task, the activity, 3/7 and Tasks`, async ($, on) => {
    await start($, on)
    await createTasks($, ['Plan', 'Parse', 'Test', 'Fix', 'Docs', 'Lint', 'Ship'])
    for (const id of ['1', '2', '3']) {
      await status($, id, 'in_progress')
      await status($, id, 'completed')
    }
    await status($, '4', 'in_progress', { activeForm: 'Fixing the parser' })
    await call($, { tool: 'Read', file_path: '/repo/src/parser.py' })
    const ui = await band($, surface)
    const all = texts(own(await ui.drawn())).join(' | ')
    expect(all).toContain('Fixing the parser')
    expect(all).toContain('Reading parser.py')
    expect(all).toContain('3/7 tasks · 43%')
    const btn = (await ui.find({ key: 'taskboard-open' })) as unknown as { props: { label: string } }
    expect(btn.props.label).toBe(surface === 'terminal' ? '📋 Tasks' : 'Tasks')
    if (surface === 'terminal') expect(all).toContain('▣🔍')
    else expect(await crabs(ui)).toEqual(['crab work-magnifier'])
    // The other bands still show, beneath.
    expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
    await ui.unmount()
  })

  test(`${surface}: the prop follows the tool in use`, async ($, on) => {
    await start($, on)
    await createTasks($, ['Build'])
    await status($, '1', 'in_progress')
    const seen: string[] = []
    for (const [input, kind] of [
      [{ tool: 'Edit', file_path: 'api.ts', old_string: 'a', new_string: 'b' }, 'wrench'],
      [{ tool: 'Bash', command: 'npm test' }, 'terminal'],
      [{ tool: 'WebSearch', query: 'x' }, 'antenna'],
      [{ tool: 'Grep', pattern: 'TODO' }, 'magnifier'],
    ] as const) {
      await call($, input)
      const ui = await band($, surface)
      const all = texts(own(await ui.drawn())).join(' ')
      if (surface === 'desktop') seen.push(...(await crabs(ui)))
      else seen.push(all.includes('▣🔧') ? 'crab work-wrench' : all.includes('▣>_') ? 'crab work-terminal' : all.includes('▣📡') ? 'crab work-antenna' : all.includes('▣🔍') ? 'crab work-magnifier' : '?')
      expect(all).toMatch(kind === 'wrench' ? /Editing api\.ts/ : kind === 'terminal' ? /Running npm test/ : kind === 'antenna' ? /Searching the web/ : /Searching for TODO/)
      await ui.unmount()
    }
    expect(seen).toEqual(['crab work-wrench', 'crab work-terminal', 'crab work-antenna', 'crab work-magnifier'])
  })

  test(`${surface}: the pane has one crab per task state, times and estimates`, async ($, on) => {
    const { clock } = await start($, on)
    await createTasks($, ['Plan', 'Parse', 'Test', 'Deploy'])
    await status($, '1', 'in_progress')
    await clock.advance(65_000)
    await status($, '1', 'completed')
    await status($, '2', 'in_progress')
    await call($, { tool: 'Bash', command: 'npm run fail' })
    await call($, { tool: 'Read', file_path: 'x.ts' })
    await clock.advance(12_000)
    await status($, '3', 'pending', { metadata: { failed: 'no network' } })
    await call($, { tool: 'TaskUpdate', taskId: '4', addBlockedBy: ['2'] })
    const ui = await pane($, surface)
    const all = texts(await ui.drawn()).join('\n')
    expect(all).toContain('1/4 tasks · 25%')
    expect(all).toMatch(/Plan( ✓)? · done · 1m 05s/)
    expect(all).toMatch(/Parse · in progress · 12s/)
    expect(all).toMatch(/2 tool calls · ≈\d+ tokens \(estimate\)/)
    expect(all).toContain('last error: Error: 3 tests failed')
    expect(all).toMatch(/Test · failed/)
    expect(all).toContain('no network')
    expect(all).toMatch(/Deploy · blocked/)
    expect(all).toContain('waiting on #2')
    expect(all).toContain('Timeline')
    expect(all).toMatch(/Total: 2 tool calls/)
    if (surface === 'desktop') {
      expect(await crabs(ui)).toEqual(['crab work-magnifier', 'crab done', 'crab work-magnifier', 'crab failed', 'crab blocked'])
      const tl = (await ui.findAll({ type: 'Svg' })).find(s => String(s.props.alt).startsWith('Timeline'))
      expect(String(tl?.props.source)).toContain('<svg')
    } else {
      expect(all).toContain('▣✓')
      expect(all).toContain('▣✗')
      expect(all).toMatch(/#1 {2}│█+ +│ 1m 05s/)
    }
    await ui.unmount()
  })

  test(`${surface}: all done, the crab dances`, async ($, on) => {
    await start($, on)
    await createTasks($, ['A', 'B'])
    for (const id of ['1', '2']) await status($, id, 'completed')
    const ui = await band($, surface)
    const all = texts(own(await ui.drawn())).join(' ')
    expect(all).toContain('All 2 tasks done')
    if (surface === 'desktop') expect(await crabs(ui)).toEqual(['crab dance'])
    else expect(all).toContain('▣♪')
    await ui.unmount()
  })
}

test('the Tasks button and /tasks toggle the pane', async ($, on) => {
  const { w } = await start($, on)
  await createTasks($, ['A'])
  const ui = await band($, 'desktop')
  await ui.press({ key: 'taskboard-open' })
  expect(w.panes.map(p => p.id)).toEqual(['taskboard-tasks'])
  const r = (await $.command.run({ command: 'tasks', args: '' } as never)) as { text: string }
  expect(r.text).toBe('Tasks pane closed.')
  expect(w.panes).toEqual([])
  await ui.unmount()
})

test('tool calls pass through unchanged', async ($, on) => {
  const { w } = await start($, on)
  const r = await call($, { tool: 'Bash', command: 'echo hi' })
  expect((r as { text: string }).text).toBe('ok '.repeat(40))
  expect(w.calls).toEqual(['Bash'])
})

test('subagent tasks group under their own heading', async ($, on) => {
  await start($, on)
  await createTasks($, ['Main'])
  await call($, { tool: 'TaskCreate', subject: 'Sub job', description: 'x', agentId: 'agent-7' })
  const ui = await pane($, 'terminal')
  const all = texts(await ui.drawn()).join('\n')
  expect(all).toMatch(/Main[\s\S]*Subagent tasks[\s\S]*Sub job/)
  await ui.unmount()
})

test('subagent tasks hidden when the setting is off', { options: { subagentTasks: false } }, async ($, on) => {
  await start($, on)
  await createTasks($, ['Main'])
  await call($, { tool: 'TaskCreate', subject: 'Sub job', description: 'x', agentId: 'agent-7' })
  const ui = await pane($, 'terminal')
  const all = texts(await ui.drawn()).join('\n')
  expect(all).not.toContain('Sub job')
  await ui.unmount()
})

test('French and Arabic (right to left, mirrored crab)', async ($, on) => {
  await start($, on, { LANG: 'fr_FR.UTF-8' })
  await createTasks($, ['Analyser'])
  await status($, '1', 'in_progress')
  await call($, { tool: 'Read', file_path: 'a.py' })
  const ui = await band($, 'terminal')
  const all = texts(own(await ui.drawn())).join(' ')
  expect(all).toContain('0/1 tâches · 0 %')
  expect(all).toContain('Lecture de a.py')
  await ui.unmount()
})

test('Arabic draws right to left', { options: { language: 'ar' } }, async ($, on) => {
  await start($, on)
  await createTasks($, ['حلل'])
  const ui = await band($, 'desktop')
  const root = own(await ui.drawn()) as { props?: Record<string, unknown> }
  expect(root.props?.flexDirection).toBe('row-reverse')
  const svg = (await ui.findAll({ type: 'Svg' })).find(s => String(s.props.alt).startsWith('crab '))
  expect(String(svg?.props.source)).toContain('scale(-1,1)')
  expect(texts(root).join(' ')).toContain('0/1 مهام')
  await ui.unmount()
})

test('the turn ends: the activity line clears', async ($, on) => {
  await start($, on)
  await createTasks($, ['A'])
  await status($, '1', 'in_progress')
  await call($, { tool: 'Read', file_path: 'a.py' })
  await $.turn.complete({ text: '' } as never)
  const ui = await band($, 'terminal')
  expect(texts(own(await ui.drawn())).join(' ')).not.toContain('Reading')
  await ui.unmount()
})
