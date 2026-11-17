import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Activity, Board, Task, TaskState } from '../types'
import {
  EMPTY,
  TASK_TOOLS,
  afterCall,
  beforeCall,
  countsOf,
  currentOf,
  fmtSpan,
  fmtTokens,
  reasonOf,
  stateOf,
  textBar,
  textSpan,
  timelineOf,
} from './board'
import { CLAY, RED, crabSvg, crabText, crabWidth } from './crab'
import type { CrabKind } from './crab'
import { COLOR, progressSvg, taskBarSvg, timelineSvg } from './draw'
import { STRINGS, fill, langOf } from './i18n'
import type { Lang } from './i18n'

export const PANE = 'taskboard-tasks'

// Change the shape tag when Board's fields change: it declines what an earlier
// version stored, which outlives a reload.
const board = atom({ plugin: 'taskboard', key: 'board' } as const, EMPTY, { shape: 'board-1' })
const now = atom({ plugin: 'taskboard', key: 'now' } as const, 0)

// ---------------------------------------------------------------------------
// Settings.

type Opts = { language: string; subagents: boolean; timeline: boolean }

export const readOpts = (o: PluginOptions): Opts => ({
  language: typeof o.language === 'string' ? o.language : 'auto',
  subagents: o.subagentTasks !== false,
  timeline: o.showTimeline !== false,
})

// Module scope: set again by register and session.start on every (re)load.
let opts: Opts = readOpts({})
let lang: Lang = 'en'
const tr = () => STRINGS[lang]
const isRtl = () => lang === 'ar'

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
// Words.

export const activityText = (a: Activity | null): string => (a ? fill(tr().verb[a.verb], { t: a.target }).trim() : '')

const countText = (b: Board): string => {
  const c = countsOf(b)
  return b.doneAt !== null ? fill(tr().allDone, { total: c.total }) : fill(tr().count, { done: c.done, total: c.total, pct: c.pct })
}

// The crab for a task row.
const kindOf = (t: Task, all: readonly Task[]): CrabKind => {
  const s = stateOf(t, all)
  if (s === 'completed') return 'done'
  if (s === 'failed') return 'failed'
  if (s === 'blocked') return 'blocked'
  if (s === 'in_progress') return `work-${t.prop ?? 'think'}`
  return 'pending'
}

// The band's crab: dancing when all is done, else the working task's, else
// angry if one failed, else asleep.
const bandKind = (b: Board): CrabKind => {
  if (b.doneAt !== null) return 'dance'
  const cur = currentOf(b)
  if (cur) return `work-${cur.prop ?? 'think'}`
  if (b.tasks.some(t => stateOf(t, b.tasks) === 'failed')) return 'failed'
  return 'pending'
}

const titleOf = (b: Board): string => {
  const cur = currentOf(b)
  if (cur) return cur.activeForm || cur.subject
  const next = b.tasks.find(t => t.status === 'pending')
  return next?.subject ?? ''
}

// "in progress · 2m 10s" / "done · took 4m 02s".
const timeOf = (t: Task, at: number): string => {
  if (t.startedAt === undefined) return ''
  return fmtSpan((t.endedAt ?? at) - t.startedAt)
}

const costText = (t: Pick<Task, 'tools' | 'tokens'>): string =>
  `${fill(tr().tools, { n: t.tools })} · ${fill(tr().tokens, { n: fmtTokens(t.tokens) })} (${tr().estimate})`

// ---------------------------------------------------------------------------
// The pane.

async function togglePane($: EngineInterface): Promise<boolean> {
  try {
    if ((await $.ui.panes()).some(p => p.id === PANE)) {
      await $.ui.close({ id: PANE })
      return false
    }
  } catch {
    // No pane list: open it.
  }
  await $.ui.open({ id: PANE, title: tr().tasks })
  return true
}

// ---------------------------------------------------------------------------

