// The Lagoon scene, the owner's approved design from docs/themes-preview.html,
// drawn as one animated SVG: pixel art in a 120 x 320 grid, every motion in CSS
// so the compositor runs it, and every moving part at rest in the plain markup
// for prefers-reduced-motion.
//
// The crab pixels are the preview's crab, itself the savvy-progress crab of
// JohnnyVizz/claude-kit (MIT, see THIRD_PARTY_NOTICES.md).

import type { View } from '../types'

export const W = 120
export const H = 320
export const GROUND = 252
const TOP = 46
const BAND_H = (GROUND - TOP) / 10

const C = {
  day: '#7cc4e8',
  night: '#0b1022',
  band: '#0b3d5c',
  ground: '#c9a46b',
  groundNight: '#6d5a3a',
  jelly: '#ff9fe6',
  jellyDone: '#6ee7a2',
  red: '#e5484d',
  clay: '#d97757',
  angry: '#dc3b3f',
  ink: '#2a1a14',
}

export const mix = (a: string, b: string, k: number): string => {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
  const A = p(a)
  const B = p(b)
  return '#' + A.map((v, i) => Math.round(v + ((B[i] ?? 0) - v) * k).toString(16).padStart(2, '0')).join('')
}

// 5-hour bands and 7-day shells: green for the first five, yellow, orange, then
// red on the top two only.
export const stage = (i: number): string => (i < 5 ? '#3bb26a' : i < 7 ? '#e0b12a' : i < 8 ? '#f07418' : C.red)

const n = (v: number): string => String(Math.round(v * 100) / 100)

// Pixels as one path: each [x, y, w, h] a closed rectangle.
const cells = (list: readonly (readonly [number, number, number, number])[]): string =>
  list.map(([x, y, w, h]) => `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}z`).join('')
const pix = (list: readonly (readonly [number, number, number, number])[], fill: string, extra = ''): string =>
  list.length ? `<path d="${cells(list)}" fill="${fill}"${extra}/>` : ''

// ---------------------------------------------------------------------------
// The crab: 13 by 10 cells of 1.5 units.

const P = 1.5
const CRAB = ['.cc.......cc.', 'c..c.....c..c', '.cc.......cc.', '..b.......b..', '..bbbbbbbbb..', '..bkbbbbbkb..', '..bbbbbbbbb..', '..bbbmmmbbb..']
const LEGS_A = ['..b.b...b.b..', '.b..b...b..b.']
const LEGS_B = ['...bb...bb...', '..b..b.b..b..']

const grid = (rows: readonly string[], pick: (ch: string) => boolean, dy = 0): [number, number, number, number][] => {
  const out: [number, number, number, number][] = []
  rows.forEach((row, j) => [...row].forEach((ch, i) => pick(ch) && out.push([i * P, (j + dy) * P, P, P])))
  return out
}

type CrabOpts = { sleep: boolean; angry: boolean }

export function crabPixels(o: CrabOpts): string {
  const body = o.angry ? C.angry : C.clay
  const mouth = o.angry ? '#5a0f12' : '#7a3a26'
  const parts = [
    pix(grid(CRAB, ch => ch === 'c' || ch === 'b' || (o.sleep && ch === 'k')), body),
    o.sleep ? pix([[3 * P, 5 * P + 0.6, 2 * P, 0.9], [8 * P, 5 * P + 0.6, 2 * P, 0.9]], C.ink) : pix(grid(CRAB, ch => ch === 'k'), C.ink),
    pix(grid(CRAB, ch => ch === 'm'), mouth),
    o.angry ? pix([[2.5 * P, 4 * P, 2.5 * P, 0.8], [8 * P, 4 * P, 2.5 * P, 0.8]], C.ink) : '',
  ]
  return `<g class="bd">${parts.join('')}</g><g class="la">${pix(grid(LEGS_A, ch => ch === 'b', 8), body)}</g><g class="lb">${pix(grid(LEGS_B, ch => ch === 'b', 8), body)}</g>`
}

// Props over one crab, in the crab's own units (0-19.5 wide, 0-15 high).
const zzz = `<g class="zz"><text x="13" y="-1" font-size="6" font-family="monospace" fill="#c8dcff">z</text><text class="z2" x="16" y="-6" font-size="4.5" font-family="monospace" fill="#c8dcff">z</text></g>`
const steam = [0, 1, 2].map(k => `<rect class="steam s${k}" x="${3 + k * 6}" y="-4" width="3" height="3" fill="#dcdcdc"/>`).join('')
const question = `<text class="q" x="6" y="-3" font-size="12" font-weight="bold" font-family="monospace" fill="#ffd34d">?</text>`
const suitcase = `<g class="case">${pix([[19, 4, 9, 8]], '#8a5a2b')}${pix([[22, 2, 3, 2]], '#5a3a1a')}${pix([[19, 7, 9, 1]], '#c99a1e')}</g>`

