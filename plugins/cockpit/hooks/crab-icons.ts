// Pixel crab icons: one crab per line of the cockpit, its pose set by the line's
// tone and a prop that says what the line is. The crab body and the stamp helper
// come from JohnnyVizz/claude-kit savvy-progress (MIT, see THIRD_PARTY_NOTICES.md);
// the poses and props are cockpit's own.
//
// Grid: 40 by 30 units, crisp edges. The crab stands in x 0-27 (the savvy-progress
// grid), the prop in x 27-39. Colours that must read on both themes (outlines,
// paper) are classes, switched under prefers-color-scheme.

import type { Tone } from '../types'

export type IconKind =
  | 'usage'
  | 'context'
  | 'five_hour'
  | 'seven_day'
  | 'cost'
  | 'cache'
  | 'model'
  | 'breakdown'
  | 'system_prompt'
  | 'tools'
  | 'mcp'
  | 'skills'
  | 'memory'
  | 'messages'
  | 'handoff'
  | 'compact'

export const ICON_KINDS: readonly IconKind[] = [
  'usage', 'context', 'five_hour', 'seven_day', 'cost', 'cache', 'model', 'breakdown',
  'system_prompt', 'tools', 'mcp', 'skills', 'memory', 'messages', 'handoff', 'compact',
]

export const TONES: readonly Tone[] = ['green', 'yellow', 'orange', 'red']

export type IconOptions = {
  // Height in px; the width follows the 4:3 grid.
  size?: number
  // context: how full the backpack is, 0-100; by tone when absent.
  pct?: number
  // cache: expired, the crab sleeps in its ice cube.
  cold?: boolean
  // Face left (right-to-left layouts).
  mirror?: boolean
}

const CLAY = '#D97757'
const ANGRY = '#E5484D'
const INK = '#1F1E1D'
// Adaptive colours: `O` outline, `P` paper.
const O = 'O'
const P = 'P'

type Fill = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void

const stamp = (f: Fill, x: number, y: number, rows: readonly string[], map: Record<string, string>, cls?: string): void =>
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => map[ch] && f(x + dx, y + dy, 1, 1, map[ch] ?? '', cls)))

// ---------------------------------------------------------------------------
// The crab in four moods.

type Pose = { body: string; eyes: 'open' | 'shut' }

