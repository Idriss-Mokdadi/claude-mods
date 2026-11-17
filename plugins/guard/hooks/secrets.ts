// The secret guard's detectors. Each finds a real-looking credential and says
// its kind and line, never its value: a finding carries no part of the text it
// matched. Placeholders, documented examples and test keys pass (`sk-test`,
// `sk_test_`, `AKIA...EXAMPLE`, `xxxx`, `<your-key>`, `${TOKEN}`, low-entropy
// fillers, jwt.io's sample token).

export type SecretKind =
  | 'anthropic'
  | 'openai'
  | 'github'
  | 'gitlab'
  | 'slack'
  | 'stripe'
  | 'aws'
  | 'google'
  | 'jwt'
  | 'privateKey'
  | 'urlPassword'
  | 'envValue'

export const SECRET_KINDS: readonly SecretKind[] = ['anthropic', 'openai', 'github', 'gitlab', 'slack', 'stripe', 'aws', 'google', 'jwt', 'privateKey', 'urlPassword', 'envValue']

export type SecretHit = { kind: SecretKind; line: number }

type Detector = {
  kind: SecretKind
  re: RegExp
  // Which capture group holds the random part (0: the whole match).
  group?: number
  // Minimum entropy of that part, in bits per character.
  minEntropy?: number
  check?: (m: RegExpExecArray, text: string) => boolean
}

export function entropy(s: string): number {
  if (s.length === 0) return 0
  const counts = new Map<string, number>()
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  let h = 0
  for (const n of counts.values()) {
    const p = n / s.length
    h -= p * Math.log2(p)
  }
  return h
}

const PLACEHOLDER = /(example|sample|dummy|fake|placeholder|\byour[_-]|[_-]here\b|x{5,}|\*{3,}|changeme|redacted|replace[_-]?me|insert[_-]?here|<[^>]*>|\.\.\.|0{8,}|1234567890|abcdefgh|testtest)/i

// A body made of a few repeated characters, or a counting run.
const looksFilled = (s: string): boolean => {
  if (new Set(s).size < 8) return true
  return /0123456789|abcdefghij|ABCDEFGHIJ/.test(s)
}

const isPlaceholder = (whole: string, body: string): boolean => PLACEHOLDER.test(whole) || looksFilled(body)

