// Pixel crab, copied from cockpit, which copies it from JohnnyVizz/claude-kit
// savvy-progress (MIT, see THIRD_PARTY_NOTICES.md): body, legs, the stamp
// helper and the CSS motion. The moods here (calm, happy, book) are launcher's.

export type Mood = 'calm' | 'happy' | 'book'

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

// Pure CSS, run by the compositor. Every motion stops under prefers-reduced-motion.
export const CRAB_CSS = `<style>
.m-calm .bd{animation:bob 2s steps(1) infinite}
@keyframes bob{50%{transform:translateY(1px)}}
.m-happy .bd{animation:hop 1s steps(1) infinite}.m-happy .hr{animation:blink 1s steps(1) infinite}
@keyframes hop{50%{transform:translateY(-1px)}}
@keyframes blink{50%{opacity:.15}}
.m-book .pg{animation:blink 1.6s steps(1) infinite}
@media (prefers-reduced-motion: reduce){.mood,.mood g{animation:none!important}}
</style>`

const MOODS: Record<Mood, (f: Fill) => void> = {
  // The plain crab, a slow bob.
  calm: f => crabBody(f),
  // Sticky tags on: a smile and a little heart.
  happy: f => {
    crabBody(f)
    f(12, 16, 1, 1, INK)
    f(13, 17, 4, 1, INK)
    f(17, 16, 1, 1, INK)
    stamp(f, 24, 4, ['h.h', 'hhh', '.h.'], { h: '#E5484D' }, 'hr')
  },
  // Glossary: holding up an open book, its page turning.
  book: f => {
    crabBody(f, -6)
    stamp(f, 20, 1, ['bbbbbbbbb', 'bwwwbwwwb', 'bwkwbwkwb', 'bwwwbwwwb', 'bwkwbwkwb', 'bbbbbbbbb'], { b: '#3B6FB6', w: '#F4F3EE', k: '#8E929A' })
    f(25, 2, 2, 3, '#DCE6F5', 'pg')
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

// The terminal's crab.
export const crabText = (mood: Mood): string => ({ calm: '▣', happy: '▣♥', book: '▣▤' })[mood]

export const crabSvg = (mood: Mood, mirror = false): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 28" width="30" height="28">${CRAB_CSS}${crab(0, 0, mood, 1, mirror)}</svg>`