function crabPose(f: Fill, tone: Tone, pose: Pose, armsDown = false): void {
  const body = pose.body
  f(7, 10, 16, 12, body)
  f(7, 22, 2, 4, body, 'la')
  f(17, 22, 2, 4, body, 'la')
  f(11, 22, 2, 4, body, 'lb')
  f(21, 22, 2, 4, body, 'lb')
  if (pose.eyes === 'open') {
    f(9, 12, 2, 2, INK)
    f(19, 12, 2, 2, INK)
  } else {
    f(9, 13, 2, 1, INK)
    f(19, 13, 2, 1, INK)
  }
  if (tone === 'green') {
    // Happy: claws up, a smile, a tiny heart.
    if (armsDown) {
      f(3, 14, 4, 4, body, 'arm')
      f(23, 14, 4, 4, body, 'arm')
    } else {
      // Raised out to the sides, elbows bent, clear of the head.
      f(1, 5, 4, 4, body, 'arm')
      f(3, 9, 2, 2, body, 'arm')
      f(5, 11, 2, 3, body, 'arm')
      f(25, 5, 4, 4, body, 'arm')
      f(25, 9, 2, 2, body, 'arm')
      f(23, 11, 2, 3, body, 'arm')
    }
    f(12, 17, 1, 1, INK)
    f(13, 18, 4, 1, INK)
    f(17, 17, 1, 1, INK)
    stamp(f, 1, 2, ['h.h', 'hhh', '.h.'], { h: '#E5484D' }, 'fx')
  } else if (tone === 'yellow') {
    // Neutral: still, one claw scratching its head.
    // Elbow out at the side, claw resting on the head's corner.
    f(3, 9, 2, 5, body, 'arm')
    f(5, 13, 2, 2, body, 'arm')
    f(4, 6, 5, 3, body, 'arm')
    f(23, 14, 4, 4, body, 'arm')
    f(12, 18, 6, 1, INK)
    stamp(f, 3, 3, ['o.o', '.o.'], { o: O }, 'fx')
  } else if (tone === 'orange') {
    // Worried: slanted brows, wobbly mouth, a sweat drop, shaking claws.
    f(3, 14, 4, 4, body, 'arm')
    f(23, 14, 4, 4, body, 'arm')
    f(8, 10, 1, 1, INK)
    f(9, 9, 2, 1, INK)
    f(21, 10, 1, 1, INK)
    f(19, 9, 2, 1, INK)
    stamp(f, 12, 17, ['.x.x.x', 'x.x.x.'], { x: INK })
    stamp(f, 3, 5, ['.b', 'bb', 'bb'], { b: '#5BB4F0' }, 'fx')
  } else {
    // Angry: red, frowning brows, steam puffs, snapping claws.
    f(3, 12, 4, 4, body, 'arm')
    f(3, 11, 1, 1, body, 'arm')
    f(6, 11, 1, 1, body, 'arm')
    f(23, 12, 4, 4, body, 'arm2')
    f(23, 11, 1, 1, body, 'arm2')
    f(26, 11, 1, 1, body, 'arm2')
    f(8, 10, 2, 1, INK)
    f(10, 11, 1, 1, INK)
    f(20, 10, 2, 1, INK)
    f(19, 11, 1, 1, INK)
    f(12, 17, 6, 1, INK)
    f(12, 18, 1, 1, INK)
    f(17, 18, 1, 1, INK)
    stamp(f, 4, 3, ['.ss', 'ss.', '.ss'], { s: '#B9BCC2' }, 'fx')
    stamp(f, 21, 3, ['ss.', '.ss', 'ss.'], { s: '#B9BCC2' }, 'fx2')
  }
}

// ---------------------------------------------------------------------------
// Props. Each draws in x 27-39 unless it says otherwise.

const TONE_FILL: Record<Tone, string> = { green: '#3B9C5F', yellow: '#D9B21B', orange: '#E8833A', red: '#E5484D' }
const TONE_LEVEL: Record<Tone, number> = { green: 30, yellow: 60, orange: 80, red: 100 }

type Prop = (f: Fill, tone: Tone, o: IconOptions) => void

