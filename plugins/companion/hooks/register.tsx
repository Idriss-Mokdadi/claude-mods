// companion: the Lagoon backdrop, a mood crab band, done alerts and
// celebrations. Hooks only: no model call, no network, no file written.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Act, Mood, View } from '../types'
import { crabSvg, crabText, crabWidth } from './crab'
import { STRINGS, fill, langOf } from './i18n'
import type { Lang, Strings } from './i18n'
import {
  actOf,
  fmtSpan,
  freshRaw,
  isCommitCommand,
  isTestCommand,
  looksMisfit,
  sameView,
  SHOW,
  tasksOfBook,
  tasksOfTodos,
  viewOf,
} from './model'
import type { Raw, TaskBook } from './model'
import { lagoonSvg, sceneAlt } from './scene'

export const PLUGIN = 'companion'
export const SCENE = 'lagoon'
export const STORE_THEME = 'companion.theme'
export const STORE_SOUND = 'companion.sound'
export const CHIRP = 'assets/chirp.wav'
export const HAPPY = 'assets/happy.wav'
// One celebration at most per this many ms, and one waiting alert.
export const PARTY_GAP = 30_000
export const WAIT_GAP = 15_000

const view = atom({ plugin: 'companion', key: 'view' } as const, null, { shape: 'view-1' })
const themeOn = atom({ plugin: 'companion', key: 'themeOn' } as const, true)
const soundOn = atom({ plugin: 'companion', key: 'soundOn' } as const, true)

// ---------------------------------------------------------------------------
// Settings.

export type Opts = {
  width: number
  side: 'left' | 'right'
  blur: number
  opacity: number
  theme: boolean
  sound: boolean
  volume: number
  alertSeconds: number
  celebrations: boolean
  crit: number
  ttl: 'auto' | '5m' | '1h'
  language: string
}

const num = (v: unknown, d: number, lo: number, hi: number): number => {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d
}

export const readOpts = (o: PluginOptions): Opts => ({
  width: Math.round(num(o.stripWidth, 260, 120, 600)),
  side: o.stripSide === 'right' ? 'right' : 'left',
  blur: num(o.glassBlur, 12, 0, 64),
  opacity: num(o.glassOpacity, 0.55, 0, 1),
  theme: o.lagoon !== false,
  sound: o.sound !== false,
  volume: num(o.volume, 70, 0, 100),
  alertSeconds: num(o.alertSeconds, 30, 0, 3600),
  celebrations: o.celebrations !== false,
  crit: num(o.criticalPercent, 90, 1, 100),
  ttl: o.cacheTtl === '5m' || o.cacheTtl === '1h' ? o.cacheTtl : 'auto',
  language: typeof o.language === 'string' ? o.language : 'auto',
})

// Module scope: set again by register on every (re)load.
let opts: Opts = readOpts({})
let lang: Lang = 'en'
let raw: Raw = freshRaw()
let model = ''
let book: TaskBook = new Map()
let lastTestFailed = false
let lastPartyAt = -Infinity
let lastWaitAlertAt = -Infinity
let detectedTtl: '5m' | '1h' | null = null
let hasLimits = false
const tr = (): Strings => STRINGS[lang]

const ttlMs = (): number => {
  const t = opts.ttl !== 'auto' ? opts.ttl : (detectedTtl ?? (hasLimits ? '1h' : '5m'))
  return t === '1h' ? 3_600_000 : 300_000
}

async function detectLang($: EngineInterface): Promise<Lang> {
  const fixed = langOf(opts.language)
  if (fixed) return fixed
  try {
    const s = (await $.settings.read()) as Record<string, unknown>
    const l = langOf(s.language)
    if (l) return l
  } catch {
    // No settings.
  }
  return langOf((await $.env.get('LC_ALL')) || (await $.env.get('LANG')) || '') ?? 'en'
}

// ---------------------------------------------------------------------------
// The one write path: change the raw state, then redraw only if what shows changed.

async function recompute($: EngineInterface): Promise<void> {
  raw.ttlMs = ttlMs()
  const v = viewOf(raw, await $.clock.now())
  if (!sameView(await read($, view), v)) await update($, view, () => v)
}

async function change($: EngineInterface, fn: (r: Raw, now: number) => void): Promise<void> {
  fn(raw, await $.clock.now())
  await recompute($)
}

// ---------------------------------------------------------------------------
// Sound, alerts, celebrations.

