// Pixel crab, copied from JohnnyVizz/claude-kit savvy-progress (MIT, see
// THIRD_PARTY_NOTICES.md): the body, the legs, the `stamp` helper and the walk
// motion. The poses and props (sleep, tools, check, angry, dance) are
// taskboard's own, drawn the same way.
//
// Grid: 38 by 28 units, crisp edges. The crab stands in x 3-26, the prop it
// holds in x 25-37. Every motion is CSS and stops under prefers-reduced-motion.

import type { Prop } from '../types'

export type CrabKind = 'pending' | 'done' | 'failed' | 'blocked' | 'dance' | `work-${Prop}`

export const CRAB_KINDS: readonly CrabKind[] = [
  'pending', 'work-wrench', 'work-magnifier', 'work-terminal', 'work-antenna', 'work-think', 'done', 'failed', 'blocked', 'dance',
]

export const CLAY = '#D97757'
export const RED = '#DC3B3F'
const INK = '#1F1E1D'
const GRID_W = 38
const GRID_H = 28

type Fill = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void

const stamp = (f: Fill, x: number, y: number, rows: readonly string[], map: Record<string, string>, cls?: string): void =>
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => map[ch] && f(x + dx, y + dy, 1, 1, map[ch] ?? '', cls)))

// The savvy-progress body. `armFront` raises the front claw; `armCls` lets it
// travel with the prop it holds; `armBack` raises the back claw too.
const crabBody = (f: Fill, o: { armFront?: number; armCls?: string; body?: string; eyes?: boolean; armBack?: number } = {}): void => {
  const body = o.body ?? CLAY
  f(7, 10, 16, 12, body)
  f(3, 14 + (o.armBack ?? 0), 4, 4, body, o.armBack ? 'arm' : undefined)
  f(23, 14 + (o.armFront ?? 0), 4, 4, body, o.armCls)
  if (o.eyes !== false) {
    f(9, 12, 2, 2, INK)
    f(19, 12, 2, 2, INK)
  }
  f(7, 22, 2, 4, body, 'la')
  f(17, 22, 2, 4, body, 'la')
  f(11, 22, 2, 4, body, 'lb')
  f(21, 22, 2, 4, body, 'lb')
}

const smile = (f: Fill) => {
  f(12, 16, 1, 1, INK)
  f(13, 17, 4, 1, INK)
  f(17, 16, 1, 1, INK)
}

// The prop held in the raised front claw, per tool kind.
const PROPS: Record<Prop, (f: Fill) => void> = {
  // Edit / Write: a wrench that turns.
  wrench: f => {
    crabBody(f, { armFront: -4, armCls: 'it' })
    f(13, 16, 4, 1, INK)
    stamp(f, 27, 1, ['s...s', 'ss.ss', '.sss.', '..s..', '..s..', '..s..', '..s..', '..d..', '.ddd.'], { s: '#A3A7AE', d: '#6B7079' }, 'it')
  },
  // Read / Grep / Glob: a magnifier that sweeps and glints.
  magnifier: f => {
    crabBody(f, { armFront: -4, armCls: 'it' })
    f(13, 16, 4, 1, INK)
    stamp(f, 26, 1, ['.kkkk.', 'k....k', 'k....k', 'k....k', 'k....k', '.kkkk.'], { k: '#4A4E57' }, 'it')
    f(27, 2, 4, 4, 'rgba(150,205,245,.65)', 'it')
    f(27, 2, 1, 1, '#FFFFFF', 'gl')
    stamp(f, 25, 7, ['.bb', 'bb.', 'b..'], { b: '#7A4A26' }, 'it')
  },
  // Bash: a little terminal with a blinking cursor.
  terminal: f => {
    crabBody(f, { armFront: -2 })
    f(13, 16, 4, 1, INK)
    stamp(f, 25, 4, ['kkkkkkkkkkkk', 'kddddddddddk', 'kdgddddddddk', 'kddgdddddddk', 'kdgddddddddk', 'kddddddddddk', 'kkkkkkkkkkkk', '....kkkk....'], { k: '#5A5E66', d: '#1B1D22', g: '#3FD27A' })
    f(29, 8, 3, 1, '#F4F3EE', 'cur')
  },
  // Web: an antenna on the head, signal waves pulsing out.
  antenna: f => {
    crabBody(f)
    f(13, 16, 4, 1, INK)
    f(14, 4, 2, 6, '#8E929A')
    f(13, 2, 4, 2, RED, 'tip')
    stamp(f, 18, 1, ['.w.', 'w..', 'w..', '.w.'], { w: '#3D9BF0' }, 'w1')
    stamp(f, 21, 0, ['.w.', 'w..', 'w..', 'w..', '.w.'], { w: '#3D9BF0' }, 'w2')
    stamp(f, 10, 1, ['.w.', '..w', '..w', '.w.'], { w: '#3D9BF0' }, 'w1')
  },
  // Thinking (no tool yet, or another tool): dots float up.
  think: f => {
    crabBody(f, { armFront: -2 })
    f(13, 16, 4, 1, INK)
    f(26, 8, 2, 2, '#A3A7AE', 'd1')
    f(29, 5, 3, 3, '#A3A7AE', 'd2')
    stamp(f, 32, 0, ['.www.', 'wwwww', 'wwwww', '.www.'], { w: '#C9CCD2' }, 'd3')
  },
}

