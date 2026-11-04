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
}

async function start($: Engine, on: On, ctx = 30, usage?: World['usage']) {
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, { LANG: 'en_US.UTF-8', CLAUDE_EFFORT: 'high' })
  const w: World = { toasts: [], writes: [], forks: 0, completes: 0, compacted: 0, usage: () => usageAt(ctx) }
  on('ui.render', ($e, e) => {
    const { Text } = $e.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('session.measure', (_$, e) => ({ changed: e.changed }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('command.run', () => ({ text: '' }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.panes', () => ({ value: [] }) as never)
  on('session.compact', () => {
    w.compacted += 1
    return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] } as never
  })
  on('settings.read', async () => ({ value: {} }) as never)
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  on('command.register', (_$, e) => ({ value: { command: e.name } }) as never)
  on('session.model', () => ({ value: 'claude-opus-5-5' }) as never)
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
  if (usage) w.usage = usage
  await $.session.start({ source: 'startup', cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  return { clock, w }
}

const measure = ($: Engine, ctx: number, five = 20) =>
  ($.session as unknown as { measure: (e: unknown) => Promise<unknown> }).measure({ ...usageAt(ctx, five), changed: ['context', 'rateLimits'] })

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: the band shows context, limits, cost and a Usage button`, async ($, on) => {
    await start($, on)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...BAND } as never)
    expect(await ui.find({ key: 'cockpit-usage' })).toBeDefined()
    expect(await ui.find({ key: 'cockpit-compact' })).toBeUndefined()
    if (surface === 'terminal') {
      expect(await ui.find({ type: 'Text', text: /^ctx 30%$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^5h 20%/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^\$1\.23$/ })).toBeDefined()
      expect((await ui.findAll({ type: 'Svg' })).length).toBe(0)
    } else {
      expect((await ui.findAll({ type: 'Svg' })).length).toBe(1)
    }
    await ui.unmount()
  })

  test(`${surface}: at the critical level the band offers Compact now and Handoff`, async ($, on) => {
    const { w } = await start($, on)
    await measure($, 72)
    expect(w.toasts.some(t => /Budget at 72%/.test(t))).toBe(true)
    await measure($, 90)
    expect(w.toasts.some(t => /Budget at 90%.*Compact now/.test(t))).toBe(true)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...BAND } as never)
    expect(await ui.find({ key: 'cockpit-compact' })).toBeDefined()
    expect(await ui.find({ key: 'cockpit-handoff' })).toBeDefined()
    await ui.unmount()
  })
}

test('a plan limit past the threshold triggers the guard too', async ($, on) => {
  const { w } = await start($, on)
  await measure($, 10, 88)
  expect(w.toasts.some(t => /Budget at 88% \(5-hour limit\)/.test(t))).toBe(true)
})

test('Compact now calls the session compaction', async ($, on) => {
  const { w } = await start($, on)
  await measure($, 95)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND } as never)
  await ui.press({ key: 'cockpit-compact' })
  expect(w.compacted).toBe(1)
  await ui.unmount()
})

test('the advisor reads the prompt, never changes it, and rates the effort', async ($, on) => {
  await start($, on)
  const text = 'short: what is a PDU session?'
  const r = await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } } as never)
  expect((r as { text: string }).text).toBe(text)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND } as never)
  expect(await ui.find({ type: 'Text', text: /try haiku · low/ })).toBeDefined()
  // The session runs at high: two levels over low.
  expect(await ui.find({ type: 'Text', text: /too high/ })).toBeDefined()
  expect(await ui.find({ key: 'cockpit-switch' })).toBeDefined()
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

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: the usage pane shows limits, breakdown and the estimate`, async ($, on) => {
    await start($, on, 30, e => {
      if (!e.breakdown) return usageAt(30)
      return {
        ...{
          ...usageAt(30),
          context: {
            ...usageAt(30).context,
            breakdown: {
              categories: [
                { name: 'System prompt', tokens: 4000, color: 'x', isDeferred: false, kind: 'used' },
                { name: 'MCP tools', tokens: 9000, color: 'x', isDeferred: false, kind: 'used' },
                { name: 'Messages', tokens: 280000, color: 'x', isDeferred: false, kind: 'used' },
                { name: 'Free space', tokens: 700000, color: 'x', isDeferred: false, kind: 'free' },
              ],
              totalTokens: 293000,
              maxTokens: 1_000_000,
              rawMaxTokens: 1_000_000,
              autocompactSource: 'auto',
              percentage: 29,
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
        },
      }
    })
    await $.command.run({ command: 'usage-panel', args: 'open' } as never)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...PANE } as never)
    expect(await ui.find({ key: 'refresh' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Estimate:/ })).toBeDefined()
    if (surface === 'terminal') {
      expect(await ui.find({ type: 'Text', text: /^5-hour limit/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^MCP tools by server$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^By tool, skill and subagent \(estimate\)$/ })).toBeDefined()
    } else {
      expect((await ui.findAll({ type: 'Svg' })).length).toBeGreaterThan(4)
    }
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
  for (let i = 0; i < 6 * 12; i++) await clock.advance(60 * 60_000 / 12)
  expect(w.forks).toBe(2)
})