export const register: Register = (on, options) => {
  opts = readOpts(options)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await detectLang($)
    // /tasks is Claude Code's own on some builds: then /taskboard alone serves.
    for (const name of ['tasks', 'taskboard'])
      try {
        await $.command.register({ name, description: 'Show or hide the Tasks pane: one crab per task, the live activity and the timeline', immediate: true })
      } catch {
        // A built-in's name is refused.
      }
    try {
      await update($, now, () => 0)
      const t0 = await $.clock.now()
      await update($, now, () => t0)
      // Elapsed times tick once a second, only while a task runs.
      $.clock.every(1000, () => {
        void (async () => {
          const b = await read($, board)
          if (!b.tasks.some(t => t.status === 'in_progress')) return
          const t = await $.clock.now()
          await update($, now, () => t)
        })().catch(() => undefined)
      })
    } catch {
      // No clock: times update with each tool call.
    }
    return started
  })

  // Every tool call: the activity line, and the call counted toward its task;
  // the task tools change the list. Reads only: the call passes on unchanged.
  on('tool.call', async ($, e, next) => {
    const raw = e as unknown as Record<string, unknown>
    const tool = String(raw.tool)
    const agentId = typeof raw.agentId === 'string' ? raw.agentId : undefined
    const { tool: _t, tool_use_id: _id, agentId: _a, requestMeta: _m, ...input } = raw
    // Subagent tasks off: a subagent's own list is not shown.
    const isIgnored = agentId !== undefined && !opts.subagents && (tool === 'TaskCreate' || tool === 'TodoWrite')
    if (isIgnored) return next(e)
    try {
      const at = await $.clock.now()
      await update($, board, b => beforeCall(b, tool, input, at, agentId))
      await update($, now, () => at)
    } catch {
      // Never stands in the way of the call.
    }
    const ran = await next(e)
    try {
      if (!('deny' in ran && ran.deny)) {
        const at = await $.clock.now()
        await update($, board, b => afterCall(b, tool, input, { result: ran.result, text: ran.text, isError: ran.isError }, at, agentId))
        if (TASK_TOOLS.has(tool)) await update($, now, () => at)
      }
    } catch {
      // Same.
    }
    return ran
  })

  // The turn is over: nothing runs now.
  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) await update($, board, b => (b.activity ? { ...b, activity: null } : b)).catch(() => undefined)
    return next(e)
  })

  for (const command of ['tasks', 'taskboard'] as const)
    on('command.run', { command }, async $ => ({ text: (await togglePane($)) ? tr().opened : tr().closed }))

  // -------------------------------------------------------------------------
  // Drawing.

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e) as unknown as UI
    const b = await read($, board)
    const at = Math.max(await read($, now), 0)
    const size = sizeOf(e.props.bodyColumns, e.surface !== 'terminal' && 'Svg' in ui, 34)
    return drawPane(ui, b, at, size)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const b = await read($, board)
    // No task list: no band.
    if (b.tasks.length === 0) return next(e)
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null
    const ui = $.ui.resolve(e) as unknown as UI
    const size = sizeOf(e.props.bodyColumns, e.surface !== 'terminal' && 'Svg' in ui, 26)
    const row = bandRow(ui, $, b, size)
    if (!below) return row
    const { Box } = ui
    return (
      <Box flexDirection="column">
        {row}
        {below as never}
      </Box>
    )
  })
}

// ---------------------------------------------------------------------------
// Element builders. The element table differs per surface; these take it whole.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type El = any
type UI = { Box: El; Text: El; Button: El; Svg?: El }
type Size = { W: number; barW: number; isSvg: boolean; px: number; cols: number }

const sizeOf = (columns: number, isSvg: boolean, px: number): Size => {
  const cols = Math.max(20, columns || 60)
  return { W: Math.max(140, Math.min(720, cols * 8 - 24)), barW: Math.max(8, Math.min(30, cols - 8)), isSvg, px, cols }
}

const crabEl = (ui: UI, kind: CrabKind, size: Size, key?: string) => {
  const { Svg, Text } = ui
  if (size.isSvg && Svg) return <Svg key={key} source={crabSvg(kind, { size: size.px, mirror: isRtl() })} alt={`crab ${kind}`} width={crabWidth(size.px)} height={size.px} />
  const isRed = kind === 'failed' || kind === 'blocked'
  return <Text color={isRed ? RED : CLAY}>{crabText(kind)}</Text>
}

const dir = () => (isRtl() ? 'row-reverse' : 'row')