const b64urlJson = (s: string): Record<string, unknown> | null => {
  try {
    const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
    const v = JSON.parse(atob(pad)) as unknown
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const COMMON_PASSWORDS = new Set(['password', 'passwd', 'pass', 'secret', 'postgres', 'root', 'admin', 'guest', 'test', 'dev', 'user', 'mysql', 'redis', 'example', 'changeme', 'pwd', 'p@ssw0rd', 'password1', '123456', 'letmein', 'rabbitmq', 'minio', 'minioadmin', 'sa', 'docker', 'local', 'localhost', 'demo'])

const DETECTORS: Detector[] = [
  { kind: 'anthropic', re: /\bsk-ant-(?:api|admin|oat|sid)\d{0,2}-([A-Za-z0-9_-]{32,})/g, group: 1, minEntropy: 3.5 },
  { kind: 'openai', re: /\bsk-(?:proj|svcacct|admin)-([A-Za-z0-9_-]{32,})/g, group: 1, minEntropy: 3.5 },
  { kind: 'openai', re: /\bsk-([A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20})\b/g, group: 1, minEntropy: 3.5 },
  { kind: 'openai', re: /\bsk-([A-Za-z0-9]{48})\b/g, group: 1, minEntropy: 4 },
  { kind: 'github', re: /\b(?:ghp|gho|ghu|ghs|ghr)_([A-Za-z0-9]{36})\b/g, group: 1, minEntropy: 3.5 },
  { kind: 'github', re: /\bgithub_pat_([A-Za-z0-9]{22}_[A-Za-z0-9]{59})\b/g, group: 1, minEntropy: 3.5 },
  { kind: 'gitlab', re: /\bgl(?:pat|dt|rt|cbt|imt|oas|soat|ffct|ft)-([A-Za-z0-9_-]{20,})/g, group: 1, minEntropy: 3.3 },
  { kind: 'gitlab', re: /\bglptt-([0-9a-f]{40})\b/g, group: 1, minEntropy: 3 },
  { kind: 'slack', re: /\bxox[abposre]-(\d{6,}-[A-Za-z0-9-]{10,})/g, group: 1, minEntropy: 3 },
  { kind: 'slack', re: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{6,}\/B[A-Z0-9]{6,}\/([A-Za-z0-9]{20,})/g, group: 1, minEntropy: 3.5 },
  { kind: 'stripe', re: /\b(?:sk|rk)_live_([A-Za-z0-9]{20,})\b/g, group: 1, minEntropy: 3.5 },
  { kind: 'aws', re: /\b(?:AKIA|ASIA|ABIA|ACCA)([A-Z0-9]{16})\b/g, group: 1, minEntropy: 2.8 },
  { kind: 'aws', re: /aws_?secret(?:_?access)?_?key["']?\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})(?![A-Za-z0-9/+=])/gi, group: 1, minEntropy: 4 },
  { kind: 'google', re: /\bAIza([0-9A-Za-z_-]{35})(?![0-9A-Za-z_-])/g, group: 1, minEntropy: 3.5 },
  { kind: 'google', re: /\bGOCSPX-([A-Za-z0-9_-]{28})\b/g, group: 1, minEntropy: 3.5 },
  { kind: 'google', re: /\bya29\.([0-9A-Za-z_-]{30,})/g, group: 1, minEntropy: 3.5 },
  {
    kind: 'jwt',
    re: /\b(eyJ[A-Za-z0-9_-]{8,})\.(eyJ[A-Za-z0-9_-]{8,})\.([A-Za-z0-9_-]{16,})/g,
    group: 3,
    minEntropy: 3.5,
    check: m => {
      const head = b64urlJson(m[1] as string)
      if (!head || typeof head.alg !== 'string') return false
      const body = b64urlJson(m[2] as string)
      // jwt.io's and the RFC's sample tokens.
      if (body && (body.name === 'John Doe' || body.sub === '1234567890')) return false
      return true
    },
  },
  {
    kind: 'privateKey',
    re: /-----BEGIN ((?:RSA|EC|DSA|OPENSSH|ENCRYPTED|PGP) )?PRIVATE KEY( BLOCK)?-----/g,
    check: (m, text) => {
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 400).replace(/\\n/g, '\n').replace(/\\r/g, '')
      const lines = after.split('\n').map(l => l.trim().replace(/^["']|["',]$/g, ''))
      const body = lines.filter(l => l !== '' && !/^[A-Za-z-]+:/.test(l)).join('')
      const run = /^[A-Za-z0-9+/=]{40,}/.exec(body)?.[0] ?? ''
      return run.length >= 40 && entropy(run) >= 4 && !looksFilled(run)
    },
  },
  {
    kind: 'urlPassword',
    re: /\b[a-z][a-z0-9+.-]{1,20}:\/\/([^\s:/@'"<>{}]+):([^\s@/'"<>]+)@[^\s'"<>]+/gi,
    group: 2,
    check: m => {
      const user = m[1] as string
      const pass = decodeURIComponentSafe(m[2] as string)
      if (pass.length < 6) return false
      if (/^[$%{]|\$\{|\{\{|^\*+$|^x+$/i.test(pass)) return false
      if (pass === user || COMMON_PASSWORDS.has(pass.toLowerCase())) return false
      if (PLACEHOLDER.test(pass) || /^(pass(word)?|secret|pwd)[_-]?\w{0,8}$/i.test(pass)) return false
      return entropy(pass) >= 2.5
    },
  },
]

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

const SECRET_NAME = /(SECRET|TOKEN|PASSWORD|PASSWD|PASSPHRASE|API_?KEY|APIKEY|PRIVATE_?KEY|ACCESS_?KEY|AUTH|CREDENTIALS?|_PWD$|^PWD_|CLIENT_SECRET|SIGNING_KEY|WEBHOOK)/i

// `.env`, `.env.local`, `prod.env`; never `.env.example` and its kin.
export const isEnvFile = (path: string | undefined): boolean => {
  if (!path) return false
  const name = path.split(/[\\/]/).pop() ?? ''
  if (/\.(example|sample|template|dist|defaults?|tpl|schema|test)$/i.test(name) || /example|sample|template/i.test(name)) return false
  return /^\.env(\..+)?$/i.test(name) || /\.env$/i.test(name)
}

const lineOf = (text: string, index: number): number => {
  let n = 1
  for (let k = 0; k < index && k < text.length; k++) if (text.charCodeAt(k) === 10) n++
  return n
}

function envValueOk(value: string, minLen: number, minEntropy: number): boolean {
  const v = value.trim().replace(/^["']|["']$/g, '').trim()
  if (v.length < minLen) return false
  if (/^[$%]|\$\{|\{\{|^<|^\(/.test(v)) return false
  if (/^(true|false|null|none|yes|no|\d+|https?:\/\/[^@]*)$/i.test(v)) return false
  if (PLACEHOLDER.test(v) || looksFilled(v)) return false
  if (COMMON_PASSWORDS.has(v.toLowerCase())) return false
  return entropy(v) >= minEntropy
}

// Finds secrets in `text`; `path` is the file it goes to, if any, and `inCommand`
// marks a shell command (where NAME=value assignments are judged strictly).
export function findSecrets(text: string, path?: string, inCommand = false): SecretHit[] {
  const hits: SecretHit[] = []
  if (!text) return hits
  const taken: [number, number][] = []
  for (const d of DETECTORS) {
    d.re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = d.re.exec(text)) !== null) {
      const start = m.index
      const end = start + m[0].length
      if (taken.some(([s, e]) => start < e && end > s)) continue
      const body = (m[d.group ?? 0] ?? m[0]) as string
      if (d.kind !== 'privateKey' && d.kind !== 'urlPassword' && isPlaceholder(m[0], body)) continue
      if (d.minEntropy !== undefined && entropy(body) < d.minEntropy) continue
      if (d.check && !d.check(m, text)) continue
      taken.push([start, end])
      hits.push({ kind: d.kind, line: lineOf(text, start) })
    }
  }
  // NAME=value in .env files, and in shell commands (export, inline, echo).
  if (isEnvFile(path)) {
    const lines = text.split('\n')
    lines.forEach((l, k) => {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*[=:]\s*(.*)$/.exec(l)
      if (!m || !SECRET_NAME.test(m[1] as string)) return
      if (hits.some(h => h.line === k + 1)) return
      const value = (m[2] as string).replace(/\s+#.*$/, '')
      if (envValueOk(value, 8, 2.8)) hits.push({ kind: 'envValue', line: k + 1 })
    })
  } else if (inCommand) {
    const re = /\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*("[^"]*"|'[^']*'|[^\s"';|&]+)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      if (!SECRET_NAME.test(m[1] as string)) continue
      const line = lineOf(text, m.index)
      if (taken.some(([s, e]) => (m as RegExpExecArray).index < e && (m as RegExpExecArray).index + (m as RegExpExecArray)[0].length > s)) continue
      if (envValueOk(m[2] as string, 16, 3.5)) hits.push({ kind: 'envValue', line })
    }
  }
  return hits.sort((a, b) => a.line - b.line)
}

// Paths the person lets secrets go to: globs with * and **.
export function pathAllowed(path: string | undefined, globs: readonly string[]): boolean {
  if (!path) return false
  const p = path.replace(/\\/g, '/')
  return globs.some(g => {
    const src = g
      .trim()
      .replace(/\\/g, '/')
      .replace(/[.+^${}()|[\]]/g, '\\$&')
      .replace(/\*\*\/?/g, '\u0000')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/\u0000/g, '.*')
    if (!src) return false
    return new RegExp(`(^|/)${src}$`).test(p)
  })
}
