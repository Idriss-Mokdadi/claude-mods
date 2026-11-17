// A small shell reader for the danger guard: it splits a command line into
// simple commands (argv), pipelines and nested commands ($(...), backticks,
// <(...), `bash -c`, `cmd /c`, `powershell -Command`, `eval`), so a rule only
// ever looks at the program a command really runs. Text inside quotes stays
// one argument: `echo "rm -rf /"` runs echo, never rm.
//
// Dialects: `sh` (bash, zsh, dash), `ps` (PowerShell: backtick escapes, no
// backslash escapes), `cmd` (Windows cmd.exe: ^ escapes, & separates).

export type Dialect = 'sh' | 'ps' | 'cmd'

export type Cmd = {
  // The program and its arguments, quotes removed; argv[0] is the program as
  // written (`/usr/bin/rm`, `Remove-Item`), see `prog` for the plain name.
  argv: string[]
  // argv[0] without its folder, `.exe` and case (`rm`, `remove-item`).
  prog: string
  // The command's own text as written.
  raw: string
  // Which pipeline of the line it belongs to, and its place in it.
  pipe: number
  pos: number
  // What a here-document feeds it (`<<EOF ... EOF`).
  stdin: string
  // The dialect it was read in.
  dialect: Dialect
  // Run through `xargs`: the operands come from stdin, count unknown.
  viaXargs: boolean
  // Nested at this depth (0 for the line itself).
  depth: number
}

const MAX_DEPTH = 4

type Word = { text: string; isGlob: boolean }

let pipeSeq = 0

export function parse(src: string, dialect: Dialect = 'sh', depth = 0): Cmd[] {
  if (depth === 0) pipeSeq = 0
  const out: Cmd[] = []
  if (depth > MAX_DEPTH || src.length === 0) return out
  const nested: { text: string; dialect: Dialect }[] = []

  let pipe = pipeSeq++
  let pos = 0
  let words: Word[] = []
  let cur: string | null = null
  let start = -1
  let i = 0
  let pendingHeredocs: { delim: string; strip: boolean }[] = []
  let heredocTarget: Cmd[] = []
  let stdinBuf = ''
  let redirectNext = false
  const esc = dialect === 'sh' ? '\\' : dialect === 'ps' ? '`' : '^'

  const endWord = () => {
    if (cur !== null) {
      if (redirectNext) redirectNext = false
      else words.push({ text: cur, isGlob: false })
    }
    cur = null
  }
  const endCmd = (end: number) => {
    endWord()
    if (words.length > 0) {
      const raw = src.slice(start, end).trim()
      const cmd = normalize(words.map(w => w.text), raw, pipe, pos, dialect, depth)
      if (cmd) {
        cmd.stdin = stdinBuf
        out.push(cmd)
        if (pendingHeredocs.length > 0) heredocTarget.push(cmd)
      }
      pos++
    }
    words = []
    start = -1
    stdinBuf = ''
  }
  const newPipe = () => {
    pipe = pipeSeq++
    pos = 0
  }
  const add = (s: string) => {
    if (start < 0) start = i
    cur = (cur ?? '') + s
  }
  // Reads a balanced (...) from j (just past the opening paren); returns the
  // inner text and the index past the closing paren.
  const balanced = (j: number): [string, number] => {
    let d = 1
    let k = j
    let q: string | null = null
    while (k < src.length) {
      const c = src[k] as string
      if (q) {
        if (c === q) q = null
        else if (c === esc && q === '"' && dialect !== 'cmd') k++
      } else if (c === "'" || c === '"') q = c
      else if (c === esc && dialect !== 'cmd') k++
      else if (c === '(') d++
      else if (c === ')') {
        d--
        if (d === 0) return [src.slice(j, k), k + 1]
      }
      k++
    }
    return [src.slice(j), src.length]
  }

  while (i < src.length) {
    const c = src[i] as string
    const n = src[i + 1] ?? ''

    // Here-document bodies start after the line that opened them.
    if (c === '\n' && pendingHeredocs.length > 0) {
      endCmd(i)
      let k = i + 1
      for (const h of pendingHeredocs) {
        const body: string[] = []
        while (k < src.length) {
          const eol = src.indexOf('\n', k)
          const line = src.slice(k, eol < 0 ? src.length : eol)
          k = eol < 0 ? src.length : eol + 1
          if ((h.strip ? line.replace(/^\t+/, '') : line).trim() === h.delim) break
          body.push(line)
        }
        for (const t of heredocTarget) t.stdin += body.join('\n') + '\n'
      }
      pendingHeredocs = []
      heredocTarget = []
      newPipe()
      i = k
      continue
    }

    if (cur === null && (c === ' ' || c === '\t' || c === '\r')) {
      i++
      continue
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      endWord()
      i++
      continue
    }
    // Comments.
    if (c === '#' && cur === null && dialect !== 'cmd') {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }
    // Separators.
    if (c === '\n' || c === ';' || (c === '&' && n === '&') || (c === '|' && n === '|')) {
      endCmd(i)
      newPipe()
      i += c === '\n' || c === ';' ? 1 : 2
      continue
    }
    if (c === '|') {
      endCmd(i)
      pos = Math.max(pos, 1)
      i += n === '&' ? 2 : 1
      continue
    }
    if (c === '&') {
      // `&>` redirect (sh); `& cmd` call operator (ps); else background/separator.
      if (dialect === 'sh' && n === '>') {
        endWord()
        redirectNext = true
        i += src[i + 2] === '>' ? 3 : 2
        continue
      }
      if (dialect === 'ps' && cur === null && words.length === 0) {
        i++
        continue
      }
      endCmd(i)
      newPipe()
      i++
      continue
    }
    // Process substitution <( ... ) and >( ... ).
    if ((c === '<' || c === '>') && n === '(' && dialect === 'sh') {
      const [inner, end] = balanced(i + 2)
      nested.push({ text: inner, dialect })
      add('<(…)')
      i = end
      continue
    }
    // Here-documents.
    if (c === '<' && n === '<' && dialect === 'sh' && src[i + 2] !== '<') {
      endWord()
      let k = i + 2
      let strip = false
      if (src[k] === '-') {
        strip = true
        k++
      }
      while (src[k] === ' ') k++
      const m = /^(['"]?)([A-Za-z0-9_.-]+)\1/.exec(src.slice(k))
      if (m) {
        pendingHeredocs.push({ delim: m[2] as string, strip })
        i = k + m[0].length
      } else i = k
      continue
    }
    // Redirections: the next word is a file, not an argument.
    if (c === '>' || c === '<') {
      if (cur !== null && /^\d+$/.test(cur)) cur = null
      endWord()
      redirectNext = true
      i++
      while (src[i] === '>' || src[i] === '&') i++
      if (src[i - 1] === '&' && /\d/.test(src[i] ?? '')) {
        // 2>&1: no file follows.
        while (/\d/.test(src[i] ?? '')) i++
        redirectNext = false
      }
      continue
    }
    // PowerShell: ( ... ) is an expression, run in place.
    if (c === '(' && dialect === 'ps') {
      const [inner, end] = balanced(i + 1)
      nested.push({ text: inner, dialect })
      add('(…)')
      i = end
      continue
    }
    // Subshells and groups only separate.
    if ((c === '(' || c === ')') && cur === null) {
      endCmd(i)
      if (c === '(') newPipe()
      i++
      continue
    }
    if ((c === '{' || c === '}') && cur === null && dialect !== 'ps' && (n === ' ' || n === '\n' || n === '')) {
      endCmd(i)
      i++
      continue
    }
    // $( ... ) command substitution (sh) and subexpression (ps).
    if (c === '$' && n === '(' && dialect !== 'cmd') {
      const [inner, end] = balanced(i + 2)
      nested.push({ text: inner, dialect })
      add('$(…)')
      i = end
      continue
    }
    if (c === '`' && dialect === 'sh') {
      const end = src.indexOf('`', i + 1)
      const inner = src.slice(i + 1, end < 0 ? src.length : end)
      nested.push({ text: inner, dialect })
      add('`…`')
      i = end < 0 ? src.length : end + 1
      continue
    }
    // Quotes.
    if (c === "'" && dialect !== 'cmd') {
      const end = src.indexOf("'", i + 1)
      add(src.slice(i + 1, end < 0 ? src.length : end))
      i = end < 0 ? src.length : end + 1
      continue
    }
    if (c === '"') {
      let k = i + 1
      let buf = ''
      while (k < src.length && src[k] !== '"') {
        const ch = src[k] as string
        if (ch === esc && dialect !== 'cmd' && k + 1 < src.length) {
          const nx = src[k + 1] as string
          if (dialect === 'ps' || '"\\$`\n'.includes(nx)) {
            buf += nx
            k += 2
            continue
          }
        }
        if (ch === '$' && src[k + 1] === '(' && dialect !== 'cmd') {
          const [inner, end] = balanced(k + 2)
          nested.push({ text: inner, dialect })
          buf += '$(…)'
          k = end
          continue
        }
        if (ch === '`' && dialect === 'sh') {
          const end = src.indexOf('`', k + 1)
          nested.push({ text: src.slice(k + 1, end < 0 ? src.length : end), dialect })
          buf += '`…`'
          k = end < 0 ? src.length : end + 1
          continue
        }
        buf += ch
        k++
      }
      add(buf)
      i = k + 1
      continue
    }
    // Escapes: in sh only before a char that needs one, so C:\Users stays.
    if (c === esc) {
      if (dialect === 'sh') {
        if (n === '\n') {
          i += 2
          continue
        }
        if (n !== '' && ' \t"\'\\$`;&|<>(){}*?#!'.includes(n)) {
          add(n)
          i += 2
          continue
        }
        add(c)
        i++
        continue
      }
      if (n !== '') add(n)
      i += 2
      continue
    }
    add(c)
    i++
  }
  endCmd(src.length)

  // Commands a command runs: shells with -c, cmd /c, powershell -Command, eval.
  for (const cmd of [...out]) {
    const inner = innerScript(cmd)
    if (inner) out.push(...parse(inner.text, inner.dialect, depth + 1))
  }
  for (const n of nested) out.push(...parse(n.text, n.dialect, depth + 1))
  return out
}

export const SH_SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish', 'ash', 'busybox-sh'])
const PS_SHELLS = new Set(['powershell', 'pwsh'])

function innerScript(cmd: Cmd): { text: string; dialect: Dialect } | null {
  const a = cmd.argv
  if (SH_SHELLS.has(cmd.prog)) {
    for (let k = 1; k < a.length; k++) {
      const w = a[k] as string
      if (/^-[a-zA-Z]*c[a-zA-Z]*$/.test(w)) return a[k + 1] !== undefined ? { text: a[k + 1] as string, dialect: 'sh' } : null
      if (!w.startsWith('-')) return null
    }
    return null
  }
  if (cmd.prog === 'eval') return { text: a.slice(1).join(' '), dialect: cmd.dialect }
  if (cmd.prog === 'cmd') {
    const k = a.findIndex((w, j) => j > 0 && /^\/[ck]$/i.test(w))
    return k > 0 ? { text: a.slice(k + 1).join(' '), dialect: 'cmd' } : null
  }
  if (PS_SHELLS.has(cmd.prog)) {
    for (let k = 1; k < a.length; k++) {
      const w = (a[k] as string).toLowerCase()
      if (/^-(c|co|com|comm|comma|comman|command)$/.test(w)) return { text: a.slice(k + 1).join(' '), dialect: 'ps' }
      if (/^-(e|ec|en|enc|enco|encod|encode|encoded|encodedc|encodedcommand)$/.test(w)) {
        const decoded = decodeUtf16(a[k + 1] ?? '')
        return decoded ? { text: decoded, dialect: 'ps' } : null
      }
      if (/^-(f|file)$/.test(w)) return null
      if (!w.startsWith('-')) return { text: a.slice(k).join(' '), dialect: 'ps' }
    }
    return null
  }
  if (cmd.dialect === 'ps' && (cmd.prog === 'invoke-expression' || cmd.prog === 'iex')) {
    const text = a.slice(1).filter(w => !/^-command$/i.test(w)).join(' ')
    return text && !text.includes('…') ? { text, dialect: 'ps' } : null
  }
  return null
}

function decodeUtf16(b64: string): string | null {
  try {
    const bin = atob(b64)
    let s = ''
    for (let k = 0; k + 1 < bin.length; k += 2) s += String.fromCharCode(bin.charCodeAt(k) | (bin.charCodeAt(k + 1) << 8))
    return s
  } catch {
    return null
  }
}

// Wrappers that run the next word as the program.
const WRAPPERS = new Set(['sudo', 'doas', 'run0', 'env', 'time', 'nohup', 'nice', 'ionice', 'exec', 'command', 'builtin', 'stdbuf', 'timeout', 'chroot', 'busybox', 'caffeinate'])
// Wrapper options that take a value.
const WRAPPER_ARG: Record<string, RegExp> = {
  sudo: /^-[ugpCDhrt]$/,
  doas: /^-[uC]$/,
  env: /^-[uCS]$/,
  nice: /^-n$/,
  ionice: /^-[cnp]$/,
  timeout: /^-[sk]$/,
  stdbuf: /^-[ioe]$/,
}
const XARGS_ARG = /^-[nILPdEsa]$/

export const progOf = (w: string): string =>
  (w.split(/[\\/]/).pop() ?? w).replace(/\.(exe|cmd|bat|com)$/i, '').toLowerCase()

function normalize(argv: string[], raw: string, pipe: number, pos: number, dialect: Dialect, depth: number): Cmd | null {
  let a = argv
  let viaXargs = false
  for (let guard = 0; guard < 8 && a.length > 0; guard++) {
    const p = progOf(a[0] as string)
    // VAR=value prefixes.
    if (dialect === 'sh' && /^[A-Za-z_][A-Za-z0-9_]*=/.test(a[0] as string)) {
      a = a.slice(1)
      continue
    }
    if (WRAPPERS.has(p) && dialect !== 'cmd') {
      let k = 1
      while (k < a.length) {
        const w = a[k] as string
        if (p === 'env' && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) k++
        else if (p === 'timeout' && /^\d/.test(w)) k++
        else if (w === '--') {
          k++
          break
        } else if (w.startsWith('-')) k += WRAPPER_ARG[p]?.test(w) ? 2 : 1
        else break
      }
      a = a.slice(k)
      continue
    }
    if (p === 'xargs') {
      let k = 1
      while (k < a.length && (a[k] as string).startsWith('-')) k += XARGS_ARG.test(a[k] as string) ? 2 : 1
      a = a.slice(k)
      viaXargs = true
      continue
    }
    break
  }
  if (a.length === 0) return null
  return { argv: a, prog: progOf(a[0] as string), raw, pipe, pos, stdin: '', dialect, viaXargs, depth }
}