const PROPS: Record<IconKind, Prop> = {
  // 📊 A mini bar chart.
  usage: f =>
    stamp(f, 28, 10, [
      '.......rr.',
      '.......rr.',
      '....bb.rr.',
      '....bb.rr.',
      '.gg.bb.rr.',
      '.gg.bb.rr.',
      '.gg.bb.rr.',
      '.gg.bb.rr.',
      'oooooooooo',
    ], { g: '#3B9C5F', b: '#378ADD', r: '#E8833A', o: O }),

  // 🧠 A backpack that fills with the context.
  context: (f, tone, o) => {
    stamp(f, 28, 9, [
      '..ooooo..',
      '.o.....o.',
      'ooooooooo',
      'oPPPPPPPo',
      'oPPPPPPPo',
      'oPPPPPPPo',
      'oPPPPPPPo',
      'oPPPPPPPo',
      'oPPPPPPPo',
      'oPPPPPPPo',
      'ooooooooo',
    ], { o: O, P })
    const pct = Math.max(0, Math.min(100, o.pct ?? TONE_LEVEL[tone]))
    const rows = Math.round((7 * pct) / 100)
    if (rows > 0) f(29, 12 + 7 - rows, 7, rows, TONE_FILL[tone])
  },

  // ⏱️ A stopwatch.
  five_hour: f =>
    stamp(f, 28, 9, [
      '...ooo...',
      '....o....',
      '..ooooo..',
      '.oPPPPPo.',
      'oPPPrPPPo',
      'oPPPrPPPo',
      'oPPPrrPPo',
      'oPPPPPPPo',
      '.oPPPPPo.',
      '..ooooo..',
    ], { o: O, P, r: '#E5484D' }),

  // 📅 A calendar page.
  seven_day: f =>
    stamp(f, 28, 9, [
      '.o.....o.',
      'ooooooooo',
      'orrrrrrro',
      'orrrrrrro',
      'oPPPPPPPo',
      'oPoPoPoPo',
      'oPPPPPPPo',
      'oPoPoPoPo',
      'oPPPPPPPo',
      'ooooooooo',
    ], { o: O, P, r: '#E5484D' }),

  // 💵 A coin; red: pockets turned out, nothing left.
  cost: (f, tone) => {
    if (tone === 'red') {
      // Pockets pulled out of both sides, empty; a little dust falls out.
      stamp(f, 1, 17, ['oooooo', 'oPPPPo', 'oPPPPo', '.oPPo.', '..oo..'], { o: O, P })
      stamp(f, 23, 17, ['oooooo', 'oPPPPo', 'oPPPPo', '.oPPo.', '..oo..'], { o: O, P })
      stamp(f, 30, 19, ['o...', '..o.', '....', 'o..o', '....', '.o..'], { o: '#B9BCC2' }, 'fx2')
      return
    }
    stamp(f, 28, 10, [
      '..ooooo..',
      '.oyyyyyo.',
      'oyyykkyyo',
      'oyykyyyyo',
      'oyyykkyyo',
      'oyyyyykyo',
      'oyykkyyyo',
      '.oyyyyyo.',
      '..ooooo..',
    ], { y: '#F5C542', k: '#8A5A1E', o: '#B8860B' })
  },

  // 🧊 Inside an ice cube; cold: asleep, "zz".
  cache: (f, _tone, o) => {
    f(1, 5, 28, 23, 'rgba(150,205,245,.35)', 'ice')
    f(1, 5, 28, 1, '#9FD3F5', 'ice')
    f(1, 27, 28, 1, '#9FD3F5', 'ice')
    f(1, 5, 1, 23, '#9FD3F5', 'ice')
    f(28, 5, 1, 23, '#9FD3F5', 'ice')
    f(3, 7, 3, 1, '#FFFFFF', 'ice')
    f(3, 8, 1, 3, '#FFFFFF', 'ice')
    if (o.cold) stamp(f, 29, 3, ['......ooo', '.......o.', 'ooooo.ooo', '...o.....', '..o......', '.o.......', 'ooooo....'], { o: O }, 'zz')
    else stamp(f, 31, 12, ['.b.b.', 'b.b.b', '.bbb.', 'b.b.b', '.b.b.'], { b: '#5BB4F0' })
  },

  // 🤖 A gauge; red: the wrong model, a confused "?".
  model: (f, tone) => {
    stamp(f, 28, 14, [
      '...ooooo...',
      '..oggyyro..',
      '.ogg...rro.',
      'ogg.....rro',
      'ooooooooooo',
    ], { o: O, g: '#3B9C5F', y: '#D9B21B', r: '#E5484D' })
    const needle: Record<Tone, readonly [number, number][]> = {
      green: [[32, 17], [31, 16]],
      yellow: [[33, 17], [33, 16]],
      orange: [[34, 17], [35, 16]],
      red: [[34, 17], [35, 17]],
    }
    for (const [x, y] of needle[tone]) f(x, y, 1, 1, INK)
    f(33, 17, 1, 1, INK)
    if (tone === 'red') stamp(f, 29, 3, ['.ooo.', 'o...o', '...o.', '..o..', '.....', '..o..'], { o: '#F5C542' }, 'q')
  },

  // 🔎 A detective's magnifier.
  breakdown: f =>
    stamp(f, 28, 8, [
      '..oooo....',
      '.occcco...',
      'occwccco..',
      'occcccco..',
      'occcccco..',
      '.occcco...',
      '..oooo....',
      '......bb..',
      '.......bb.',
      '........bb',
    ], { o: O, c: 'rgba(150,205,245,.6)', w: '#FFFFFF', b: '#8A5A1E' }),

  // 📜 A scroll.
  system_prompt: f =>
    stamp(f, 28, 9, [
      'pppppppppp',
      '.wwwwwwww.',
      '.wkkkkkkw.',
      '.wwwwwwww.',
      '.wkkkkwww.',
      '.wwwwwwww.',
      '.wkkkkkkw.',
      '.wwwwwwww.',
      'pppppppppp',
    ], { w: '#F3E2B8', k: '#8A5A1E', p: '#B8894A' }),

  // 🔧 A wrench.
  tools: f =>
    stamp(f, 28, 8, [
      'gg.gg.....',
      'g...g.....',
      'gg.gg.....',
      '.ggg......',
      '...gg.....',
      '....gg....',
      '.....gg...',
      '......gg..',
      '.......gg.',
      '........gg',
    ], { g: '#8E929A' }),

  // 🔌 An antenna on its head and a plug in its claw.
  mcp: f => {
    f(15, 3, 1, 7, '#8E929A')
    f(14, 1, 3, 2, '#E5484D', 'fx')
    stamp(f, 30, 9, [
      '.m.m.',
      '.m.m.',
      'ooooo',
      'ooooo',
      'ooooo',
      '.ooo.',
      '..o..',
      '..o..',
      '..ooo',
    ], { o: O, m: '#B9BCC2' })
  },

  // 🧩 A puzzle piece.
  skills: f =>
    stamp(f, 28, 8, [
      '...pp.....',
      '..pppp....',
      'oooooooo..',
      'pppppppp..',
      'ppppppppp.',
      'pppppppppp',
      'pppppppppp',
      'ppppppppp.',
      'pppppppp..',
      'ppp..ppp..',
      'pp....pp..',
    ], { p: '#1D9E75', o: '#178A65' }),

  // 🗂️ A notebook.
  memory: f =>
    stamp(f, 28, 8, [
      's.s.s.s.',
      'bbbbbbbb',
      'bPPPPPPb',
      'bPkkkkPb',
      'bPPPPPPb',
      'bPkkkPPb',
      'bPPPPPPb',
      'bPkkkkPb',
      'bPPPPPPb',
      'bbbbbbbb',
    ], { b: '#378ADD', P, k: '#8E929A', s: O }),

  // 💬 A speech bubble.
  messages: f =>
    stamp(f, 27, 2, [
      '.ooooooooo.',
      'oPPPPPPPPPo',
      'oPoPPoPPoPo',
      'oPPPPPPPPPo',
      '.ooooPPooo.',
      '.....oo....',
      '....o......',
    ], { o: O, P }),

  // 🧳 A suitcase.
  handoff: f =>
    stamp(f, 28, 12, [
      '...hhh...',
      '..h...h..',
      'bbbbbbbbb',
      'bsbbbbbsb',
      'bbbbbbbbb',
      'bsbbbbbsb',
      'bbbbbbbbb',
      'bbbbbbbbb',
    ], { h: '#5A3519', b: '#9A6A3A', s: '#E0B040' }),

  // 🗜️ Squashing a box flat.
  compact: f =>
    stamp(f, 28, 12, [
      '....oo....',
      '....oo....',
      '..oooooo..',
      '...oooo...',
      '....oo....',
      '..........',
      'kkkkkkkkkk',
      'kcccccccck',
      'kkkkkkkkkk',
    ], { o: O, k: '#8A5A1E', c: '#D9A66A' }),
}

