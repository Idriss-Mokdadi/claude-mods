// SVG drawings for desktop and mobile: the task bars and the timeline chart.
// Plain strings; colours adapt to the light or dark theme; motion stops under
// prefers-reduced-motion.

import type { TaskState } from '../types'
import type { Span } from './board'
import { fmtSpan } from './board'

export const COLOR: Record<TaskState, string> = {
  pending: '#9A9A96',
  in_progress: '#D97757',
  completed: '#2FA866',
  failed: '#DC3B3F',
  blocked: '#DC3B3F',
}

const BASE_CSS = `.k{fill:#e4e4e2}.t{fill:#3d3d3a}.m{fill:#8a8a86}.ln{stroke:#d6d6d2}
@media (prefers-color-scheme: dark){.k{fill:#3a3a38}.t{fill:#ececec}.m{fill:#8f8f8a}.ln{stroke:#45453f}}`

const MOTION_CSS = `.mv{animation:slide 1.4s ease-in-out infinite -.6s}
@keyframes slide{0%{transform:translateX(-40%)}100%{transform:translateX(140%)}}
.pl{animation:pulse 1.4s ease-in-out infinite}@keyframes pulse{50%{opacity:.45}}
@media (prefers-reduced-motion: reduce){.mv,.pl{animation:none!important}}`

const xml = (s: string): string => s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

// One task's bar: grey track; an indeterminate sliding segment while it runs;
// full green when done; full red when failed or blocked.
export function taskBarSvg(W: number, state: TaskState, rtl = false): string {
  const track = `<rect class="k" x="0" y="2" width="${W}" height="6" rx="3"/>`
  let fillEl = ''
  if (state === 'completed' || state === 'failed' || state === 'blocked') fillEl = `<rect x="0" y="2" width="${W}" height="6" rx="3" fill="${COLOR[state]}"/>`
  else if (state === 'in_progress') {
    const seg = Math.round(W * 0.35)
    fillEl = `<clipPath id="c"><rect x="0" y="2" width="${W}" height="6" rx="3"/></clipPath><g clip-path="url(#c)"><rect class="mv" x="${rtl ? W - seg : 0}" y="2" width="${seg}" height="6" rx="3" fill="${COLOR.in_progress}" style="transform-box:view-box"/></g>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="10" viewBox="0 0 ${W} 10"><style>${BASE_CSS}${MOTION_CSS}</style>${track}${fillEl}</svg>`
}

// The band's bar: done share in green, running share pulsing in clay.
export function progressSvg(W: number, done: number, running: number, total: number, rtl = false): string {
  const t = Math.max(1, total)
  const dw = Math.round((W * done) / t)
  const rw = Math.round((W * running) / t)
  const x = (from: number, w: number) => (rtl ? W - from - w : from)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="10" viewBox="0 0 ${W} 10"><style>${BASE_CSS}${MOTION_CSS}</style>
<rect class="k" x="0" y="2" width="${W}" height="6" rx="3"/>${dw ? `<rect x="${x(0, dw)}" y="2" width="${dw}" height="6" rx="3" fill="${COLOR.completed}"/>` : ''}${rw ? `<rect class="pl" x="${x(dw, rw)}" y="2" width="${rw}" height="6" rx="3" fill="${COLOR.in_progress}"/>` : ''}</svg>`
}

// The mini Gantt: one row per task, its bar from start to end on a shared axis,
// a "now" line, and the total span under it. Arabic runs right to left.
export function timelineSvg(W: number, spans: readonly Span[], start: number, end: number, labels: readonly string[], rtl = false): string {
  const ROW = 16
  const LABEL = 34
  const top = 4
  const H = top + spans.length * ROW + 20
  const plot = W - LABEL - 8
  const k = plot / Math.max(1, end - start)
  const px = (t: number) => LABEL + (t - start) * k
  const mx = (x: number, w = 0) => (rtl ? W - x - w : x)
  const rows = spans.map((s, i) => {
    const y = top + i * ROW
    const label = `<text class="m" x="${rtl ? W - 4 : 4}" y="${y + 11}" font-size="10" font-family="system-ui,sans-serif"${rtl ? ' text-anchor="end"' : ''}>${xml(labels[i] ?? '')}</text>`
    const guide = `<line class="ln" x1="${mx(LABEL)}" x2="${mx(LABEL + plot)}" y1="${y + 8}" y2="${y + 8}" stroke-dasharray="2 3"/>`
    if (s.from < 0) return label + guide
    const x = px(s.from)
    const w = Math.max(3, px(s.to) - x)
    const cls = s.state === 'in_progress' ? ' class="pl"' : ''
    return `${label}${guide}<rect${cls} x="${mx(x, w)}" y="${y + 3}" width="${w}" height="10" rx="2" fill="${COLOR[s.state]}"/>`
  })
  const axisY = top + spans.length * ROW + 2
  const nowX = mx(px(end))
  const axis = `<line class="ln" x1="${mx(LABEL)}" x2="${mx(LABEL + plot)}" y1="${axisY}" y2="${axisY}"/>
<line stroke="${COLOR.in_progress}" x1="${nowX}" x2="${nowX}" y1="${top}" y2="${axisY}" stroke-width="1"/>
<text class="m" x="${mx(LABEL)}" y="${axisY + 13}" font-size="10" font-family="system-ui,sans-serif"${rtl ? ' text-anchor="end"' : ''}>0</text>
<text class="t" x="${mx(LABEL + plot)}" y="${axisY + 13}" font-size="10" font-family="system-ui,sans-serif"${rtl ? '' : ' text-anchor="end"'}>${xml(fmtSpan(end - start))}</text>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><style>${BASE_CSS}${MOTION_CSS}</style>${rows.join('')}${axis}</svg>`
}
