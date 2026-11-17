// Small pure helpers: fingerprints, line counts, paths, times.

// FNV-1a over the text, twice with different seeds: a 64-bit hex tag. The
// guard keeps only this tag of a blocked call, never its input.
export function fingerprint(text: string): string {
  let a = 0x811c9dc5
  let b = 0x01000193 ^ 0x5bd1e995
  for (let k = 0; k < text.length; k++) {
    const c = text.charCodeAt(k)
    a = Math.imul(a ^ c, 0x01000193) >>> 0
    b = Math.imul(b ^ c, 0x01000193 + 0x9e37) >>> 0
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}

// Lines added and removed going from `before` to `after`, by multiset: a line
// that moves counts as kept. Cheap and close to `git diff --stat`.
export function lineDelta(before: string | null, after: string | null): { added: number; removed: number } {
  const split = (s: string | null): string[] => (s === null || s === '' ? [] : s.replace(/\n$/, '').split('\n'))
  const old = new Map<string, number>()
  for (const l of split(before)) old.set(l, (old.get(l) ?? 0) + 1)
  let added = 0
  for (const l of split(after)) {
    const n = old.get(l) ?? 0
    if (n > 0) old.set(l, n - 1)
    else added++
  }
  let removed = 0
  for (const n of old.values()) removed += n
  return { added, removed }
}

// The last part of a path, for labels.
export const baseName = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p

// A path shown relative to the project root when it is inside it.
export function shortPath(p: string, root: string): string {
  const r = root.replace(/[\\/]+$/, '')
  if (r && (p.startsWith(r + '/') || p.startsWith(r + '\\'))) return p.slice(r.length + 1)
  return p
}

export const joinPath = (dir: string, name: string): string => `${dir.replace(/[\\/]+$/, '')}/${name}`

// A path resolved against a folder unless already absolute.
export const resolveFrom = (dir: string, p: string): string =>
  /^([A-Za-z]:[\\/]|[\\/])/.test(p) ? p : joinPath(dir, p.replace(/^\.[\\/]/, ''))

// HH:MM in the machine's local time.
export const clockOf = (ms: number): string => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// A label cut to fit.
export const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s)

// Text that looks binary (NUL or replacement characters from a failed decode).
export const isBinaryText = (s: string): boolean => s.includes('\u0000') || s.includes('�')

// A shell-safe single-quoted argument.
export const shQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`