const PROPS: Record<NonNullable<View['act']>, string> = {
  read: [0, 1, 2, 3, 4].map(k => `<rect class="dig d${k}" x="10" y="14" width="1.2" height="1.2" fill="#e8d2a0"/>`).join(''),
  edit: `<g class="hm">${pix([[20, 0, 1.5, 8]], '#6b4a2b')}${pix([[18.5, -1.5, 5, 3]], '#9aa3ad')}</g>`,
  bash:
    `<g class="term">${pix([[21, 3, 13, 10]], '#111')}${pix([[21, 3, 13, 1.5]], '#555')}` +
    `<text x="22.5" y="11" font-size="6" font-family="monospace" fill="#7cff9e">$</text>` +
    `<rect class="cur" x="27" y="9.5" width="3" height="1.5" fill="#7cff9e"/></g>`,
  web:
    `<g class="ant">${pix([[10, -10, 1.5, 10]], '#cccccc')}${pix([[9, -11.5, 3.5, 2.5]], C.red)}` +
    `<path class="wave w1" d="M6.4 -13.4 A 4.6 4.6 0 0 1 15.1 -13.4" fill="none" stroke="#7cc8ff" stroke-width=".7"/>` +
    `<path class="wave w2" d="M3.8 -15.9 A 7.6 7.6 0 0 1 17.7 -15.9" fill="none" stroke="#7cc8ff" stroke-width=".7"/></g>`,
}

// ---------------------------------------------------------------------------
// Jellyfish.

function jelly(i: number, state: View['agents'][number]['state']): string {
  const x = 20 + (i % 3) * 34 + (i >= 3 ? 17 : 0)
  const y = 180 - (i % 3) * 18 - (i >= 3 ? 46 : 0)
  const col = state === 'done' ? C.jellyDone : state === 'fail' ? C.red : C.jelly
  const tent = [0, 1, 2, 3].map(k => `<path class="tn t${k}" d="M${n(-4 + k * 2.6)} 0.5q1 2.5 0 5q-1 2.5 0 5" fill="none" stroke="${col}" stroke-width="1"/>`).join('')
  return (
    `<g class="jelly j-${state}" data-agent="${state}" transform="translate(${n(x)} ${n(y)})"><g class="jd"><g class="jb">` +
    `<circle r="11" fill="${col}" opacity=".18"/><path d="M-6 0.5A6 5.5 0 0 1 6 0.5Z" fill="${col}"/>${tent}</g></g></g>`
  )
}

// ---------------------------------------------------------------------------
// Fireworks: three bursts of twelve sparks.

const SPARKS = 12
const burst = (x: number, y: number, col: string, k: number): string =>
  `<g class="fw f${k}" transform="translate(${x} ${y})">` +
  Array.from({ length: SPARKS }, (_, i) => `<rect class="sp p${i}" x="-.6" y="-.6" width="1.2" height="1.2" fill="${col}"/>`).join('') +
  `</g>`

const sparkKeys = Array.from({ length: SPARKS }, (_, i) => {
  const a = (i / SPARKS) * Math.PI * 2
  return `@keyframes p${i}{0%{transform:translate(0px,0px);opacity:1}80%{opacity:1}100%{transform:translate(${n(Math.cos(a) * 16)}px,${n(Math.sin(a) * 16 + 4)}px);opacity:0}}.sp.p${i}{animation:p${i} 1.6s ease-out infinite}`
}).join('')

// ---------------------------------------------------------------------------
// The style sheet: motion only. Under prefers-reduced-motion every animation
// stops and each part keeps its resting place.

