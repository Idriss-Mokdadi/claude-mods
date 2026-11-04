// Pixel crab, copied from JohnnyVizz/claude-kit savvy-progress (MIT, see
// THIRD_PARTY_NOTICES.md): body, legs, the stamp helper and the CSS motion.
// The mood props (happy, sweat, angry, sleep, suitcase, gauge) are cockpit's own, drawn the same way.

import type { Mood } from '../types'

export const CLAY = '#D97757'
const INK = '#1F1E1D'

type Fill = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void

const stamp = (f: Fill, x: number, y: number, rows: string[], map: Record<string, string>, cls?: string): void =>
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => map[ch] && f(x + dx, y + dy, 1, 1, map[ch] ?? '', cls)))

const crabBody = (f: Fill, armFront = 0, armCls?: string, body = CLAY, eyes = true): void => {
  f(7, 10, 16, 12, body)
  f(3, 14, 4, 4, body)
  f(23, 14 + armFront, 4, 4, body, armCls)
  if (eyes) {
    f(9, 12, 2, 2, INK)
    f(19, 12, 2, 2, INK)
  }
  f(7, 22, 2, 4, body, 'la')
  f(17, 22, 2, 4, body, 'la')
  f(11, 22, 2, 4, body, 'lb')
  f(21, 22, 2, 4, body, 'lb')
}

const ANGRY = '#E5484D'

// Pure CSS, run by the compositor. Every motion stops under prefers-reduced-motion.
export const CRAB_CSS = `<style>
.run .la{animation:st .5s steps(1) infinite}.run .lb{animation:st .5s steps(1) infinite -.25s}
.run .bd{animation:bob .5s steps(1) infinite -.125s}
.run g{transform-box:fill-box}
@keyframes st{50%{transform:translateY(-1px)}}@keyframes bob{50%{transform:translateY(1px)}}
.m-calm .bd{animation:bob 2s steps(1) infinite}
.m-sweat .sw{animation:drip 1s linear infinite}.m-sweat .sw2{animation:drip 1s linear infinite -.5s}
@keyframes drip{0%{transform:translateY(0);opacity:1}100%{transform:translateY(4px);opacity:0}}
.m-sweat .bd{animation:shake .25s steps(1) infinite}
@keyframes shake{50%{transform:translateX(1px)}}
.m-happy .bd{animation:hop 1s steps(1) infinite}.m-happy .hr{animation:blink 1s steps(1) infinite}
@keyframes hop{50%{transform:translateY(-1px)}}
.m-angry .st{animation:blink .4s steps(1) infinite}.m-angry .st2{animation:blink .4s steps(1) infinite -.2s}
.m-angry .bd{animation:shake .2s steps(1) infinite}
.m-sleep .z1{animation:blink 2s steps(1) infinite}.m-sleep .z2{animation:blink 2s steps(1) infinite -1s}
@keyframes blink{50%{opacity:.15}}
.m-suitcase .la{animation:st .5s steps(1) infinite}.m-suitcase .lb{animation:st .5s steps(1) infinite -.25s}
.m-suitcase .it{animation:bob .5s steps(1) infinite}
.m-gauge .nd{transform-box:fill-box;transform-origin:50% 100%;animation:sweep 2s ease-in-out infinite}
@keyframes sweep{0%,100%{transform:rotate(-50deg)}50%{transform:rotate(50deg)}}
@media (prefers-reduced-motion: reduce){.mood,.mood g{animation:none!important}}
</style>`

const MOODS: Record<Mood, (f: Fill) => void> = {
  // Calm: the plain crab, a slow bob.
  calm: f => crabBody(f),
  // Warning: sweat drops off the head, a nervous shake.
  sweat: f => {
    crabBody(f)
    f(5, 7, 1, 2, '#5BB4F0', 'sw')
    f(25, 6, 1, 2, '#5BB4F0', 'sw2')
    f(13, 16, 4, 1, INK)
  },
  // Happy: a smile and a little heart.
  happy: f => {
    crabBody(f)
    f(12, 16, 1, 1, INK)
    f(13, 17, 4, 1, INK)
    f(17, 16, 1, 1, INK)
    stamp(f, 24, 4, ['h.h', 'hhh', '.h.'], { h: '#E5484D' }, 'hr')
  },
  // Critical or wrong model: red, frowning brows, steam puffs.
  angry: f => {
    crabBody(f, -4, undefined, ANGRY)
    f(8, 10, 4, 1, INK)
    f(18, 10, 4, 1, INK)
    f(12, 18, 6, 1, INK)
    f(12, 17, 1, 1, INK)
    f(17, 17, 1, 1, INK)
    stamp(f, 4, 4, ['.ss', 'ss.', '.ss'], { s: '#C9CCD2' }, 'st')
    stamp(f, 23, 3, ['ss.', '.ss', 'ss.'], { s: '#C9CCD2' }, 'st2')
  },
  // Cache cold: eyes shut, Zz floating up.
  sleep: f => {
    crabBody(f, 0, undefined, CLAY, false)
    f(9, 13, 2, 1, INK)
    f(19, 13, 2, 1, INK)
    stamp(f, 22, 4, ['zzz', '..z', '.z.', 'zzz'], { z: '#8E929A' }, 'z1')
    stamp(f, 26, 0, ['zz', '.z', 'zz'], { z: '#8E929A' }, 'z2')
  },
  // Handoff: walking off with a suitcase.
  suitcase: f => {
    crabBody(f)
    stamp(f, 22, 15, ['..hh..', '.h..h.', 'bbbbbb', 'bsbbsb', 'bbbbbb', 'bsbbsb', 'bbbbbb'], { h: '#5A3519', b: '#9A6A3A', s: '#C99A1E' }, 'it')
  },
  // Advisor: holding up a gauge, its needle sweeping.
  gauge: f => {
    crabBody(f, -6)
    stamp(f, 22, 1, ['.kkkkk.', 'kwwwwwk', 'kgwwwrk', 'kgwwwrk', 'kkkkkkk'], { k: '#3A3A3C', w: '#F4F3EE', g: '#3B9C5F', r: '#E5484D' })
    f(25, 2, 1, 3, INK, 'nd')
  },
}

// One crab in a 30 by 28 grid, scaled, at (x, y). `mirror` faces it left (Arabic).
export const crab = (x: number, y: number, mood: Mood, scale = 0.8, mirror = false): string => {
  const groups = new Map<string, string[]>([['bd', []]])
  const f: Fill = (cx, cy, w, h, c, cls = 'bd') => {
    if (!groups.has(cls)) groups.set(cls, [])
    groups.get(cls)?.push(`<rect x="${cx}" y="${cy}" width="${w}" height="${h}" fill="${c}"/>`)
  }
  MOODS[mood](f)
  const group = (cls: string) => `<g class="${cls}">${(groups.get(cls) ?? []).join('')}</g>`
  const props = [...groups.keys()].filter(k => k !== 'bd' && k !== 'la' && k !== 'lb')
  const body = `<g class="bd">${(groups.get('bd') ?? []).join('')}${props.map(group).join('')}</g>`
  const place = mirror ? `translate(${x + 30 * scale},${y}) scale(${-scale},${scale})` : `translate(${x},${y}) scale(${scale})`
  return `<g transform="${place}" shape-rendering="crispEdges"><g class="mood m-${mood}">${body}${group('la')}${group('lb')}</g></g>`
}

// The terminal's crab: a glyph and a mood mark.
export const crabText = (mood: Mood): string =>
  ({ happy: '▣♥', calm: '▣', sweat: "▣'", angry: '▣!', sleep: '▣z', suitcase: '▣▤', gauge: '▣◔' })[mood]
