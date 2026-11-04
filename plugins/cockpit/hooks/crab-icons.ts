// Pixel crab icons: one crab per line of the cockpit, its mood set by the line's
// tone (pose AND body colour) and a prop that says what the line is. The crab is
// the savvy-progress crab of JohnnyVizz/claude-kit (MIT, see
// THIRD_PARTY_NOTICES.md), redrawn chunkier so it reads at 26 px; the moods and
// props are cockpit's own.
//
// Grid: 34 by 24 units, crisp edges, about one pixel per unit at band size. The
// crab stands in x 0-21, the prop in x 22-33. Every prop gets a 1-unit dark
// outline, worked out from its pixels, so it pops on light and dark themes.

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
  // Height in px (26 in the band, 32 in the panel); the width follows the grid.
  size?: number
  // context: how full the backpack is, 0-100; by tone when absent.
  pct?: number
  // cache: expired, the crab sleeps in a frosted cube.
  cold?: boolean
  // Face left (right-to-left layouts).
  mirror?: boolean
}

const GRID_W = 34
const GRID_H = 24

// Body colour per mood: calm clay, light clay, vivid orange, red.
export const BODY: Record<Tone, string> = { green: '#D97757', yellow: '#EBA57E', orange: '#F07418', red: '#DC3B3F' }
const INK = '#1F1E1D'
const OUTLINE = '#26241F'
// Adaptive paper (light inside props).
const P = 'P'

type Cell = { x: number; y: number; c: string; cls: string }
type Fill = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void

const stamper = (f: Fill) => (x: number, y: number, rows: readonly string[], map: Record<string, string>, cls?: string): void =>
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => map[ch] && f(x + dx, y + dy, 1, 1, map[ch] ?? '', cls)))

// ---------------------------------------------------------------------------
// The crab: body x 4-17, y 8-16; legs to y 19; arms 3 wide at the sides.

function crab(f: Fill, tone: Tone, opts: { asleep: boolean; armsDown: boolean; inCube: boolean }): void {
  const stamp = stamper(f)
  const b = BODY[tone]
  f(4, 8, 14, 9, b)
  f(5, 17, 2, 3, b, 'la')
  f(12, 17, 2, 3, b, 'la')
  f(8, 17, 2, 3, b, 'lb')
  f(15, 17, 2, 3, b, 'lb')
  // Eyes: 2 by 3, or shut.
  if (opts.asleep) {
    f(6, 11, 3, 1, INK)
    f(13, 11, 3, 1, INK)
  } else if (tone === 'red') {
    f(6, 11, 2, 2, INK)
    f(14, 11, 2, 2, INK)
    // Angry brows, slanting down to the middle.
    f(5, 9, 2, 1, INK)
    f(7, 10, 1, 1, INK)
    f(15, 9, 2, 1, INK)
    f(14, 10, 1, 1, INK)
  } else {
    f(6, 10, 2, 3, INK)
    f(14, 10, 2, 3, INK)
  }
  if (tone === 'orange' && !opts.asleep) {
    // Worried brows, raised in the middle.
    f(5, 9, 1, 1, INK)
    f(16, 9, 1, 1, INK)
  }
  // Mouths.
  if (opts.asleep) f(9, 14, 4, 1, INK)
  else if (tone === 'green') stamp(8, 13, ['x....x', '.xxxx.'], { x: INK })
  else if (tone === 'yellow') f(8, 14, 6, 1, INK)
  else if (tone === 'orange') stamp(8, 13, ['.x.x.x', 'x.x.x.'], { x: INK })
  else stamp(8, 13, ['.xxxx.', 'x....x'], { x: INK })

  const lowArms = () => {
    f(1, 11, 3, 3, b, 'arm')
    f(18, 11, 3, 3, b, 'arm2')
  }
  if (opts.armsDown || opts.inCube) lowArms()
  else if (tone === 'green') {
    // Claws up, out to the sides.
    f(1, 3, 3, 3, b, 'arm')
    f(2, 6, 2, 4, b, 'arm')
    f(18, 3, 3, 3, b, 'arm2')
    f(18, 6, 2, 4, b, 'arm2')
  } else if (tone === 'yellow') {
    // One claw scratching its head.
    f(1, 8, 2, 4, b, 'arm')
    f(2, 5, 4, 3, b, 'arm')
    f(18, 11, 3, 3, b, 'arm2')
  } else if (tone === 'orange') {
    lowArms()
  } else {
    // Snapping pincers, raised.
    stamp(1, 2, ['x.x', 'xxx', '.x.', '.x.', '.xx', '..x'], { x: b }, 'arm')
    stamp(18, 2, ['x.x', 'xxx', '.x.', '.x.', 'xx.', 'x..'], { x: b }, 'arm2')
  }

  // The accent that names the mood by colour.
  if (opts.asleep) return
  if (tone === 'green') stamp(9, 2, ['.g.', 'ggg', '.g.'], { g: '#2FA866' }, 'fx')
  else if (tone === 'yellow') stamp(8, 3, ['y...y', '.y.y.'], { y: '#F2B705' }, 'fx')
  else if (tone === 'orange') stamp(15, 3, ['.b', 'bb', 'bb'], { b: '#3D9BF0' }, 'fx')
  else {
    stamp(5, 3, ['.s', 's.', '.s'], { s: '#8E929A' }, 'fx')
    stamp(15, 3, ['s.', '.s', 's.'], { s: '#8E929A' }, 'fx2')
  }
}