const CSS = [
  'g,rect,path,text,circle{transform-box:fill-box}',
  '.aw .la{animation:fa .34s steps(1) infinite}.lb{opacity:0}.aw .lb{animation:fb .34s steps(1) infinite}',
  '@keyframes fa{50%{opacity:0}}@keyframes fb{50%{opacity:1}}',
  '.aw .mv{animation:sway 4s ease-in-out infinite alternate}.c1 .mv{animation-delay:-1.3s}.c2 .mv{animation-delay:-2.6s}',
  '@keyframes sway{from{transform:translateX(-5px)}to{transform:translateX(5px)}}',
  '.dance .mv{animation:hop .36s ease-in-out infinite alternate}.dance.c1 .mv{animation-delay:-.12s}.dance.c2 .mv{animation-delay:-.24s}',
  '@keyframes hop{from{transform:translateY(0px)}to{transform:translateY(-4px)}}',
  '.zz{animation:zf 2.4s ease-in-out infinite}.zz .z2{animation:bl 2.4s steps(1) infinite}',
  '@keyframes zf{0%{transform:translate(0px,0px);opacity:.3}50%{opacity:1}100%{transform:translate(3px,-5px);opacity:.3}}@keyframes bl{50%{opacity:0}}',
  '.steam{animation:puff 1.2s linear infinite}.s1{animation-delay:-.4s}.s2{animation-delay:-.8s}',
  '@keyframes puff{0%{transform:translateY(0px);opacity:1}100%{transform:translateY(-10px);opacity:0}}',
  '.angry .mv{animation:shake .2s steps(1) infinite}@keyframes shake{50%{transform:translateX(1px)}}',
  '.q{animation:qb .8s ease-in-out infinite alternate}@keyframes qb{to{transform:translateY(-2px)}}',
  '.dig{opacity:0;animation:dig .8s ease-out infinite}.d1{animation-delay:-.16s}.d2{animation-delay:-.32s}.d3{animation-delay:-.48s}.d4{animation-delay:-.64s}',
  '@keyframes dig{0%{transform:translate(0px,0px);opacity:1}100%{transform:translate(var(--dx,4px),-6px);opacity:0}}',
  '.d0{--dx:-5px}.d1{--dx:-2px}.d2{--dx:2px}.d3{--dx:5px}.d4{--dx:7px}',
  '.hm{transform-origin:50% 100%;animation:swing .3s ease-in-out infinite alternate}@keyframes swing{from{transform:rotate(-35deg)}to{transform:rotate(25deg)}}',
  '.cur{animation:bl .7s steps(1) infinite}',
  '.wave{animation:wv 1s ease-out infinite}.w2{animation-delay:-.5s}@keyframes wv{0%{opacity:0}40%{opacity:.9}100%{opacity:0}}',
  '.jb{transform-origin:50% 30%;animation:pulse 1.3s ease-in-out infinite alternate}@keyframes pulse{to{transform:scale(1.12)}}',
  '.jd{animation:drift 6s ease-in-out infinite alternate}@keyframes drift{to{transform:translate(5px,-6px)}}',
  '.tn{transform-origin:50% 0%;animation:tw 1.1s ease-in-out infinite alternate}.t1,.t3{animation-delay:-.55s}@keyframes tw{from{transform:skewX(-8deg)}to{transform:skewX(8deg)}}',
  '.j-done{animation:away 2.6s ease-in forwards}@keyframes away{to{transform:translateY(-90px);opacity:0}}',
  '.j-fail .jb{animation:flick .3s steps(1) infinite}@keyframes flick{50%{opacity:.35}}',
  '.top{animation:shim 1.6s ease-in-out infinite alternate}@keyframes shim{from{opacity:.72}to{opacity:1}}',
  '.weed{transform-origin:50% 100%;animation:weed 3s ease-in-out infinite alternate}.wd1{animation-delay:-1s}.wd2{animation-delay:-2s}',
  '@keyframes weed{from{transform:skewX(-7deg)}to{transform:skewX(7deg)}}',
  '.bub{animation:rise 14s linear infinite}@keyframes rise{from{transform:translateY(0px);opacity:.9}to{transform:translateY(-190px);opacity:0}}',
  '.star{animation:tk 3s ease-in-out infinite alternate}.star:nth-child(2n){animation-delay:-1.5s}@keyframes tk{to{opacity:.25}}',
  '.flag{transform-origin:0% 50%;animation:flap .5s ease-in-out infinite alternate}@keyframes flap{to{transform:skewY(12deg) scaleX(.8)}}',
  '.cin .mv{animation:cin var(--d) ease-in forwards}@keyframes cin{to{transform:translate(var(--bx),6px) scale(.3);opacity:0}}',
  '.cout .mv{animation:cout .9s ease-out both}@keyframes cout{from{transform:translate(var(--bx),6px) scale(.3);opacity:0}}',
  '.c0{--bx:45px;--d:1s}.c1{--bx:17px;--d:1.2s}.c2{--bx:-11px;--d:1.4s}',
  '.ho .mv{animation:leave 3s linear forwards}@keyframes leave{to{transform:translateX(80px)}}',
  '.fw{opacity:1}.f1 .sp{animation-delay:-.55s}.f2 .sp{animation-delay:-1.1s}',
  sparkKeys,
  '.sun{animation:glow 4s ease-in-out infinite alternate}@keyframes glow{to{opacity:.85}}',
  '@media (prefers-reduced-motion: reduce){*{animation:none!important}.lb{opacity:0}.cin .mv{opacity:0}.j-done{opacity:.8}.fw .sp{opacity:0}.dig{opacity:0}}',
].join('')

