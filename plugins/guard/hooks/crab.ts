// Pixel crab, copied from JohnnyVizz/claude-kit savvy-progress (MIT, see
// THIRD_PARTY_NOTICES.md): the body, legs, the stamp helper and the CSS motion,
// as cockpit carries them. The guard's moods (angry with a stop sign, a
// padlock for secrets, a shield on watch, sweat before a bash snapshot, happy
// after a restore) are guard's own, drawn the same way.

export type Mood = 'angry' | 'lock' | 'shield' | 'sweat' | 'happy'

export const CLAY = '#D97757'
const INK = '#1F1E1D'
const ANGRY = '#E5484D'

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

const angryFace = (f: Fill): void => {
  f(8, 10, 4, 1, INK)
  f(18, 10, 4, 1, INK)
  f(12, 18, 6, 1, INK)
  f(12, 17, 1, 1, INK)
  f(17, 17, 1, 1, INK)
}

// Pure CSS, run by the compositor. Every motion stops under prefers-reduced-motion.
export const CRAB_CSS = `<style>
.bd{transform-box:fill-box}
@keyframes st{50%{transform:translateY(-1px)}}@keyframes bob{50%{transform:translateY(1px)}}
@keyframes shake{50%{transform:translateX(1px)}}@keyframes hop{50%{transform:translateY(-1px)}}
@keyframes blink{50%{opacity:.15}}
@keyframes drip{0%{transform:translateY(0);opacity:1}100%{transform:translateY(4px);opacity:0}}
.m-angry .bd,.m-lock .bd{animation:shake .2s steps(1) infinite}
.m-angry .st{animation:blink .4s steps(1) infinite}.m-angry .st2{animation:blink .4s steps(1) infinite -.2s}
.m-lock .lk{animation:blink 1s steps(1) infinite}
.m-shield .bd{animation:bob 2s steps(1) infinite}
.m-sweat .sw{animation:drip 1s linear infinite}.m-sweat .sw2{animation:drip 1s linear infinite -.5s}
.m-happy .bd{animation:hop 1s steps(1) infinite}.m-happy .hr{animation:blink 1s steps(1) infinite}
@media (prefers-reduced-motion: reduce){.mood,.mood g{animation:none!important}}
</style>`

const MOODS: Record<Mood, (f: Fill) => void> = {
  // A blocked command: red, frowning, steam, raising a stop sign.
  angry: f => {
    crabBody(f, -8, undefined, ANGRY)
    angryFace(f)
    stamp(f, 3, 4, ['.ss', 'ss.', '.ss'], { s: '#C9CCD2' }, 'st')
    stamp(f, 22, 0, ['.rrrr.', 'rwwwwr', 'rrrrrr', 'rwwwwr', '.rrrr.', '..kk..', '..kk..'], { r: '#C62828', w: '#FFFFFF', k: '#5A3519' })
  },
  // A blocked secret: red, frowning, holding a padlock.
  lock: f => {
    crabBody(f, -6, undefined, ANGRY)
    angryFace(f)
    stamp(f, 22, 1, ['.kkk.', 'k...k', 'k...k', 'yyyyy', 'yyKyy', 'yyKyy', 'yyyyy'], { k: '#8E929A', y: '#F2B705', K: INK }, 'lk')
  },
  // On watch: the plain crab with a shield.
  shield: f => {
    crabBody(f)
    stamp(f, 23, 9, ['bbbbb', 'bwbwb', 'bbwbb', '.bbb.', '..b..'], { b: '#3D7BD9', w: '#F4F3EE' })
  },
  // A bash snapshot: sweat drops.
  sweat: f => {
    crabBody(f)
    f(5, 7, 1, 2, '#5BB4F0', 'sw')
    f(25, 6, 1, 2, '#5BB4F0', 'sw2')
    f(13, 16, 4, 1, INK)
  },
  // Restored: a smile and a heart.
  happy: f => {
    crabBody(f)
    f(12, 16, 1, 1, INK)
    f(13, 17, 4, 1, INK)
    f(17, 16, 1, 1, INK)
    stamp(f, 24, 4, ['h.h', 'hhh', '.h.'], { h: '#E5484D' }, 'hr')
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

// A whole SVG holding one crab, `px` tall.
export const crabSvg = (mood: Mood, px = 22, mirror = false): string => {
  const w = Math.round((px * 30) / 28)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${px}" viewBox="0 0 30 28">${CRAB_CSS}${crab(0, 0, mood, 1, mirror)}</svg>`
}

export const crabWidth = (px: number): number => Math.round((px * 30) / 28)

// The terminal's crab: a glyph and a mood mark.
export const crabText = (mood: Mood): string => ({ angry: '▣!', lock: '▣🔒', shield: '▣🛡', sweat: "▣'", happy: '▣♥' })[mood]