// ---------------------------------------------------------------------------
// Props: drawn with `p` (outlined) in x 23-32, or with `f` for parts that sit on
// the crab (antenna, pockets, ice cube).

const TONE_FILL: Record<Tone, string> = { green: '#2FA866', yellow: '#F2B705', orange: '#F07418', red: '#DC3B3F' }
const TONE_LEVEL: Record<Tone, number> = { green: 30, yellow: 60, orange: 80, red: 100 }

type PropFn = (p: ReturnType<typeof stamper>, f: Fill, tone: Tone, o: IconOptions) => void

const PROPS: Record<IconKind, PropFn> = {
  usage: p =>
    p(24, 9, [
      '......rr',
      '......rr',
      '...bb.rr',
      '...bb.rr',
      'gg.bb.rr',
      'gg.bb.rr',
      'gg.bb.rr',
      'kkkkkkkk',
    ], { g: '#2FA866', b: '#3D8BEB', r: '#F07418', k: '#5A5A5A' }),

  context: (p, _f, tone, o) => {
    const level = Math.max(0, Math.min(100, o.pct ?? TONE_LEVEL[tone]))
    const filled = Math.round((7 * level) / 100)
    const rows = ['..kkkk..', '..k..k..', 'bbbbbbbb']
    for (let i = 0; i < 7; i++) rows.push(i >= 7 - filled ? 'bffffffb' : 'bPPPPPPb')
    rows.push('bbbbbbbb')
    p(24, 7, rows, { k: '#5A3519', b: '#8A5A1E', P, f: TONE_FILL[tone] })
  },

  five_hour: p =>
    p(24, 6, [
      '...kk...',
      '..kkkk..',
      '.kwwwwk.',
      'kwwwrwwk',
      'kwwwrwwk',
      'kwwwrrwk',
      'kwwwwwwk',
      '.kwwwwk.',
      '..kkkk..',
    ], { k: '#6B6B6B', w: '#FFFFFF', r: '#DC3B3F' }),

  seven_day: p =>
    p(24, 6, [
      '.k....k.',
      'rrrrrrrr',
      'rrrrrrrr',
      'wwwwwwww',
      'wkwkwkww',
      'wwwwwwww',
      'wkwkwkww',
      'wwwwwwww',
    ], { k: '#4A4A4A', r: '#DC3B3F', w: '#FFFFFF' }),

  cost: (p, f, tone) => {
    if (tone === 'red') {
      // Pockets pulled out, nothing in them; the prop is an empty, open purse.
      const s = stamper(f)
      s(3, 15, ['wwww', 'wwww', '.ww.'], { w: '#FFFFFF' })
      s(15, 15, ['wwww', 'wwww', '.ww.'], { w: '#FFFFFF' })
      p(24, 9, [
        'b......b',
        'bb....bb',
        'bbbbbbbb',
        'bPPPPPPb',
        'bPPPPPPb',
        'bbbbbbbb',
      ], { b: '#8A5A1E', P })
      return
    }
    p(24, 7, [
      '..yyyy..',
      '.yyyyyy.',
      'yyykkyyy',
      'yykyyyyy',
      'yyykkyyy',
      'yyyyykyy',
      'yykkyyyy',
      '.yyyyyy.',
      '..yyyy..',
    ], { y: '#F5C542', k: '#8A5A1E' })
  },

  cache: (p, f, _tone, o) => {
    // A clear ice cube around the crab: outline and highlight, no fill; cold
    // adds a frosty tint and "zz".
    if (o.cold) f(1, 2, 21, 19, 'rgba(160,215,255,.28)', 'frost')
    const edge = '#5DB7F2'
    f(0, 1, 23, 1, edge, 'ice')
    f(0, 21, 23, 1, edge, 'ice')
    f(0, 1, 1, 21, edge, 'ice')
    f(22, 1, 1, 21, edge, 'ice')
    f(2, 3, 3, 1, '#FFFFFF', 'shine')
    f(2, 4, 1, 2, '#FFFFFF', 'shine')
    f(19, 18, 2, 1, '#BFE4FB', 'shine')
    if (o.cold) stamper(f)(24, 3, ['zzzz....', '..z.....', '.z...zzz', 'zzzz..z.', '.....zzz'], { z: '#3D9BF0' }, 'zz')
    else p(25, 8, ['...b...', '..bbb..', '.bbwbb.', 'bbwwwbb', '.bbwbb.', '..bbb..', '...b...'], { b: '#5DB7F2', w: '#DDF1FF' })
  },

  model: (p, _f, tone) => {
    // A dial with a white face; the needle points at the tone.
    const needle: Record<Tone, readonly [number, number][]> = {
      green: [[26, 17], [25, 16], [24, 15]],
      yellow: [[27, 16], [27, 15], [27, 14]],
      orange: [[28, 16], [29, 15], [30, 14]],
      red: [[28, 17], [29, 17], [30, 17]],
    }
    const rows = ['..ggyyrr..', '.gwwwwwwr.', 'gwwwwwwwwr', 'gwwwwwwwwr', 'gwwwwwwwwr', 'kkkkkkkkkk']
    p(23, 13, rows, { g: '#2FA866', y: '#F2B705', r: '#DC3B3F', k: '#4A4A4A', w: '#FFFFFF' })
    for (const [x, y] of needle[tone]) p(x, y, ['k'], { k: INK })
    p(27, 17, ['k'], { k: INK })
    if (tone === 'red') p(25, 2, ['.yyy.', 'y...y', '...y.', '..y..', '.....', '..y..'], { y: '#FFD23F' }, 'q')
  },

  breakdown: p =>
    p(23, 6, [
      '..kkkk....',
      '.kccccK...',
      'kcwcccck..',
      'kcccccck..',
      'kcccccck..',
      '.kcccck...',
      '..kkkkb...',
      '......bb..',
      '.......bb.',
      '........bb',
    ], { k: '#4A4A4A', K: '#4A4A4A', c: '#A9DBFA', w: '#FFFFFF', b: '#8A5A1E' }),

  system_prompt: p =>
    p(24, 7, [
      'pppppppp',
      '.wwwwww.',
      '.wkkkkw.',
      '.wwwwww.',
      '.wkkkww.',
      '.wwwwww.',
      '.wkkkkw.',
      'pppppppp',
    ], { w: '#F6E7C1', k: '#8A5A1E', p: '#B8894A' }),

  tools: p =>
    p(23, 6, [
      'gg.gg....',
      'g...g....',
      'gg.gg....',
      '.ggg.....',
      '..ggg....',
      '...ggg...',
      '....ggg..',
      '.....ggg.',
      '......ggg',
      '.......gg',
    ], { g: '#A3A7AE' }),

  mcp: (p, f) => {
    f(11, 3, 1, 5, '#8E929A')
    f(10, 1, 3, 2, '#DC3B3F', 'fx2')
    p(25, 6, [
      '.m..m.',
      '.m..m.',
      'kkkkkk',
      'kkkkkk',
      'kkkkkk',
      '.kkkk.',
      '..kk..',
      '..kk..',
      '..kkkk',
    ], { k: '#A3A7AE', m: '#5A5A5A' })
  },

  skills: p =>
    p(23, 6, [
      '...pp.....',
      '..pppp....',
      'pppppppp..',
      'pppppppp..',
      'pppppppppp',
      'pppppppppp',
      'pppppppp..',
      'pppppppp..',
      'ppp..ppp..',
      'pp....pp..',
    ], { p: '#22B07D' }),

  memory: p =>
    p(24, 6, [
      's.s.s.s.',
      'bbbbbbbb',
      'bwwwwwwb',
      'bwkkkkwb',
      'bwwwwwwb',
      'bwkkkwwb',
      'bwwwwwwb',
      'bwkkkkwb',
      'bbbbbbbb',
    ], { b: '#3D8BEB', w: '#FFFFFF', k: '#9A9A9A', s: '#C9CCD2' }),

  messages: p =>
    p(23, 2, [
      'wwwwwwwwww',
      'wwwwwwwwww',
      'wkwwkwwkww',
      'wwwwwwwwww',
      'wwwwwwwwww',
      '..ww......',
      '.w........',
    ], { w: '#FFFFFF', k: INK }),

  handoff: p =>
    p(23, 9, [
      '...hhhh...',
      '...h..h...',
      'bbbbbbbbbb',
      'bsbbbbbbsb',
      'bbbbbbbbbb',
      'bbbbbbbbbb',
      'bsbbbbbbsb',
      'bbbbbbbbbb',
    ], { h: '#5A3519', b: '#A8743E', s: '#F5C542' }),

  compact: p =>
    // Two arrows pressing in from above and below, a box squashed flat between.
    p(24, 3, [
      '...aa...',
      '...aa...',
      '.aaaaaa.',
      '..aaaa..',
      '...aa...',
      'bbbbbbbb',
      'bccccccb',
      'bbbbbbbb',
      '...aa...',
      '..aaaa..',
      '.aaaaaa.',
      '...aa...',
      '...aa...',
    ], { a: '#3D8BEB', b: '#8A5A1E', c: '#E0AE72' }),
}