async function chirp($: EngineInterface, asset: string): Promise<void> {
  if (!(await read($, soundOn))) return
  try {
    await $.audio.play({ asset }, { gain: Math.round(opts.volume * 1.5) / 100 })
  } catch {
    // No player here (a Linux or Windows terminal): stay quiet.
  }
}

async function alertWaiting($: EngineInterface, text: string): Promise<void> {
  const now = await $.clock.now()
  if (now - lastWaitAlertAt < WAIT_GAP) return
  lastWaitAlertAt = now
  $.ui.toast(text)
  void chirp($, CHIRP)
}

async function celebrate($: EngineInterface): Promise<boolean> {
  if (!opts.celebrations) return false
  const now = await $.clock.now()
  if (now - lastPartyAt < PARTY_GAP) return false
  lastPartyAt = now
  await change($, r => {
    r.partyAt = now
    // A win clears an earlier failure.
    r.errorUntil = 0
  })
  void chirp($, HAPPY)
  // Redraw once the party is over.
  $.clock.after(SHOW.party + 100, () => void recompute($))
  return true
}

// ---------------------------------------------------------------------------
// The Lagoon on and off.

async function applyTheme($: EngineInterface, on: boolean): Promise<string> {
  await update($, themeOn, () => on)
  try {
    await $.store.set(STORE_THEME, on)
  } catch {
    // Not remembered.
  }
  if (!on) {
    await $.theme.clear()
    return tr().themeOff
  }
  const r = await $.theme.set({ backdrop: { scene: SCENE, glass: { blur: opts.blur, opacity: opts.opacity } } })
  return r.isDrawn ? tr().themeOn : fill(tr().themeNotDrawn, { why: r.reason })
}

async function toggleSound($: EngineInterface): Promise<string> {
  const on = !(await read($, soundOn))
  await update($, soundOn, () => on)
  try {
    await $.store.set(STORE_SOUND, on)
  } catch {
    // Not remembered.
  }
  return on ? tr().soundOn : tr().soundOff
}

async function themeCommand($: EngineInterface, args: string): Promise<{ text: string }> {
  const a = args.trim().toLowerCase()
  const cur = await read($, themeOn)
  if (a === 'on') return { text: await applyTheme($, true) }
  if (a === 'off') return { text: await applyTheme($, false) }
  if (a === '' || a === 'toggle') return { text: await applyTheme($, !cur) }
  return { text: tr().themeUsage }
}

// ---------------------------------------------------------------------------

const MAIN = (e: { agentId?: string }) => e.agentId === undefined

