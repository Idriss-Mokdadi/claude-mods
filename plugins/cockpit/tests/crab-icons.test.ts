import { expect, test } from 'claude-code/testing'

import { ICON_KINDS, ICON_LABEL, TONES, crabIcon } from '../hooks/crab-icons'

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
      expect(svg).toContain('viewBox="0 0 40 30"')
      expect(isWellFormed(svg)).toBe(true)
      expect((svg.match(/<rect /g) ?? []).length).toBeGreaterThan(20)
      expect(svg).toContain(`ci-${tone}`)
    }
})

test('every kind has a label and the emoji it replaces', () => {
  expect(ICON_KINDS.length).toBe(16)
  for (const kind of ICON_KINDS) expect(ICON_LABEL[kind][0].length).toBeGreaterThan(0)
})

test('size, mirror, reduced motion and the theme classes', () => {
  const svg = crabIcon('cost', 'green', { size: 80, mirror: true })
  expect(svg).toContain('width="107" height="80"')
  expect(svg).toContain('scale(-1,1)')
  expect(svg).toContain('prefers-reduced-motion')
  expect(svg).toContain('prefers-color-scheme: dark')
})

test('tone changes the pose: red is red-bodied, green has a heart', () => {
  expect(crabIcon('tools', 'red')).toContain('#E5484D')
  expect(crabIcon('tools', 'red')).not.toContain('#D97757')
  expect(crabIcon('tools', 'green')).toContain('#D97757')
})

test('context backpack fills with pct; cold cache sleeps; wrong model is confused', () => {
  const empty = crabIcon('context', 'green', { pct: 0 })
  const full = crabIcon('context', 'green', { pct: 100 })
  expect(empty).not.toContain('height="7" fill="#3B9C5F"')
  expect(full).toContain('height="7" fill="#3B9C5F"')
  expect(crabIcon('cache', 'yellow', { cold: true })).toContain('class="zz"')
  expect(crabIcon('cache', 'yellow')).not.toContain('class="zz"')
  expect(crabIcon('model', 'red')).toContain('class="q"')
  expect(crabIcon('model', 'green')).not.toContain('class="q"')
})