const ARMS_DOWN: ReadonlySet<IconKind> = new Set(['compact', 'handoff'])

// ---------------------------------------------------------------------------

export const ICON_CSS = `<style>
.ci .cp{fill:#FFFDF8}@media (prefers-color-scheme: dark){.ci .cp{fill:#F4F1E8}}
.ci-green .fx{animation:ci-blink 1.4s steps(1) infinite}
.ci-yellow .fx{animation:ci-blink 2s steps(1) infinite}
.ci-orange .arm,.ci-orange .arm2{animation:ci-shake .2s steps(1) infinite}.ci-orange .fx{animation:ci-drip 1s linear infinite}
.ci-red .arm{animation:ci-snap .3s steps(1) infinite}.ci-red .arm2{animation:ci-snap .3s steps(1) infinite -.15s}
.ci-red .fx{animation:ci-blink .5s steps(1) infinite}.ci-red .fx2{animation:ci-blink .5s steps(1) infinite -.25s}
.ci .zz{animation:ci-blink 2s steps(1) infinite}
@keyframes ci-blink{50%{opacity:.25}}@keyframes ci-shake{50%{transform:translateX(1px)}}
@keyframes ci-snap{50%{transform:translateY(-1px)}}@keyframes ci-drip{0%{transform:translateY(0)}100%{transform:translateY(2px);opacity:.2}}
@media (prefers-reduced-motion: reduce){.ci *{animation:none!important}}
</style>`