// The band: [crab] current task · activity  [bar] 3/7 tasks · 43%  [Tasks]
function bandRow(ui: UI, $: EngineInterface, b: Board, size: Size) {
  const { Box, Text, Button, Svg } = ui
  const s = tr()
  const c = countsOf(b)
  const title = b.doneAt !== null ? '' : titleOf(b)
  const act = currentOf(b) ? activityText(b.activity) : ''
  const barW = Math.max(60, Math.min(160, Math.round(size.W / 5)))
  return (
    <Box key="taskboard-band" flexDirection={dir()} gap={1} alignItems="center" flexWrap="wrap">
      <Box flexShrink={0}>{crabEl(ui, bandKind(b), size)}</Box>
      {title ? (
        <Box flexShrink={1}>
          <Text wrap="truncate-end">
            <Text bold>{title}</Text>
            {act ? <Text dimColor> · {act}</Text> : null}
          </Text>
        </Box>
      ) : null}
      <Box flexShrink={0}>
        {size.isSvg && Svg ? (
          <Svg source={progressSvg(barW, c.done, c.running, c.total, isRtl())} alt={countText(b)} width={barW} height={10} />
        ) : (
          <Text color={b.doneAt !== null ? COLOR.completed : CLAY}>{textBar(c.pct, 10)}</Text>
        )}
      </Box>
      <Box flexShrink={0}>
        <Text color={b.doneAt !== null ? COLOR.completed : undefined}>{countText(b)}</Text>
      </Box>
      <Button key="taskboard-open" label={size.isSvg ? s.tasksBtn : `📋 ${s.tasksBtn}`} plain onPress={() => togglePane($)} />
    </Box>
  )
}

// A task's bar in text: grey when pending, a moving block while it runs (it
// steps with the one-second clock), full when done, failed or blocked.
const textTaskBar = (state: TaskState, w: number, at: number): string => {
  if (state === 'pending') return '░'.repeat(w)
  if (state !== 'in_progress') return '█'.repeat(w)
  const seg = Math.max(2, Math.round(w / 3))
  const off = Math.floor(at / 1000) % (w + seg)
  return [...Array(w).keys()].map(i => (i >= off - seg && i < off ? '▓' : '░')).join('')
}

function taskRow(ui: UI, t: Task, n: number, all: readonly Task[], at: number, size: Size) {
  const { Box, Text, Svg } = ui
  const s = tr()
  const state = stateOf(t, all)
  const time = timeOf(t, at)
  const reason = state === 'failed' || state === 'blocked' ? reasonOf(t, all) : ''
  const color = state === 'pending' ? undefined : COLOR[state]
  const head = [s.state[state], time].filter(Boolean).join(' · ')
  return (
    <Box key={`task-${t.id}`} flexDirection="column" marginBottom={size.isSvg ? 0 : 1}>
      <Box flexDirection={dir()} gap={1} alignItems="center">
        <Box flexShrink={0}>{crabEl(ui, kindOf(t, all), size)}</Box>
        <Box flexDirection="column" flexShrink={1} flexGrow={1} alignItems={isRtl() ? 'flex-end' : undefined}>
          <Text>
            <Text dimColor>{n}.</Text> <Text bold strikethrough={false}>{t.subject}</Text>
            {state === 'completed' && !size.isSvg ? <Text color={COLOR.completed}> ✓</Text> : null}
            <Text color={color} dimColor={state === 'pending'}> · {head}</Text>
          </Text>
          {t.tools > 0 ? <Text dimColor>{costText(t)}</Text> : null}
          {reason ? <Text color={RED}>{state === 'blocked' && t.blocked === undefined ? fill(s.waitingOn, { ids: reason }) : reason}</Text> : null}
          {state === 'in_progress' && t.lastError ? (
            <Text color={RED} dimColor>
              {s.lastError}: {t.lastError}
            </Text>
          ) : null}
        </Box>
      </Box>
      {size.isSvg && Svg ? (
        <Svg source={taskBarSvg(size.W, state, isRtl())} alt={`${t.subject}: ${s.state[state]}`} width={size.W} height={10} />
      ) : (
        <Text color={color} dimColor={state === 'pending'}>
          {textTaskBar(state, size.barW, at)}
        </Text>
      )}
    </Box>
  )
}

