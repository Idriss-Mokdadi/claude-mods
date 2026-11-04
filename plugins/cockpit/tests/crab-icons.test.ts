import { expect, test } from 'claude-code/testing'

import { BODY, ICON_KINDS, ICON_LABEL, TONES, crabIcon } from '../hooks/crab-icons'

// A small well-formedness check: every tag closes, in order, and every number is finite.
const isWellFormed = (svg: string): boolean => {
  const stack: string[] = []
  const body = svg.replace(/<style>[\s\S]*?<\/style>/g, '')
  for (const m of body.matchAll(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g)) {
    const [, close, name = '', attrs = '', self] = m
    if (/NaN|undefined|Infinity/.test(attrs)) return false
    if (self) continue
    if (close) {
      if (stack.pop() !== name) return false
    } else stack.push(name)
  }
  return stack.length === 0
}

test('every kind in every tone is one well-formed SVG with a crab and a prop', () => {
  for (const kind of ICON_KINDS)
    for (const tone of TONES) {
      const svg = crabIcon(kind, tone)
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
      expect(svg).toContain('viewBox="0 0 34 24"')
      expect(isWellFormed(svg)).toBe(true)
      expect((svg.match(/<rect /g) ?? []).length).toBeGreaterThan(12)
      expect(svg).toContain(`ci-${tone}`)
    }
})

test('every kind has a label and the emoji it replaces', () => {
  expect(ICON_KINDS.length).toBe(16)
  for (const kind of ICON_KINDS) expect(ICON_LABEL[kind][0].length).toBeGreaterThan(0)
})

test('size, mirror, reduced motion and the theme classes', () => {
  const svg = crabIcon('cost', 'green', { size: 80, mirror: true })
  expect(svg).toContain('width="113" height="80"')
  expect(svg).toContain('scale(-1,1)')
  expect(svg).toContain('prefers-reduced-motion')
  expect(svg).toContain('prefers-color-scheme: dark')
})

test('each mood has its own body colour, and the prop is outlined', () => {
  const colours = new Set(TONES.map(t => BODY[t]))
  expect(colours.size).toBe(4)
  for (const t of TONES) expect(crabIcon('tools', t)).toContain(`fill="${BODY[t]}"`)
  expect(crabIcon('tools', 'red')).not.toContain(`fill="${BODY.green}"`)
  expect(crabIcon('usage', 'green')).toContain('<g class="ol"><rect')
})

test('context backpack fills with pct; cache is an outline, cold sleeps in frost; wrong model is confused', () => {
  const count = (svg: string, c: string) => svg.split(`fill="${c}"`).length - 1
  expect(crabIcon('context', 'green', { pct: 0 })).not.toContain('width="6" height="1" fill="#2FA866"')
  expect(count(crabIcon('context', 'green', { pct: 100 }), '#2FA866')).toBeGreaterThan(6)
  const warm = crabIcon('cache', 'green')
  expect(warm).not.toContain('class="frost"')
  expect(warm).toContain(`fill="${BODY.green}"`)
  const cold = crabIcon('cache', 'yellow', { cold: true })
  expect(cold).toContain('class="frost"')
  expect(cold).toContain('class="zz"')
  expect(crabIcon('model', 'red')).toContain('class="q"')
  expect(crabIcon('model', 'green')).not.toContain('class="q"')
})