// Props held low keep the claws down even when happy.
const ARMS_DOWN: ReadonlySet<IconKind> = new Set(['compact', 'handoff', 'cache'])

// ---------------------------------------------------------------------------

export const ICON_CSS = `<style>
.ci .co{fill:#3A3A3C}.ci .cp{fill:#FBFAF6}
@media (prefers-color-scheme: dark){.ci .co{fill:#D4D4D0}.ci .cp{fill:#EDEBE4}}
.ci-green .fx{animation:ci-blink 1.2s steps(1) infinite}
.ci-orange .arm{animation:ci-shake .2s steps(1) infinite}.ci-orange .fx{animation:ci-drip 1s linear infinite}
.ci-red .arm{animation:ci-snap .3s steps(1) infinite}.ci-red .arm2{animation:ci-snap .3s steps(1) infinite -.15s}
.ci-red .fx{animation:ci-blink .5s steps(1) infinite}.ci-red .fx2{animation:ci-blink .5s steps(1) infinite -.25s}
.ci .zz{animation:ci-blink 2s steps(1) infinite}
@keyframes ci-blink{50%{opacity:.2}}@keyframes ci-shake{50%{transform:translateX(1px)}}
@keyframes ci-snap{50%{transform:translateY(-1px)}}@keyframes ci-drip{0%{transform:translateY(0)}100%{transform:translateY(3px);opacity:0}}
@media (prefers-reduced-motion: reduce){.ci *{animation:none!important}}
</style>`

