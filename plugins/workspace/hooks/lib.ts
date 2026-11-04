// Pure helpers of the workspace mod: no `$`, so the tests call them directly.
import type { WorkspaceEntry, WorkspaceMark, WorkspaceTree } from '../types'

// ---------- paths ----------

/** Joins and normalizes POSIX-style path parts: drops `.`, resolves `..`, no trailing slash. */
export const normalize = (path: string): string => {
  const isAbs = path.startsWith('/')
  const out: string[] = []
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop()
      else if (!isAbs) out.push('..')
      continue
    }
    out.push(part)
  }
  return (isAbs ? '/' : '') + out.join('/')
}

/**
 * The key a mark is kept under: the path relative to `root` when it lies inside it,
 * else the normalized absolute path. `undefined` for an empty or unusable path.
 */
export const keyOf = (root: string, path: string): string | undefined => {
  if (typeof path !== 'string' || path.trim() === '') return undefined
  const r = normalize(root)
  const p = path.startsWith('/') ? normalize(path) : normalize(`${r}/${path}`)
  if (p === r) return undefined
  if (r === '/') return p.slice(1)
  if (p.startsWith(r + '/')) return p.slice(r.length + 1)
  return p
}

/** True when a mark key lies inside the root (a relative key). */
export const isInside = (key: string): boolean => !key.startsWith('/') && !key.startsWith('..')

export const parentOf = (rel: string): string => {
  const i = rel.lastIndexOf('/')
  return i < 0 ? '' : rel.slice(0, i)
}

export const depthOf = (rel: string): number => (rel === '' ? 0 : rel.split('/').length)

// ---------- marks ----------

const RANK: Record<WorkspaceMark, number> = { read: 1, edited: 2, created: 3 }

/** The stronger of two marks: a file once created stays created. */
export const strongest = (a: WorkspaceMark | undefined, b: WorkspaceMark): WorkspaceMark =>
  a !== undefined && RANK[a] >= RANK[b] ? a : b

/** Folders (relative keys) holding at least one marked file, each with its strongest mark. */
export const markedFolders = (marks: Record<string, WorkspaceMark>): Map<string, WorkspaceMark> => {
  const out = new Map<string, WorkspaceMark>()
  for (const [key, mark] of Object.entries(marks)) {
    if (!isInside(key)) continue
    let dir = parentOf(key)
    while (dir !== '') {
      out.set(dir, strongest(out.get(dir), mark))
      dir = parentOf(dir)
    }
  }
  return out
}

// ---------- .gitignore ----------

export type IgnoreRule = { re: RegExp; isDirOnly: boolean; isAnchored: boolean }

const globToRe = (glob: string): string => {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i] as string
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        // `**/` matches zero or more folders; a bare `**` anything.
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?'
          i += 2
        } else {
          re += '.*'
          i += 1
        }
      } else re += '[^/]*'
    } else if (ch === '?') re += '[^/]'
    else if (ch === '[') {
      const end = glob.indexOf(']', i + 1)
      if (end < 0) re += '\\['
      else {
        re += '[' + glob.slice(i + 1, end).replace(/^!/, '^').replace(/\\/g, '\\\\') + ']'
        i = end
      }
    } else re += /[.+^${}()|\\]/.test(ch) ? '\\' + ch : ch
  }
  return re
}

/**
 * Reads a root `.gitignore` into rules. Kept cheap: negations (`!`) are skipped, so a
 * file re-included by one stays hidden; nested `.gitignore` files are not read.
 */