// ---------------------------------------------------------------------------

export type SceneOptions = {
  // Strip width in CSS px on desktop; mobile draws full width.
  width: number
  mode: 'strip' | 'full'
  side: 'left' | 'right'
}

// The scene itself, in the 120 x 320 grid. Sky, water and sand run past the
// grid's edges so a window of any shape is filled (the root clips to the strip).
export function lagoon(v: View): string {
  const k = v.light
  const sky = mix(C.night, C.day, k)
  const out: string[] = []
  // Sky, reaching far up for tall windows.
  out.push(`<rect class="sky" x="-400" y="-2000" width="920" height="${2000 + TOP}" fill="${sky}"/>`)
  if (k < 0.35) {
    const a = n(Math.min(1, (0.35 - k) / 0.35))
    const stars = Array.from({ length: 22 }, (_, i) => `<rect class="star" x="${(i * 37) % 130 - 5}" y="${((i * 53) % 260) - 220}" width="1" height="1" fill="#fff"/>`).join('')
    out.push(`<g class="stars" opacity="${a}">${stars}</g>`)
  }
  if (k > 0.05) {
    const x = 12 + (1 - k) * 90
    const y = 18 + (1 - k) * 16
    out.push(`<g class="sun" data-sky="sun"><circle cx="${n(x)}" cy="${n(y)}" r="11" fill="#ffd34d" opacity=".25"/><circle cx="${n(x)}" cy="${n(y)}" r="7" fill="#ffd34d"/></g>`)
  } else {
    out.push(`<g class="moon" data-sky="moon"><circle cx="96" cy="16" r="6" fill="#e9e4c8"/><circle cx="99" cy="13" r="5" fill="${sky}"/></g>`)
  }
  // Water: ten bands for the 5-hour limit, filling from the bottom.
  const base = mix(mix(C.band, '#000000', 0.55), C.band, 0.35 + 0.65 * k)
  for (let i = 0; i < 10; i++) {
    const y = GROUND - (i + 1) * BAND_H
    const on = i < v.bands
    const fill = on ? mix(base, stage(i), 0.5) : base
    out.push(`<rect class="band${on ? ' on' : ''}${on && i === v.bands - 1 ? ' top' : ''}" data-band="${i}" x="-400" y="${n(y)}" width="920" height="${n(BAND_H + 0.5)}" fill="${fill}"/>`)
    out.push(`<rect x="-400" y="${n(y)}" width="920" height=".5" fill="#000" opacity=".25"/>`)
  }
  // Seaweed and bubbles.
  const weedCol = k > 0.1 ? '#36a874' : '#1d5a40'
  ;[[6, 7], [106, 9], [60, 5]].forEach(([x = 0, h = 0], wi) => {
    const segs: [number, number, number, number][] = []
    for (let j = 0; j < h; j++) segs.push([x + (j % 2 ? 2 : 0), GROUND - (j + 1) * 5, 3, 5])
    out.push(`<g class="weed wd${wi}">${pix(segs, weedCol)}</g>`)
  })
  for (let i = 0; i < 8; i++) {
    const delay = -((i * 37) % 14)
    out.push(`<circle class="bub" cx="${(i * 29) % W}" cy="${GROUND - 8 - ((i * 23) % 40)}" r="${1.5 + (i % 2)}" fill="none" stroke="#bee9ff" stroke-opacity=".5" stroke-width=".5" style="animation-delay:${delay}s"/>`)
  }
  if (v.h5 !== null) {
    const ly = Math.max(TOP + 7, GROUND - v.bands * BAND_H - 2)
    out.push(`<text x="3" y="${n(ly)}" font-size="6" font-family="monospace" fill="#fff" fill-opacity=".85">5h ${v.h5}%</text>`)
  }
  // Jellyfish: one per subagent.
  v.agents.forEach((a, i) => out.push(jelly(i, a.state)))
  // Sand and the ten 7-day shells.
  out.push(`<rect class="sand" x="-400" y="${GROUND}" width="920" height="2000" fill="${mix(C.groundNight, C.ground, k)}"/>`)
  for (let i = 0; i < 10; i++) {
    const x = 3 + i * 11.6
    const y = H - 4
    const on = i < v.shells
    const col = on ? stage(i) : '#ffffff'
    out.push(`<path class="shell${on ? ' on' : ''}" data-shell="${i}" d="${cells([[x, y - 2, 7, 2], [x + 1, y - 4, 5, 2], [x + 2, y - 5, 3, 1]])}" fill="${col}"${on ? '' : ' fill-opacity=".75"'}/>`)
  }
  if (v.d7 !== null) out.push(`<text x="3" y="${H - 12}" font-size="6" font-family="monospace" fill="#000" fill-opacity=".7">7d ${v.d7}%</text>`)
  // Sandcastle: one level per done task, a flag when all are done.
  const castle: string[] = []
  for (let i = 0; i < v.castle; i++) castle.push(pix([[92 + i * 2, GROUND - (i + 1) * 6, 22 - i * 4, 6]], i % 2 ? '#e3c48a' : '#d8b878', ` data-level="${i}"`))
  if (v.flag) castle.push(`<g data-flag="1">${pix([[101, GROUND - 38, 1, 10]], '#555')}<g class="flag">${pix([[102, GROUND - 38, 6, 4]], C.red)}</g></g>`)
  out.push(`<g class="castle">${castle.join('')}</g>`)
  // The bucket while compacting.
  if (v.compact) out.push(`<g class="bucket" data-compact="${v.compact}">${pix([[50, GROUND - 12, 18, 12]], '#6b7c93')}${pix([[48, GROUND - 13, 22, 2]], '#8a9ab0')}</g>`)
  // Three crabs.
  for (let i = 0; i < 3; i++) {
    const asleep = i < v.asleep
    const angry = v.angry && i === 0
    const cls = ['crab', `c${i}`]
    if (asleep) cls.push('sleep')
    else cls.push(v.party ? 'dance' : 'aw')
    if (angry) cls.push('angry')
    if (v.compact === 'in') cls.push('cin')
    if (v.compact === 'out') cls.push('cout')
    const isLeaving = v.handoff && i === 2
    if (isLeaving) cls.push('ho')
    const extra: string[] = []
    if (asleep) extra.push(zzz)
    if (angry) extra.push(steam)
    if (v.confused && i === 1) extra.push(question)
    if (i === 1 && v.act && !asleep) extra.push(`<g class="act" data-act="${v.act}">${PROPS[v.act]}</g>`)
    if (isLeaving) extra.push(suitcase)
    out.push(`<g class="${cls.join(' ')}" transform="translate(${4 + i * 28} ${GROUND - 15})"><g class="mv">${crabPixels({ sleep: asleep, angry })}${extra.join('')}</g></g>`)
  }
  // Fireworks on a celebration.
  if (v.party) out.push(`<g class="party">${burst(28, 128, '#ffd34d', 0)}${burst(86, 110, '#7ee0ff', 1)}${burst(60, 158, '#ff8be0', 2)}</g>`)
  return out.join('')
}