const rectOf = (x: number, y: number, w: number, h: number, c: string): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${c === P ? 'class="cp"' : `fill="${c}"`}/>`

// Single pixels merged into horizontal runs of one colour: a much smaller SVG.
const runs = (px: readonly { x: number; y: number; c: string }[]): string => {
  const last = new Map<string, { x: number; y: number; c: string }>()
  for (const p of px) last.set(`${p.x},${p.y}`, p)
  const sorted = [...last.values()].sort((a, b) => a.y - b.y || a.x - b.x)
  const out: string[] = []
  let i = 0
  while (i < sorted.length) {
    const a = sorted[i] as { x: number; y: number; c: string }
    let w = 1
    while (i + w < sorted.length) {
      const b = sorted[i + w] as { x: number; y: number; c: string }
      if (b.y !== a.y || b.x !== a.x + w || b.c !== a.c) break
      w++
    }
    out.push(rectOf(a.x, a.y, w, 1, a.c))
    i += w
  }
  return out.join('')
}

// The icon as one SVG: the crab in the line's mood, holding the line's prop.
export function crabIcon(kind: IconKind, tone: Tone, opts: IconOptions = {}): string {
  const size = opts.size ?? 26
  const groups = new Map<string, string[]>()
  const f: Fill = (x, y, w, h, c, cls = 'bd') => {
    if (!groups.has(cls)) groups.set(cls, [])
    groups.get(cls)?.push(rectOf(x, y, w, h, c))
  }
  // Prop cells, kept to outline them.
  const cells: Cell[] = []
  const pf: Fill = (x, y, w, h, c, cls = 'pr') => {
    for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) cells.push({ x: x + dx, y: y + dy, c, cls })
  }
  const asleep = kind === 'cache' && opts.cold === true
  crab(f, tone, { asleep, armsDown: ARMS_DOWN.has(kind), inCube: kind === 'cache' })
  PROPS[kind](stamper(pf), f, tone, opts)

  // A 1-unit dark outline around the prop's pixels.
  const taken = new Set(cells.map(c => `${c.x},${c.y}`))
  const ring = new Set<string>()
  for (const c of cells)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const x = c.x + dx
        const y = c.y + dy
        const k = `${x},${y}`
        if (x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && !taken.has(k)) ring.add(k)
      }
  const outline = runs(
    [...ring].map(k => {
      const [x = 0, y = 0] = k.split(',').map(Number)
      return { x, y, c: OUTLINE }
    }),
  )
  const byClass = new Map<string, Cell[]>()
  for (const c of cells) {
    if (!byClass.has(c.cls)) byClass.set(c.cls, [])
    byClass.get(c.cls)?.push(c)
  }
  const propGroups = new Map<string, string>([...byClass].map(([k, v]) => [k, runs(v)]))

  const order = ['frost', 'bd', 'la', 'lb', 'arm', 'arm2', 'ice', 'shine', 'fx', 'fx2']
  const crabPart = [...order, ...[...groups.keys()].filter(k => !order.includes(k))]
    .filter(k => groups.has(k))
    .map(k => `<g class="${k}">${(groups.get(k) ?? []).join('')}</g>`)
    .join('')
  const propPart =
    `<g class="ol">${outline}</g>` + [...propGroups].map(([k, v]) => `<g class="${k}">${v}</g>`).join('')
  const width = Math.round((size * GRID_W) / GRID_H)
  const place = opts.mirror ? ` transform="translate(${GRID_W},0) scale(-1,1)"` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${size}" viewBox="0 0 ${GRID_W} ${GRID_H}" shape-rendering="crispEdges">${ICON_CSS}<g class="ci ci-${tone}"${place}>${crabPart}${propPart}</g></svg>`
}

export const iconWidth = (size: number): number => Math.round((size * GRID_W) / GRID_H)

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