const rectOf = (x: number, y: number, w: number, h: number, c: string): string => {
  const paint = c === O ? 'class="co"' : c === P ? 'class="cp"' : `fill="${c}"`
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${paint}/>`
}

// The icon as one SVG: the crab in the line's mood, holding the line's prop.
export function crabIcon(kind: IconKind, tone: Tone, opts: IconOptions = {}): string {
  const size = opts.size ?? 20
  const groups = new Map<string, string[]>()
  const f: Fill = (x, y, w, h, c, cls = 'bd') => {
    if (!groups.has(cls)) groups.set(cls, [])
    groups.get(cls)?.push(rectOf(x, y, w, h, c))
  }
  const asleep = kind === 'cache' && opts.cold === true
  crabPose(f, tone, { body: tone === 'red' ? ANGRY : CLAY, eyes: asleep ? 'shut' : 'open' }, ARMS_DOWN.has(kind))
  PROPS[kind](f, tone, opts)
  // Ice goes over the crab; everything else under the effects.
  const order = ['bd', 'la', 'lb', 'arm', 'arm2', 'ice', 'fx', 'fx2', 'zz']
  const body = [...order, ...[...groups.keys()].filter(k => !order.includes(k))]
    .filter(k => groups.has(k))
    .map(k => `<g class="${k}">${(groups.get(k) ?? []).join('')}</g>`)
    .join('')
  const width = Math.round((size * 40) / 30)
  const place = opts.mirror ? ' transform="translate(40,0) scale(-1,1)"' : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${size}" viewBox="0 0 40 30" shape-rendering="crispEdges">${ICON_CSS}<g class="ci ci-${tone}"${place}>${body}</g></svg>`
}

// What each icon replaces, for the preview sheet and the alt texts.
export const ICON_LABEL: Record<IconKind, [label: string, emoji: string]> = {
  usage: ['Usage', '📊'],
  context: ['Context', '🧠'],
  five_hour: ['5-hour limit', '⏱️'],
  seven_day: ['7-day limit', '📅'],
  cost: ['Session cost', '💵'],
  cache: ['Cache', '🧊'],
  model: ['Model & effort', '🤖'],
  breakdown: ['What uses your tokens', '🔎'],
  system_prompt: ['System prompt', '📜'],
  tools: ['Built-in tools', '🔧'],
  mcp: ['MCP tools', '🔌'],
  skills: ['Skills', '🧩'],
  memory: ['Memory files', '🗂️'],
  messages: ['Messages', '💬'],
  handoff: ['Handoff', '🧳'],
  compact: ['Compact now', '🗜️'],
}