const POSES: Record<CrabKind, (f: Fill) => void> = {
  // Pending: asleep, eyes shut, Zz floating up.
  pending: f => {
    crabBody(f, { eyes: false })
    f(9, 13, 2, 1, INK)
    f(19, 13, 2, 1, INK)
    f(13, 17, 4, 1, INK)
    stamp(f, 25, 5, ['zzz', '..z', '.z.', 'zzz'], { z: '#8E929A' }, 'z1')
    stamp(f, 30, 1, ['zz', '.z', 'zz'], { z: '#8E929A' }, 'z2')
  },
  'work-wrench': f => PROPS.wrench(f),
  'work-magnifier': f => PROPS.magnifier(f),
  'work-terminal': f => PROPS.terminal(f),
  'work-antenna': f => PROPS.antenna(f),
  'work-think': f => PROPS.think(f),
  // Done: a smile and a green check.
  done: f => {
    crabBody(f)
    smile(f)
    stamp(f, 27, 5, ['.........g', '........gg', '.......gg.', 'g.....gg..', 'gg...gg...', '.gg.gg....', '..ggg.....', '...g......'], { g: '#2FA866' }, 'ck')
  },
  // Failed: red, frowning brows, steam, a red cross.
  failed: f => {
    crabBody(f, { armFront: -4, body: RED })
    f(8, 10, 4, 1, INK)
    f(18, 10, 4, 1, INK)
    f(12, 18, 6, 1, INK)
    f(12, 17, 1, 1, INK)
    f(17, 17, 1, 1, INK)
    stamp(f, 4, 5, ['.ss', 'ss.', '.ss'], { s: '#8E929A' }, 'st')
    stamp(f, 22, 4, ['ss.', '.ss', 'ss.'], { s: '#8E929A' }, 'st2')
    stamp(f, 29, 3, ['r.....r', 'rr...rr', '.rr.rr.', '..rrr..', '.rr.rr.', 'rr...rr', 'r.....r'], { r: RED })
  },
  // Blocked: red and cross, holding a padlock.
  blocked: f => {
    crabBody(f, { armFront: -4, body: RED })
    f(8, 10, 4, 1, INK)
    f(18, 10, 4, 1, INK)
    f(12, 18, 6, 1, INK)
    f(12, 17, 1, 1, INK)
    f(17, 17, 1, 1, INK)
    stamp(f, 4, 5, ['.ss', 'ss.', '.ss'], { s: '#8E929A' }, 'st')
    stamp(f, 28, 2, ['.kkkk.', 'k....k', 'k....k', 'yyyyyy', 'yyKKyy', 'yyKKyy', 'yyyyyy'], { k: '#8E929A', y: '#F2B705', K: '#5A3519' })
  },
  // All done: both claws up, music notes, a sway.
  dance: f => {
    crabBody(f, { armFront: -8, armBack: -8 })
    smile(f)
    stamp(f, 27, 2, ['..kk', '..k.', '..k.', 'kkk.', 'kkk.'], { k: '#3D8BEB' }, 'n1')
    stamp(f, 32, 6, ['.kkk', '.k.k', '.k.k', 'kk.k', 'kk.k'], { k: '#C77DFF' }, 'n2')
    f(1, 3, 1, 1, '#F2B705', 'n2')
    f(13, 4, 1, 1, '#2FA866', 'n1')
    f(19, 2, 1, 1, '#E5484D', 'n2')
  },
}