export const register: Register = (on, options) => {
  opts = readOpts(options)
  raw = freshRaw(opts.crit)
  model = ''
  book = new Map()
  lastTestFailed = false
  lastPartyAt = -Infinity
  lastWaitAlertAt = -Infinity
  detectedTtl = null
  hasLimits = false

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await detectLang($)
    for (const name of ['theme', 'lagoon']) {
      try {
        await $.command.register({ name, description: 'Lagoon backdrop: on, off or toggle (companion)', argumentHint: 'on|off|toggle', immediate: true })
      } catch {
        // A name Claude Code keeps for itself: the other one stays.
      }
    }
    let isOn = opts.theme
    let isSound = opts.sound
    try {
      const t = await $.store.get(STORE_THEME)
      if (typeof t === 'boolean') isOn = t
      const s = await $.store.get(STORE_SOUND)
      if (typeof s === 'boolean') isSound = s
    } catch {
      // Settings defaults.
    }
    await update($, soundOn, () => isSound)
    await update($, themeOn, () => isOn)
    // Set the scene; never clear at start (that would wipe another mod's theme).
    if (isOn) await $.theme.set({ backdrop: { scene: SCENE, glass: { blur: opts.blur, opacity: opts.opacity } } }).catch(() => undefined)
    try {
      model = (await $.session.model()) || model
    } catch {
      // Unknown yet.
    }
    try {
      const u = await $.session.usage()
      readLimits(u.rateLimits)
    } catch {
      // No reading yet.
    }
    await recompute($)
    $.clock.every(2000, () => void recompute($))
    return started
  })

  const readLimits = (limits: readonly { kind: string; percentUsed: number }[]) => {
    hasLimits = limits.length > 0
    raw.h5 = limits.find(l => l.kind === 'five_hour')?.percentUsed ?? raw.h5
    raw.d7 = limits.find(l => l.kind === 'seven_day')?.percentUsed ?? raw.d7
  }

  on('session.measure', async ($, e, next) => {
    readLimits(e.rateLimits)
    await recompute($)
    return next(e)
  })

  // The prompt cache TTL, when the engine reports it.
  const ttlHook = (e: { cache_ttl?: string }) => {
    if (e.cache_ttl === '1h' || e.cache_ttl === '5m') detectedTtl = e.cache_ttl
  }
  on('classic.PreModelSwitch', async ($, e, next) => (ttlHook(e), next(e)))
  on('classic.PostModelSwitch', async ($, e, next) => {
    ttlHook(e)
    model = e.to_model || model
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const text = e.text.trim()
    if (!e.isMeta && !e.command && text && !text.startsWith('/')) {
      try {
        model = (await $.session.model()) || model
      } catch {
        // Keep what we had.
      }
      await change($, r => {
        r.isConfused = looksMisfit(text, model)
        r.isWaiting = false
      })
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (MAIN(e)) {
      await change($, r => {
        r.isBusy = true
        r.isWaiting = false
        r.act = null
      })
    } else {
      const id = e.agentId ?? ''
      await change($, (r, now) => {
        if (!r.agents.some(a => a.id === id && a.state === 'run')) r.agents = [...r.agents.filter(a => a.id !== id), { id, state: 'run', at: now }]
      })
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (MAIN(e) && e.model) model = e.model
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (MAIN(e)) {
      await change($, (r, now) => {
        r.isBusy = false
        r.act = null
        r.touchedAt = now
        if (e.reason === 'error' || e.reason === 'refusal') r.errorUntil = now + SHOW.error
      })
      if (e.reason === 'answer' && e.durationMs >= opts.alertSeconds * 1000) {
        $.ui.toast(fill(tr().doneAfter, { t: fmtSpan(e.durationMs) }))
        void chirp($, CHIRP)
      }
    } else {
      const id = e.agentId ?? ''
      const failed = e.reason === 'error' || e.reason === 'aborted' || e.reason === 'refusal'
      await change($, (r, now) => {
        r.agents = r.agents.map(a => (a.id === id ? { ...a, state: failed ? 'fail' : 'done', at: now } : a))
      })
      $.clock.after(Math.max(SHOW.agentDone, SHOW.agentFail) + 100, () => void recompute($))
    }
    return next(e)
  })

  // Waiting for the person: a permission prompt.
  on('classic.Notification', async ($, e, next) => {
    if (/permission/i.test(e.notification_type)) {
      await change($, r => {
        r.isWaiting = true
      })
      await alertWaiting($, tr().waitingYou)
    }
    return next(e)
  })
  on('classic.PermissionRequest', async ($, e, next) => {
    await change($, r => {
      r.isWaiting = true
    })
    await alertWaiting($, tr().waitingYou)
    const out = await next(e)
    await change($, r => {
      r.isWaiting = false
    })
    return out
  })

  on('tool.call', async ($, e, next) => {
    if (!MAIN(e)) return next(e)
    const tool = String(e.tool)
    const act: Act | null = actOf(tool)
    const isQuestion = tool === 'AskUserQuestion'
    await change($, r => {
      r.isWaiting = isQuestion
      if (act) r.act = act
    })
    if (isQuestion) await alertWaiting($, tr().question)
    const out = await next(e)
    const isError = 'isError' in out && out.isError === true
    const isDenied = 'deny' in out && typeof out.deny === 'string'
    await change($, (r, now) => {
      if (isQuestion) r.isWaiting = false
      if (isError) r.errorUntil = now + SHOW.error
    })
    if (isError) $.clock.after(SHOW.error + 100, () => void recompute($))
    // Tasks: the sandcastle.
    let allDone = false
    if (!isError && !isDenied) {
      const before = raw.tasks
      if (tool === 'TodoWrite' && 'todos' in e && Array.isArray(e.todos)) {
        raw.tasks = tasksOfTodos(e.todos)
      } else if (tool === 'TaskCreate') {
        const id = (out as { result?: { task?: { id?: string } } }).result?.task?.id ?? `t${book.size + 1}`
        book.set(id, 'pending')
        raw.tasks = tasksOfBook(book)
      } else if (tool === 'TaskUpdate' && 'taskId' in e && typeof e.taskId === 'string') {
        const st = 'status' in e ? e.status : undefined
        if (st === 'deleted') book.delete(e.taskId)
        else if (st === 'pending' || st === 'in_progress' || st === 'completed') book.set(e.taskId, st)
        raw.tasks = tasksOfBook(book)
      }
      allDone = raw.tasks.total > 0 && raw.tasks.done >= raw.tasks.total && !(before.total > 0 && before.done >= before.total)
      if (raw.tasks !== before) await recompute($)
    }
    // Tests passing after a failure, and commits.
    let isWin = allDone
    if (tool === 'Bash' && 'command' in e && typeof e.command === 'string' && !isDenied) {
      const cmd = e.command
      if (isTestCommand(cmd)) {
        if (isError) lastTestFailed = true
        else if (lastTestFailed) {
          lastTestFailed = false
          isWin = true
        }
      }
      if (!isError && isCommitCommand(cmd)) isWin = true
    }
    if (isWin) await celebrate($)
    return out
  })

  on('session.compact', async ($, e, next) => {
    if (!MAIN(e)) return next(e)
    await change($, r => {
      r.isCompacting = true
    })
    try {
      return await next(e)
    } finally {
      await change($, (r, now) => {
        r.isCompacting = false
        r.compactEndedAt = now
      })
      $.clock.after(SHOW.compactOut + 100, () => void recompute($))
    }
  })

  // /handoff (cockpit's): a crab packs a suitcase and walks off.
  on('command.run', { command: 'handoff' }, async ($, e, next) => {
    await change($, (r, now) => {
      r.handoffAt = now
    })
    $.clock.after(SHOW.handoff + 100, () => void recompute($))
    return next(e)
  })

  // /theme answers on, off and toggle; anything else is Claude Code's own /theme.
  on('command.run', { command: 'theme' }, async ($, e, next) =>
    /^(on|off|toggle)$/i.test((e.args ?? '').trim()) ? themeCommand($, e.args ?? '') : next(e),
  )
  on('command.run', { command: 'lagoon' }, async ($, e) => themeCommand($, e.args ?? ''))

  // -------------------------------------------------------------------------
  // Drawing.

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (e.props.plugin !== PLUGIN || e.props.scene !== SCENE) return next(e)
    if (e.surface !== 'desktop' && e.surface !== 'mobile') return next(e)
    const v = (await read($, view)) ?? viewOf(raw, await $.clock.now())
    const { Svg } = $.ui.resolve(e)
    const source = lagoonSvg(v, { width: opts.width, side: opts.side, mode: e.surface === 'mobile' ? 'full' : 'strip' })
    return <Svg source={source} alt={sceneAlt(v)} isInteractive />
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null
    const v = (await read($, view)) ?? viewOf(raw, await $.clock.now())
    const ui = $.ui.resolve(e) as unknown as UI
    const isOn = await read($, themeOn)
    const isSound = await read($, soundOn)
    return bandRow(ui, $, e.surface, v, isOn, isSound, below, e.props.maxRows)
  })
}

