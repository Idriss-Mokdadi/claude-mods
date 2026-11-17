// The band's mood crab. The body, legs, `stamp` helper and CSS steps come from
// cockpit's crab, itself copied from JohnnyVizz/claude-kit savvy-progress (MIT,
// see THIRD_PARTY_NOTICES.md). The moods and props are companion's own.

import type { Mood } from '../types'

const CLAY = '#D97757'
const RED = '#E5484D'
const INK = '#1F1E1D'

type Fill = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void

const stamp = (f: Fill, x: number, y: number, rows: string[], map: Record<string, string>, cls?: string): void =>
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => map[ch] && f(x + dx, y + dy, 1, 1, map[ch] ?? '', cls)))

const body = (f: Fill, o: { color?: string; eyes?: boolean; arm?: number } = {}): void => {
  const b = o.color ?? CLAY
  f(7, 10, 16, 12, b)
  f(3, 14, 4, 4, b)
  f(23, 14 + (o.arm ?? 0), 4, 4, b, 'ar')
  if (o.eyes !== false) {
    f(9, 12, 2, 2, INK)
    f(19, 12, 2, 2, INK)
  }
  f(7, 22, 2, 4, b, 'la')
  f(17, 22, 2, 4, b, 'la')
  f(11, 22, 2, 4, b, 'lb')
  f(21, 22, 2, 4, b, 'lb')
}

const MOODS: Record<Mood, (f: Fill) => void> = {
  ready: f => body(f),
  working: f => {
    body(f)
    stamp(f, 24, 4, ['.s.', 'sss', '.s.'], { s: '#E0B12A' }, 'sp')
  },
  reading: f => {
    body(f)
    stamp(f, 23, 5, ['.ggg.', 'g...g', 'g...g', '.ggg.', '....h', '.....h'], { g: '#3A3A3C', h: '#6B4A2B' }, 'pr')
  },
  editing: f => {
    body(f, { arm: -4 })
    stamp(f, 22, 2, ['mmmmm', '..h..', '..h..', '..h..', '..h..'], { m: '#9AA3AD', h: '#6B4A2B' }, 'hm')
  },
  running: f => {
    body(f)
    stamp(f, 22, 5, ['kkkkkkk', 'k.....k', 'kg....k', 'k.gg..k', 'kkkkkkk'], { k: '#111111', g: '#7CFF9E' }, 'cu')
  },
  waiting: f => {
    body(f)
    stamp(f, 24, 1, ['.yyy.', 'y...y', '...y.', '..y..', '.....', '..y..'], { y: '#E0B12A' }, 'qm')
  },
  error: f => {
    body(f, { color: RED, arm: -4 })
    f(8, 10, 4, 1, INK)
    f(18, 10, 4, 1, INK)
    f(12, 18, 6, 1, INK)
    stamp(f, 4, 4, ['.ss', 'ss.', '.ss'], { s: '#C9CCD2' }, 'st')
    stamp(f, 23, 3, ['ss.', '.ss', 'ss.'], { s: '#C9CCD2' }, 'st2')
  },
  done: f => {
    body(f)
    f(12, 16, 1, 1, INK)
    f(13, 17, 4, 1, INK)
    f(17, 16, 1, 1, INK)
    stamp(f, 24, 4, ['h.h', 'hhh', '.h.'], { h: RED }, 'hr')
  },
  sleeping: f => {
    body(f, { eyes: false })
    f(9, 13, 2, 1, INK)
    f(19, 13, 2, 1, INK)
    stamp(f, 22, 4, ['zzz', '..z', '.z.', 'zzz'], { z: '#8E929A' }, 'z1')
    stamp(f, 26, 0, ['zz', '.z', 'zz'], { z: '#8E929A' }, 'z2')
  },
  dance: f => {
    body(f, { arm: -6 })
    f(12, 16, 1, 1, INK)
    f(13, 17, 4, 1, INK)
    f(17, 16, 1, 1, INK)
    stamp(f, 0, 2, ['y.', '.p', 'y.'], { y: '#FFD34D', p: '#FF8BE0' }, 'cf')
    stamp(f, 27, 1, ['.b', 'y.', '.p'], { y: '#FFD34D', b: '#7EE0FF', p: '#FF8BE0' }, 'cf2')
  },
}

const CSS = `<style>
.m .la{animation:st .5s steps(1) infinite}.m .lb{animation:st .5s steps(1) infinite -.25s}
@keyframes st{50%{transform:translateY(-1px)}}@keyframes bob{50%{transform:translateY(1px)}}
@keyframes hop{50%{transform:translateY(-2px)}}@keyframes blink{50%{opacity:.15}}@keyframes shake{50%{transform:translateX(1px)}}
.m-ready .bd{animation:bob 2s steps(1) infinite}.m-working .sp{animation:blink .6s steps(1) infinite}
.m-reading .pr{animation:shake .6s steps(1) infinite}.m-editing .hm{animation:st .3s steps(1) infinite}
.m-running .cu{animation:blink .7s steps(1) infinite}.m-waiting .qm{animation:blink 1s steps(1) infinite}
.m-error .bd{animation:shake .2s steps(1) infinite}.m-error .st{animation:blink .4s steps(1) infinite}.m-error .st2{animation:blink .4s steps(1) infinite -.2s}
.m-done .hr{animation:blink 1s steps(1) infinite}.m-done .bd{animation:hop 1s steps(1) infinite}
.m-sleeping .la,.m-sleeping .lb{animation:none}.m-sleeping .z1{animation:blink 2s steps(1) infinite}.m-sleeping .z2{animation:blink 2s steps(1) infinite -1s}
.m-dance .bd{animation:hop .3s steps(1) infinite}.m-dance .cf{animation:blink .3s steps(1) infinite}.m-dance .cf2{animation:blink .3s steps(1) infinite -.15s}
@media (prefers-reduced-motion: reduce){.m,.m g{animation:none!important}}
</style>`

// One crab, 30 by 28 units, drawn at `size` px tall. `mirror` faces it left.
export function crabSvg(mood: Mood, size = 22, mirror = false): string {
  const groups = new Map<string, string[]>([['bd', []]])
  const f: Fill = (x, y, w, h, c, cls = 'bd') => {
    if (!groups.has(cls)) groups.set(cls, [])
    groups.get(cls)?.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`)
  }
  MOODS[mood](f)
  const g = (cls: string) => `<g class="${cls}">${(groups.get(cls) ?? []).join('')}</g>`
  const props = [...groups.keys()].filter(k => k !== 'bd' && k !== 'la' && k !== 'lb')
  const inner = `<g class="m m-${mood}"><g class="bd">${(groups.get('bd') ?? []).join('')}${props.map(g).join('')}</g>${g('la')}${g('lb')}</g>`
  const flip = mirror ? ` transform="translate(30 0) scale(-1 1)"` : ''
  const w = Math.round((size * 30) / 28)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${size}" viewBox="0 0 30 28" shape-rendering="crispEdges">${CSS}<g${flip}>${inner}</g></svg>`
}

export const crabWidth = (size = 22): number => Math.round((size * 30) / 28)

// The terminal's crab: a glyph and a mood mark.
export const crabText = (mood: Mood): string =>
  ({
    ready: '(▣)',
    working: '(▣)…',
    reading: '(▣)🔍',
    editing: '(▣)🔨',
    running: '(▣)$',
    waiting: '(▣)?',
    error: '(▣)!',
    done: '(▣)♥',
    sleeping: '(▣)z',
    dance: '\\(▣)/',
  })[mood]