function timelineEl(ui: UI, b: Board, at: number, size: Size, order: readonly Task[]) {
  const { Box, Text, Svg } = ui
  const s = tr()
  const sorted: Board = { ...b, tasks: [...order] }
  const tl = timelineOf(sorted, at)
  const labels = order.map((_, i) => `#${i + 1}`)
  if (!order.some(t => t.startedAt !== undefined)) return null
  const heading = (
    <Text key="tl-head" bold>
      {size.isSvg ? '' : '📊 '}
      {s.timeline}
    </Text>
  )
  if (size.isSvg && Svg)
    return (
      <Box key="timeline" flexDirection="column" marginTop={1} alignItems={isRtl() ? 'flex-end' : undefined}>
        {heading}
        <Svg source={timelineSvg(size.W, tl.spans, tl.start, tl.end, labels, isRtl())} alt={`${s.timeline}: ${fmtSpan(tl.end - tl.start)}`} width={size.W} />
      </Box>
    )
  const w = Math.max(8, Math.min(40, size.cols - 20))
  return (
    <Box key="timeline" flexDirection="column" marginTop={1}>
      {heading}
      {tl.spans.map((sp, i) => (
        <Text key={`tl-${sp.id}`} color={sp.from < 0 ? undefined : COLOR[sp.state]} dimColor={sp.from < 0}>
          {(labels[i] ?? '').padEnd(4)}│{textSpan(sp, tl.start, tl.end, w)}│ {sp.from < 0 ? '' : fmtSpan(sp.to - sp.from)}
        </Text>
      ))}
      <Text dimColor>
        {'    '}0{' '.repeat(Math.max(1, w - fmtSpan(tl.end - tl.start).length))}
        {fmtSpan(tl.end - tl.start)}
      </Text>
    </Box>
  )
}

function drawPane(ui: UI, b: Board, at: number, size: Size) {
  const { Box, Text, Svg } = ui
  const s = tr()
  if (b.tasks.length === 0)
    return (
      <Box flexDirection={dir()} gap={1} alignItems="center">
        <Box flexShrink={0}>{crabEl(ui, 'pending', size)}</Box>
        <Text dimColor>{s.noTasks}</Text>
      </Box>
    )
  const c = countsOf(b)
  const main = b.tasks.filter(t => !t.agentId)
  const sub = opts.subagents ? b.tasks.filter(t => t.agentId) : []
  const cur = currentOf(b)
  const act = cur ? activityText(b.activity) || cur.activeForm || '' : ''
  const totals = b.tasks.reduce((a, t) => ({ tools: a.tools + t.tools, tokens: a.tokens + t.tokens }), { tools: 0, tokens: 0 })
  const barW = size.W
  return (
    <Box flexDirection="column" alignItems={isRtl() ? 'flex-end' : undefined}>
      <Box key="pane-head" flexDirection={dir()} gap={1} alignItems="center">
        <Box flexShrink={0}>{crabEl(ui, bandKind(b), size)}</Box>
        <Box flexDirection="column" flexShrink={1} alignItems={isRtl() ? 'flex-end' : undefined}>
          <Text bold color={b.doneAt !== null ? COLOR.completed : undefined}>
            {countText(b)}
          </Text>
          <Text dimColor>{act ? `▸ ${act}` : s.idle}</Text>
        </Box>
      </Box>
      {size.isSvg && Svg ? (
        <Svg key="pane-bar" source={progressSvg(barW, c.done, c.running, c.total, isRtl())} alt={countText(b)} width={barW} height={10} />
      ) : (
        <Text key="pane-bar" color={CLAY}>
          {textBar(c.pct, size.barW)}
        </Text>
      )}
      <Box key="pane-rows" flexDirection="column" marginTop={1}>
        {main.map((t, i) => taskRow(ui, t, i + 1, b.tasks, at, size))}
      </Box>
      {sub.length ? (
        <Box key="pane-sub" flexDirection="column" marginTop={1} alignItems={isRtl() ? 'flex-end' : undefined}>
          <Text bold>
            {size.isSvg ? '' : '🤖 '}
            {s.subagents}
          </Text>
          {sub.map((t, i) => taskRow(ui, t, main.length + i + 1, b.tasks, at, size))}
        </Box>
      ) : null}
      {opts.timeline ? timelineEl(ui, b, at, size, [...main, ...sub]) : null}
      <Box key="pane-total" marginTop={1}>
        <Text dimColor>
          {s.total}: {costText(totals)}
        </Text>
      </Box>
    </Box>
  )
}