// Pure CSS, run by the compositor; every motion stops under reduced motion.
export const CRAB_CSS = `<style>
.tb g{transform-box:fill-box}
.k-work .la{animation:st .5s steps(1) infinite}.k-work .lb{animation:st .5s steps(1) infinite -.25s}
.k-work .bd{animation:bob .5s steps(1) infinite -.125s}
@keyframes st{50%{transform:translateY(-1px)}}@keyframes bob{50%{transform:translateY(1px)}}
.k-work-wrench .it{transform-origin:50% 100%;animation:twist .5s ease-in-out infinite}
@keyframes twist{50%{transform:rotate(-30deg)}}
.k-work-magnifier .it{animation:scan 1s steps(1) infinite}.k-work-magnifier .gl{animation:blink 1s steps(1) infinite -.5s}
@keyframes scan{25%{transform:translate(-1px,1px)}50%{transform:translate(-2px,2px)}75%{transform:translate(-1px,1px)}}
.k-work-terminal .cur{animation:blink .8s steps(1) infinite}
.k-work-antenna .w1{animation:blink .8s steps(1) infinite}.k-work-antenna .w2{animation:blink .8s steps(1) infinite -.4s}.k-work-antenna .tip{animation:blink 1.6s steps(1) infinite}
.k-work-think .d1{animation:blink 1.2s steps(1) infinite}.k-work-think .d2{animation:blink 1.2s steps(1) infinite -.4s}.k-work-think .d3{animation:blink 1.2s steps(1) infinite -.8s}
.k-pending .z1{animation:blink 2s steps(1) infinite}.k-pending .z2{animation:blink 2s steps(1) infinite -1s}
.k-done .bd{animation:hop 1.2s steps(1) infinite}
@keyframes hop{50%{transform:translateY(-1px)}}
.k-failed .bd,.k-blocked .bd{animation:shake .25s steps(1) infinite}
.k-failed .st,.k-blocked .st{animation:blink .4s steps(1) infinite}.k-failed .st2{animation:blink .4s steps(1) infinite -.2s}
@keyframes shake{50%{transform:translateX(1px)}}
.k-dance{animation:sway .6s steps(1) infinite;transform-box:fill-box;transform-origin:50% 100%}
.k-dance .la{animation:st .3s steps(1) infinite}.k-dance .lb{animation:st .3s steps(1) infinite -.15s}
.k-dance .arm{animation:st .3s steps(1) infinite -.15s}
.k-dance .n1{animation:blink .6s steps(1) infinite}.k-dance .n2{animation:blink .6s steps(1) infinite -.3s}
@keyframes sway{0%{transform:translateX(-1px) rotate(-4deg)}50%{transform:translateX(1px) rotate(4deg)}}
@keyframes blink{50%{opacity:.15}}
@media (prefers-reduced-motion: reduce){.tb,.tb *{animation:none!important}}
</style>`

export const crabWidth = (size: number): number => Math.round((size * GRID_W) / GRID_H)

// One crab as a whole SVG document, `size` px tall. `mirror` faces it left.
export function crabSvg(kind: CrabKind, opts: { size?: number; mirror?: boolean } = {}): string {
  const size = opts.size ?? 26
  const groups = new Map<string, string[]>([['bd', []]])
  const f: Fill = (x, y, w, h, c, cls = 'bd') => {
    if (!groups.has(cls)) groups.set(cls, [])
    groups.get(cls)?.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`)
  }
  POSES[kind](f)
  const group = (cls: string) => `<g class="${cls}">${(groups.get(cls) ?? []).join('')}</g>`
  // Props ride the body's bob; legs step on their own.
  const props = [...groups.keys()].filter(k => k !== 'bd' && k !== 'la' && k !== 'lb')
  const body = `<g class="bd">${(groups.get('bd') ?? []).join('')}${props.map(group).join('')}</g>`
  const cls = kind.startsWith('work-') ? `k-work k-${kind}` : `k-${kind}`
  const place = opts.mirror ? ` transform="translate(${GRID_W},0) scale(-1,1)"` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${crabWidth(size)}" height="${size}" viewBox="0 0 ${GRID_W} ${GRID_H}" shape-rendering="crispEdges">${CRAB_CSS}<g${place}><g class="tb ${cls}">${body}${group('la')}${group('lb')}</g></g></svg>`
}

// The terminal's crab: a glyph and a mark for its state or prop.
export const crabText = (kind: CrabKind): string =>
  ({
    pending: '▣z',
    'work-wrench': '▣🔧',
    'work-magnifier': '▣🔍',
    'work-terminal': '▣>_',
    'work-antenna': '▣📡',
    'work-think': '▣…',
    done: '▣✓',
    failed: '▣✗',
    blocked: '▣⏸',
    dance: '▣♪',
  })[kind]