const alt = (v: View): string =>
  `Lagoon: 5-hour ${v.h5 ?? '?'}%, 7-day ${v.d7 ?? '?'}%, ${v.cold ? 'cache cold' : `daylight ${Math.round(v.light * 100)}%`}, ${v.agents.length} subagents, castle ${v.castle}${v.flag ? ' with flag' : ''}, mood ${v.mood}`

export const sceneAlt = alt

// The backdrop document. Desktop: a strip of `width` px against one side of
// the window, the rest left bare. Mobile: the whole screen.
export function lagoonSvg(v: View, o: SceneOptions): string {
  const body = lagoon(v)
  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" data-mood="${v.mood}"><style>${CSS}</style>`
  if (o.mode === 'full') {
    return `${head}<svg x="0" y="0" width="100%" height="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax meet" overflow="visible">${body}</svg></svg>`
  }
  const w = Math.round(o.width)
  const inner = `<svg x="0" y="0" width="${w}" height="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax meet" overflow="visible">${body}</svg>`
  const clip = `<clipPath id="strip"><rect x="0" y="0" width="${w}" height="100%"/></clipPath>`
  const edge = `<rect x="${w - 1}" y="0" width="1" height="100%" fill="#000" fill-opacity=".25"/>`
  if (o.side === 'right') {
    return `${head}<defs>${clip}</defs><svg x="100%" y="0" width="${w}" height="100%" overflow="visible"><g transform="translate(-${w} 0)"><g clip-path="url(#strip)">${inner}<rect x="0" y="0" width="1" height="100%" fill="#000" fill-opacity=".25"/></g></g></svg></svg>`
  }
  return `${head}<defs>${clip}</defs><g clip-path="url(#strip)">${inner}${edge}</g></svg>`
}