export const parseGitignore = (text: string): IgnoreRule[] => {
  const rules: IgnoreRule[] = []
  for (const raw of text.split(/\r?\n/).slice(0, 2000)) {
    let line = raw.replace(/(?<!\\)\s+$/, '')
    if (line === '' || line.startsWith('#') || line.startsWith('!')) continue
    line = line.replace(/^\\([#!])/, '$1')
    const isDirOnly = line.endsWith('/')
    if (isDirOnly) line = line.slice(0, -1)
    const isAnchored = line.includes('/')
    line = line.replace(/^\//, '')
    if (line === '') continue
    try {
      rules.push({ re: new RegExp('^' + globToRe(line) + '$'), isDirOnly, isAnchored })
    } catch {
      // A pattern we cannot read is left out.
    }
  }
  return rules
}

/** Whether `rel` (relative to the root) is ignored by the rules. */
export const isIgnored = (rules: IgnoreRule[], rel: string, isDir: boolean): boolean => {
  const name = rel.slice(rel.lastIndexOf('/') + 1)
  return rules.some(r => (!r.isDirOnly || isDir) && r.re.test(r.isAnchored ? rel : name))
}

/** Folders never listed, whatever the settings say. */
export const ALWAYS_SKIP = new Set(['.git', 'node_modules'])

// ---------- listing ----------

/** Folders first, then by name, case-insensitive, numbers in order. */
export const sortEntries = (list: WorkspaceEntry[]): WorkspaceEntry[] =>
  [...list].sort((a, b) =>
    a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
  )

// ---------- Bash ----------

const READERS = new Set(['cat', 'head', 'tail', 'less', 'more', 'wc', 'bat', 'nl', 'diff', 'stat', 'file'])
const TOUCHERS = new Set(['touch', 'tee'])

/** A token we trust to be a plain path: no expansion, glob, flag or device. */
const isPlainPath = (t: string): boolean =>
  t !== '' &&
  !t.startsWith('-') &&
  !/[$`*?{}[\]~<>|&;()]/.test(t) &&
  !t.startsWith('/dev/') &&
  !t.startsWith('/proc/') &&
  t.length <= 4096

const tokenize = (segment: string): string[] | undefined => {
  const out: string[] = []
  const re = /'([^']*)'|"([^"$`\\]*)"|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(segment)) !== null) {
    if (m[3] !== undefined && /["']/.test(m[3])) return undefined
    out.push(m[1] ?? m[2] ?? m[3] ?? '')
  }
  return out
}

export type BashPaths = { read: string[]; written: string[] }

/**
 * The paths a Bash command clearly reads or writes, conservatively: redirections
 * (`> f`, `>> f`), `touch`/`tee`, `cp`/`mv` targets, `sed -i` files, and the file
 * arguments of a few readers (`cat`, `head`, `tail`, ...). Anything with variables,
 * globs, substitutions or a here-document is left alone.
 */
export const bashPaths = (command: string): BashPaths => {
  const read: string[] = []
  const written: string[] = []
  if (typeof command !== 'string' || command.length > 20_000 || /<<|\$\(|`/.test(command)) return { read, written }

  for (const raw of command.split(/&&|\|\||[;\n|]/)) {
    // Redirections first, then strip them from the segment.
    const segment = raw.replace(/\d?>&\d/g, ' ').replace(/&>/g, '>').replace(/(?:^|\s)\d?(>>?)\s*([^\s;&|]+)/g, (_all, _op, target: string) => {
      if (target !== '&1' && target !== '&2' && isPlainPath(target)) written.push(target)
      return ' '
    })
    const tokens = tokenize(segment.trim())
    if (tokens === undefined || tokens.length === 0) continue
    let [cmd, ...args] = tokens
    while (cmd !== undefined && /^\w+=/.test(cmd)) [cmd, ...args] = args
    if (cmd === 'sudo' || cmd === 'command') [cmd, ...args] = args
    if (cmd === undefined) continue
    const files = args.filter(a => !a.startsWith('-'))
    if (!files.every(isPlainPath)) continue

    if (READERS.has(cmd)) read.push(...files)
    else if (TOUCHERS.has(cmd)) written.push(...files)
    else if ((cmd === 'cp' || cmd === 'mv') && files.length >= 2 && !args.includes('-t')) {
      const dst = files[files.length - 1] as string
      if (files.length === 2) written.push(dst)
      if (cmd === 'cp') read.push(...files.slice(0, -1))
    } else if (cmd === 'sed' && args.some(a => /^-i/.test(a) || a === '--in-place')) {
      // `sed -i 's/a/b/' f1 f2` or `sed -i -e 's/a/b/' f1`: the first plain argument is the script.
      written.push(...files.slice(1))
    }
  }
  return { read: [...new Set(read)], written: [...new Set(written)] }
}

// ---------- rows ----------

export type Row = {
  rel: string
  name: string
  depth: number
  isDir: boolean
  isOpen: boolean
  /** A folder at the depth cap: shown, never opened. */
  isCapped: boolean
}

/** The tree as visible rows: folders-first, expanded folders' children under them. */
export const visibleRows = (tree: WorkspaceTree, expanded: ReadonlySet<string>, maxDepth: number, limit: number): Row[] => {
  const rows: Row[] = []
  const walk = (dir: string, depth: number): void => {
    for (const entry of tree.dirs[dir] ?? []) {
      if (rows.length >= limit) return
      const rel = dir === '' ? entry.name : `${dir}/${entry.name}`
      const isCapped = entry.isDir && depth + 1 >= maxDepth
      const isOpen = entry.isDir && !isCapped && expanded.has(rel)
      rows.push({ rel, name: entry.name, depth, isDir: entry.isDir, isOpen, isCapped })
      if (isOpen) walk(rel, depth + 1)
    }
  }
  walk('', 0)
  return rows
}

export const clamp = (n: unknown, lo: number, hi: number, fallback: number): number =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback
