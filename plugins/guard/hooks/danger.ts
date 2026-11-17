// The danger guard's rules: which commands destroy work. Each rule looks at a
// parsed command's program and arguments (shell.ts), never at raw text, so a
// read-only command that only mentions a danger (`echo "rm -rf /"`, `grep
// "git push --force"`, `git log`) is never caught.

import { parse, progOf, SH_SHELLS, type Cmd, type Dialect } from './shell'

export type Rule =
  | 'rmBroad'
  | 'bulkDelete'
  | 'findDelete'
  | 'forcePush'
  | 'resetHard'
  | 'gitClean'
  | 'branchDelete'
  | 'discard'
  | 'dd'
  | 'mkfs'
  | 'chmod777'
  | 'pipeShell'
  | 'winDelS'
  | 'winRd'
  | 'psRemove'
  | 'format'
  | 'sql'

export type Finding = {
  rule: Rule
  // The command that matched, as written (cut to 200 characters).
  text: string
  // The files and folders it names, for a checkpoint (concrete paths only).
  paths: string[]
}

export type DangerOptions = {
  // More operands than this in one delete is a bulk delete.
  maxFiles: number
  // Entries the person allows: a command prefix, or `re:<regex>`.
  allow: string[]
}

export const DEFAULTS: DangerOptions = { maxFiles: 20, allow: [] }

export function checkCommand(command: string, dialect: Dialect = 'sh', opts: DangerOptions = DEFAULTS): Finding[] {
  let cmds: Cmd[]
  try {
    cmds = parse(command, dialect)
  } catch {
    return []
  }
  const found: Finding[] = []
  for (const cmd of cmds) {
    const f = checkOne(cmd, cmds, opts)
    if (f && !isAllowed(cmd, command, opts.allow)) found.push(f)
  }
  // One finding per rule and text.
  const seen = new Set<string>()
  return found.filter(f => {
    const k = `${f.rule}\0${f.text}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export function isAllowed(cmd: Cmd, whole: string, allow: readonly string[]): boolean {
  const norm = cmd.argv.join(' ')
  for (const raw of allow) {
    const a = raw.trim()
    if (!a) continue
    if (a.startsWith('re:')) {
      try {
        const re = new RegExp(a.slice(3))
        if (re.test(norm) || re.test(whole)) return true
      } catch {
        // a bad pattern allows nothing
      }
    } else if (norm === a || norm.startsWith(a + ' ') || whole.trim() === a) return true
  }
  return false
}

export const parseAllow = (s: string): string[] =>
  s
    .split(/[,\n]/)
    .map(x => x.trim())
    .filter(Boolean)

const cut = (s: string): string => (s.length > 200 ? s.slice(0, 199) + '…' : s)

// ---------------------------------------------------------------------------
// Flags

type Flags = { recursive: boolean; force: boolean; dry: boolean; operands: string[]; noPreserveRoot: boolean }

// Reads rm-like flags in sh, PowerShell and cmd spellings at once.
function flagsOf(argv: string[], valued: readonly string[] = [], slashFlags = false): Flags {
  const f: Flags = { recursive: false, force: false, dry: false, operands: [], noPreserveRoot: false }
  let ended = false
  for (let k = 1; k < argv.length; k++) {
    const w = argv[k] as string
    const lw = w.toLowerCase()
    if (ended || w === '-' || !(w.startsWith('-') || (slashFlags && /^\/[a-z?]+$/i.test(w)))) {
      f.operands.push(w)
      continue
    }
    if (w === '--') {
      ended = true
      continue
    }
    if (valued.includes(lw)) {
      if (argv[k + 1] !== undefined) f.operands.push(argv[k + 1] as string)
      k++
      continue
    }
    if (lw === '--recursive' || /^-(r|re|rec|recu|recur|recurs|recurse)$/.test(lw) || lw === '/s') f.recursive = true
    else if (lw === '--force' || /^-(fo|for|forc|force)$/.test(lw) || lw === '/q' || lw === '/f') f.force = true
    else if (lw === '--no-preserve-root') f.noPreserveRoot = true
    else if (lw === '--dry-run' || lw === '-whatif' || lw === '--help' || lw === '/?') f.dry = true
    else if (/^-[a-z]+$/i.test(w) && !w.startsWith('--')) {
      // Combined short flags: -rf, -Rf, -fr.
      if (/[rR]/.test(w)) f.recursive = true
      if (/f/.test(w)) f.force = true
    } else if (slashFlags && /^\/[a-z]+$/i.test(w)) {
      // cmd: /s/q combined.
      if (/s/i.test(w)) f.recursive = true
      if (/q/i.test(w)) f.force = true
    }
  }
  return f
}

// ---------------------------------------------------------------------------
// Paths

const SYSTEM_TOP = new Set(['bin', 'boot', 'dev', 'etc', 'home', 'lib', 'lib32', 'lib64', 'opt', 'proc', 'root', 'sbin', 'srv', 'sys', 'usr', 'var', 'mnt', 'media', 'users', 'system', 'library', 'applications', 'private', 'volumes', 'snap', 'nix'])
const WIN_TOP = new Set(['windows', 'users', 'program files', 'program files (x86)', 'programdata', 'documents and settings'])

// A path whose removal takes far more than one project's build output.
export function isBroad(p: string): boolean {
  const t = p.trim()
  if (t === '') return true
  const s = t.replace(/[\\/]+$/, '') || t.slice(0, 1)
  const exact = ['/', '/*', '.', '..', '*', '.*', './*', '../*', '../..', '~', '~/*', '~\\*', '$HOME', '${HOME}', '$HOME/*', '%USERPROFILE%', '$env:USERPROFILE', '$env:HOMEPATH', '~+', '.git', './.git', '**', '/**']
  if (exact.includes(s) || exact.includes(t)) return true
  // An unexpanded variable alone, or with only a slash: empty means /.
  if (/^(\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|%[A-Za-z_]+%|\$env:[A-Za-z_]+)[\\/]?\*?$/.test(t)) return true
  // Drive roots and the top of a share.
  if (/^[A-Za-z]:[\\/]?\*?$/.test(t)) return true
  if (/^\\\\[^\\]+\\[^\\]+\\?$/.test(t)) return true
  // POSIX absolute: the root's own folders and the folders right below them.
  if (s.startsWith('/')) {
    const seg = s.split('/').filter(Boolean)
    if (seg.length <= 1) return true
    if (seg.length === 2 && SYSTEM_TOP.has((seg[0] as string).toLowerCase())) return true
    if (seg.every(x => x === '*' || x === '**')) return true
  }
  // Windows absolute.
  const win = /^[A-Za-z]:[\\/](.*)$/.exec(s)
  if (win) {
    const seg = (win[1] as string).split(/[\\/]/).filter(Boolean)
    if (seg.length <= 1) return true
    if (seg.length === 2 && WIN_TOP.has((seg[0] as string).toLowerCase())) return true
  }
  // Home folders one level down (~/Documents), and home itself spelled out.
  if (/^~[\\/][^\\/]+$/.test(s) || /^(\$HOME|\$\{HOME\}|%USERPROFILE%|\$env:USERPROFILE)[\\/][^\\/]+$/.test(s)) return true
  // Parents of the working folder.
  if (/^(\.\.[\\/])*\.\.$/.test(s)) return true
  return false
}

const isGlob = (p: string): boolean => /[*?[\]]/.test(p)
const isVar = (p: string): boolean => /\$|%[A-Za-z_]+%|…/.test(p) || p.startsWith('~')
// A path a checkpoint can read: no glob, no variable, not broad.
const concrete = (ps: string[]): string[] => ps.filter(p => p !== '' && !isGlob(p) && !isVar(p) && !isBroad(p))

// ---------------------------------------------------------------------------
// The rules

const DOWNLOADERS = new Set(['curl', 'wget', 'iwr', 'irm', 'invoke-webrequest', 'invoke-restmethod', 'fetch', 'aria2c', 'http', 'xh'])
const INTERPRETERS = new Set(['python', 'python2', 'python3', 'perl', 'ruby', 'node', 'deno', 'bun', 'php', 'lua'])
const PS_RUNNERS = new Set(['iex', 'invoke-expression', 'powershell', 'pwsh', 'cmd'])
const DB_CLIENTS = new Set(['psql', 'mysql', 'mariadb', 'sqlite3', 'sqlite', 'sqlcmd', 'duckdb', 'clickhouse-client', 'clickhouse', 'cockroach', 'invoke-sqlcmd', 'mongosh', 'mongo', 'bq', 'snowsql', 'cqlsh', 'redis-cli', 'osql', 'isql', 'db2', 'sqlplus', 'usql'])
const SQL_DROP = /\b(DROP\s+(DATABASE|TABLE|SCHEMA|KEYSPACE)\b|TRUNCATE\s+(TABLE\s+)?[`"[\w]|FLUSHALL\b|FLUSHDB\b|dropDatabase\s*\()/i
const SUBST_DOWNLOAD = /(\$\(|<\(|`|\()\s*(curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)\b|downloadstring\s*\(|\bnet\.webclient\b/i
const RM_PS = new Set(['remove-item', 'ri', 'rm', 'del', 'erase', 'rd', 'rmdir'])

const GIT_VALUED = new Set(['-c', '-C', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env'])

function gitSub(argv: string[]): { sub: string; rest: string[] } | null {
  let k = 1
  while (k < argv.length) {
    const w = argv[k] as string
    if (GIT_VALUED.has(w)) k += 2
    else if (w.startsWith('-')) k++
    else break
  }
  if (k >= argv.length) return null
  return { sub: argv[k] as string, rest: argv.slice(k + 1) }
}

const hasShort = (rest: string[], ch: string): boolean => rest.some(w => /^-[A-Za-z]+$/.test(w) && w.includes(ch))

function checkGit(cmd: Cmd): Finding | null {
  const g = gitSub(cmd.argv)
  if (!g) return null
  const { sub, rest } = g
  const text = cut(cmd.raw)
  const dry = rest.includes('--dry-run') || rest.includes('-n') || rest.includes('--help')
  if (sub === 'push') {
    if (dry) return null
    const lease = rest.some(w => w.startsWith('--force-with-lease'))
    const force = rest.some(w => w === '--force' || w === '-f' || (/^-[A-Za-z]+$/.test(w) && w.includes('f')))
    const plus = rest.some(w => /^\+[^+]/.test(w))
    if (force || (plus && !lease)) return { rule: 'forcePush', text, paths: [] }
    return null
  }
  if (sub === 'reset' && rest.includes('--hard')) return { rule: 'resetHard', text, paths: [] }
  if (sub === 'clean') {
    if (dry || rest.includes('-i') || rest.includes('--interactive')) return null
    if (rest.includes('--force') || hasShort(rest, 'f')) return { rule: 'gitClean', text, paths: [] }
    return null
  }
  if (sub === 'branch') {
    const del = rest.includes('--delete') || hasShort(rest, 'd')
    const force = rest.includes('--force') || hasShort(rest, 'f')
    if (hasShort(rest, 'D') || (del && force)) return { rule: 'branchDelete', text, paths: [] }
    return null
  }
  if (sub === 'checkout' || sub === 'restore') {
    if (sub === 'restore' && (rest.includes('--staged') || rest.includes('-S')) && !rest.includes('--worktree') && !rest.includes('-W')) return null
    const dd = rest.indexOf('--')
    const ops = (dd >= 0 ? rest.slice(dd + 1) : sub === 'restore' ? rest.filter(w => !w.startsWith('-')) : rest.filter(w => w === '.' || w === '*' || w === ':/'))
    if (ops.some(w => w === '.' || w === '*' || w === ':/' || w === './')) return { rule: 'discard', text, paths: [] }
    return null
  }
  if (sub === 'rm') {
    const f = flagsOf(['git', ...rest])
    if (rest.includes('--cached')) return null
    if (f.recursive && f.operands.some(isBroad)) return { rule: 'rmBroad', text, paths: [] }
    return null
  }
  return null
}

function checkOne(cmd: Cmd, all: Cmd[], opts: DangerOptions): Finding | null {
  const p = cmd.prog
  const a = cmd.argv
  const text = cut(cmd.raw)
  const isPs = cmd.dialect === 'ps'
  const isCmd = cmd.dialect === 'cmd'

  if (p === 'git') return checkGit(cmd)

  // Windows cmd deletes.
  if ((isCmd || (!isPs && /^\//.test(a[1] ?? ''))) && (p === 'del' || p === 'erase')) {
    const f = flagsOf(a, [], true)
    if (f.dry) return null
    if (f.recursive) return { rule: 'winDelS', text, paths: concrete(f.operands) }
    if (f.operands.length > opts.maxFiles) return { rule: 'bulkDelete', text, paths: concrete(f.operands) }
    return null
  }
  if ((isCmd || (!isPs && /^\//.test(a[1] ?? ''))) && (p === 'rd' || p === 'rmdir')) {
    const f = flagsOf(a, [], true)
    if (f.recursive && f.operands.some(isBroad)) return { rule: 'winRd', text, paths: [] }
    return null
  }
  if (p === 'format' && a.slice(1).some(w => /^[A-Za-z]:\\?$/.test(w))) return { rule: 'format', text, paths: [] }
  if (['format-volume', 'clear-disk', 'initialize-disk', 'remove-partition'].includes(p)) return { rule: 'format', text, paths: [] }

  // PowerShell Remove-Item and its aliases.
  if (isPs && RM_PS.has(p)) {
    const f = flagsOf(a, ['-path', '-literalpath', '-lp', '-pspath', '-include', '-exclude', '-filter'])
    if (f.dry) return null
    const ops = f.operands.flatMap(o => o.split(',')).map(o => o.trim()).filter(Boolean)
    if (f.recursive && ops.some(isBroad)) return { rule: 'psRemove', text, paths: [] }
    if (ops.length > opts.maxFiles) return { rule: 'bulkDelete', text, paths: concrete(ops) }
    return null
  }

  // POSIX rm.
  if (p === 'rm' || p === 'unlink' || p === 'shred') {
    const f = flagsOf(a)
    if (f.dry) return null
    if (cmd.viaXargs) return { rule: 'bulkDelete', text, paths: [] }
    if (f.noPreserveRoot) return { rule: 'rmBroad', text, paths: [] }
    const broad = f.operands.some(isBroad)
    const all = f.operands.some(o => o === '*' || o === './*' || o === '.*')
    if (broad && (f.recursive || all)) return { rule: 'rmBroad', text, paths: [] }
    if (f.operands.length > opts.maxFiles) return { rule: 'bulkDelete', text, paths: concrete(f.operands) }
    return null
  }

  // find ... -delete / -exec rm.
  if (p === 'find') {
    const k = a.findIndex(w => w === '-exec' || w === '-execdir')
    if (a.includes('-delete') || (k >= 0 && ['rm', 'shred', 'unlink'].includes(progOf(a[k + 1] ?? '')))) return { rule: 'findDelete', text, paths: [] }
    return null
  }

  if (p === 'dd') {
    const of = a.find(w => w.startsWith('of='))?.slice(3)
    if (of && /^\/dev\//.test(of) && !/^\/dev\/(null|zero|stdout|stderr|tty|fd\/)/.test(of)) return { rule: 'dd', text, paths: [] }
    if (of && /^\\\\\.\\(physicaldrive|[a-z]:)/i.test(of)) return { rule: 'dd', text, paths: [] }
    return null
  }
  if (/^mkfs(\..+)?$/.test(p) || ['mke2fs', 'mkswap', 'wipefs', 'newfs', 'mkntfs', 'mkdosfs'].includes(p)) return { rule: 'mkfs', text, paths: [] }
  if (p === 'diskutil' && /^(erase|zerodisk|secureerase|partitiondisk|reformat)/i.test(a[1] ?? '')) return { rule: 'mkfs', text, paths: [] }

  if (p === 'chmod') {
    const rec = a.some(w => w === '-R' || w === '--recursive' || /^-[a-zA-Z]*R/.test(w))
    const mode = a.slice(1).find(w => !w.startsWith('-'))
    const open = mode !== undefined && (/^0?777$/.test(mode) || /^[ugoa]*\+?=?rwx[st]*$/.test(mode) && /^(a|ugo|o)?[+=]rwx/.test(mode) || /^(a|o)\+w/.test(mode))
    const targets = a.slice(1).filter(w => !w.startsWith('-') && w !== mode)
    if (open && (rec || targets.some(isBroad))) return { rule: 'chmod777', text, paths: [] }
    return null
  }

  // Download piped into a shell: curl ... | sh, iwr ... | iex.
  const isRunner = SH_SHELLS.has(p) || INTERPRETERS.has(p) || PS_RUNNERS.has(p)
  if (isRunner && cmd.pos > 0) {
    const before = all.filter(c => c.pipe === cmd.pipe && c.pos < cmd.pos && c.depth === cmd.depth)
    if (before.some(c => DOWNLOADERS.has(c.prog) || /downloadstring|net\.webclient/i.test(c.raw))) {
      // An interpreter that reads a script file or -c code is not running stdin.
      const args = a.slice(1)
      const readsStdin = SH_SHELLS.has(p)
        ? !args.some(w => /^-[a-zA-Z]*c/.test(w))
        : INTERPRETERS.has(p)
          ? args.length === 0 || args.every(w => w === '-' || /^-[A-Za-z]$/.test(w) && w !== '-c' && w !== '-m' && w !== '-e')
          : true
      if (readsStdin) return { rule: 'pipeShell', text, paths: [] }
    }
  }
  if (isRunner && SUBST_DOWNLOAD.test(cmd.raw.slice(a[0]?.length ?? 0))) return { rule: 'pipeShell', text, paths: [] }
  if (SH_SHELLS.has(p) && a.slice(1).some(w => w === '<(…)') && /<\(\s*(curl|wget)\b/.test(cmd.raw)) return { rule: 'pipeShell', text, paths: [] }

  // SQL that drops data, sent to a database client.
  if (p === 'dropdb' || p === 'dropuser') return { rule: 'sql', text, paths: [] }
  if (DB_CLIENTS.has(p)) {
    const pipeText = all.filter(c => c.pipe === cmd.pipe && c.depth === cmd.depth).map(c => c.raw).join(' | ')
    if (SQL_DROP.test(cmd.raw) || SQL_DROP.test(cmd.stdin) || SQL_DROP.test(pipeText)) return { rule: 'sql', text, paths: [] }
  }
  return null
}

// The shell a tool runs its command in.
export const dialectOf = (tool: string): Dialect => (tool === 'PowerShell' ? 'ps' : 'sh')