// ---------------------------------------------------------------------------
// The band: [crab] word · 🌊 · 🔔 · the other mods' bands.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type El = any
type UI = { Box: El; Text: El; Button: El; Svg?: El }

export const moodWord = (v: View, s: Strings = tr()): string =>
  v.mood === 'error' && v.critical ? fill(s.limit, { n: Math.max(v.h5 ?? 0, v.d7 ?? 0) }) : s.mood[v.mood]

function bandRow(ui: UI, $: EngineInterface, surface: string, v: View, isOn: boolean, isSound: boolean, below: unknown, maxRows: number) {
  const { Box, Text, Button, Svg } = ui
  const s = tr()
  const rtl = lang === 'ar'
  const word = moodWord(v, s)
  const isSvg = surface !== 'terminal' && Svg !== undefined
  const wrap = maxRows >= 2 ? 'wrap' : 'nowrap'
  if (!isSvg) {
    return (
      <Box key="companion-band" flexDirection={rtl ? 'row-reverse' : 'row'} gap={1} alignItems="center" flexWrap={wrap}>
        <Text key="companion-mood">{`${crabText(v.mood)} ${word}`}</Text>
        {below as never}
      </Box>
    )
  }
  const SvgEl = Svg as El
  return (
    <Box key="companion-band" flexDirection={rtl ? 'row-reverse' : 'row'} gap={1} alignItems="center" flexWrap={wrap}>
      <Box key="companion-crab" flexShrink={0}>
        <SvgEl source={crabSvg(v.mood as Mood, 22, rtl)} alt={`crab: ${v.mood}`} width={crabWidth(22)} height={22} />
      </Box>
      <Text key="companion-mood">{word}</Text>
      <Button key="companion-theme" label={isOn ? '🌊' : '🌊·'} plain dimColor={!isOn} onPress={async () => $.ui.toast(await applyTheme($, !isOn))} />
      <Button key="companion-sound" label={isSound ? '🔔' : '🔕'} plain onPress={async () => $.ui.toast(await toggleSound($))} />
      {below as never}
    </Box>
  )
}
