// Fake credentials for the tests, made at run time from a seeded generator so
// no key-shaped string is written in this repository (secret scanners and
// push protection stay quiet). None of them is or was ever a real key.

export function rng(seed: number): (n: number, alphabet?: string) => string {
  let a = seed >>> 0
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return (n, al = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') => {
    let s = ''
    for (let k = 0; k < n; k++) s += al[Math.floor(next() * al.length)]
    return s
  }
}

const UP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const b64u = (o: unknown): string => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
// Prefixes in two parts, so the source never holds a key's real opening.
const P = (a: string, b: string): string => a + b

export function fakes(seed = 42): Record<string, string> {
  const r = rng(seed)
  return {
    anthropic: P('sk-', 'ant-api03-') + r(93) + 'AA',
    openai: P('sk-', 'proj-') + r(64),
    github: P('gh', 'p_') + r(36),
    githubPat: P('github', '_pat_') + r(22) + '_' + r(59),
    gitlab: P('gl', 'pat-') + r(20),
    slack: P('xo', 'xb-') + '2468013579' + r(2, '123456789') + '-' + r(24),
    stripe: P('sk', '_live_') + r(32),
    aws: P('AK', 'IA') + r(16, UP),
    awsSecret: 'aws_secret_access_key = ' + r(40, B64),
    google: P('AI', 'za') + r(35),
    jwt: b64u({ alg: 'HS256', typ: 'JWT' }) + '.' + b64u({ sub: 'u-' + r(10), iat: 1763000000, role: 'admin' }) + '.' + r(43),
    privateKey: P('-----BEGIN ', 'RSA PRIVATE KEY-----') + '\n' + r(64, B64) + '\n' + r(64, B64) + '\n-----END RSA PRIVATE KEY-----',
    urlPassword: 'postgres://app:' + r(16) + '@db.internal.test:5432/app',
  }
}

// The kind each fake must be found as.
export const KIND_OF: Record<string, string> = {
  anthropic: 'anthropic',
  openai: 'openai',
  github: 'github',
  githubPat: 'github',
  gitlab: 'gitlab',
  slack: 'slack',
  stripe: 'stripe',
  aws: 'aws',
  awsSecret: 'aws',
  google: 'google',
  jwt: 'jwt',
  privateKey: 'privateKey',
  urlPassword: 'urlPassword',
}

// Pieces of a secret that must never show anywhere: every 8-character slice
// of its random part.
export function slices(secret: string): string[] {
  const body = secret.replace(/^[a-z_-]{2,12}[-_]/i, '')
  const out: string[] = []
  for (let k = 0; k + 8 <= body.length; k += 4) out.push(body.slice(k, k + 8))
  return out.filter(s => /[0-9]/.test(s) && /[A-Za-z]/.test(s))
}
