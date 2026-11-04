// Zero-token detection of corrections and preferences in a prompt, in English,
// French and Arabic. Pure functions: no `$`, no I/O, so tests import them as is.

export const MAX_RULE = 120

type Rule = {
  // Matched against one sentence, trimmed, lower-cased for the Latin scripts.
  re: RegExp
  // Builds the rule line from the match on the ORIGINAL sentence (case kept).
  make: (m: RegExpMatchArray) => string
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

// A Latin rule keeps the person's wording after the trigger: "use pnpm" → "Use pnpm".
const keep = (lead: string) => (m: RegExpMatchArray): string => `${lead}${m[m.length - 1] ?? ''}`

// Polite openers stripped before matching: "please always…", "ok so never…".
const OPENER_EN = /^(?:(?:ok(?:ay)?|so|and|also|hey|please|pls|actually|btw)[,\s]+)+/i
const OPENER_FR = /^(?:(?:ok|alors|et|aussi|stp|s'il te plaît|s'il vous plaît|svp|en fait|d'ailleurs)[,\s]+)+/i
const OPENER_AR = /^(?:(?:من فضلك|رجاء|رجاءً|ايضا|أيضا|أيضاً|و)\s*[،,]?\s*)+/

const EN: Rule[] = [
  // "no, use X" / "nope, it should be X" / "no — X instead"
  { re: /^(?:no|nope|nah|wrong)\s*[,.!:;—–-]+\s*(?:you should\s+|please\s+)?((?:use|do|write|call|run|put|keep|make|try|it should be|that should be)\b.+)$/i, make: m => cap(m[1] ?? '') },
  { re: /^(?:from now on|going forward|in future|in the future)[,\s]+(.+)$/i, make: m => cap(m[1] ?? '') },
  { re: /^(?:you should |you must |make sure to )?always\s+(.+)$/i, make: keep('Always ') },
  { re: /^(?:you should |you must )?never\s+(.+)$/i, make: keep('Never ') },
  { re: /^(?:i(?:'d| would)? (?:really )?prefer(?: it if you| that you| you| to)?|i(?:'d| would) rather(?: you)?|i like it better when you)\s+(.+)$/i, make: m => `Prefer ${m[1] ?? ''}` },
  { re: /^(?:don'?t|do not|stop|quit)\s+(?!worry|mind|know|think|care|bother|get me wrong)(.+)$/i, make: m => `${/^stop|^quit/i.test(m[0]) ? 'Stop' : "Don't"} ${m[1] ?? ''}` },
  { re: /^(?:remember|keep in mind|note|bear in mind)(?: that|:)?\s+(.+)$/i, make: m => cap(m[1] ?? '') },
]

const FR: Rule[] = [
  { re: /^non\s*[,.!:;—–-]+\s*((?:utilise|utilisez|fais|faites|écris|mets|garde|c'est|il faut).+)$/i, make: m => cap(m[1] ?? '') },
  { re: /^(?:à partir de maintenant|désormais|dorénavant|à l'avenir)[,\s]+(.+)$/i, make: m => cap(m[1] ?? '') },
  { re: /^(?:il faut )?toujours\s+(.+)$/i, make: keep('Toujours ') },
  { re: /^(?:ne\s+|n')(.+?)\s+jamais\b\s*(.*)$/i, make: m => `Ne jamais ${m[1] ?? ''}${m[2] ? ` ${m[2]}` : ''}` },
  { re: /^jamais\s+(.+)$/i, make: keep('Jamais ') },
  { re: /^(?:je préfère|je préférerais|j'aime mieux)\s+(?:que tu\s+|que vous\s+)?(.+)$/i, make: m => `Préférer ${m[1] ?? ''}` },
  { re: /^(?:n'utilise|n'utilisez)\s+(?:pas|plus)\s+(.+)$/i, make: m => `Ne pas utiliser ${m[1] ?? ''}` },
  { re: /^(?:ne\s+)(\S+)\s+(?:pas|plus)\s+(.+)$/i, make: m => `Ne pas ${m[1] ?? ''} ${m[2] ?? ''}` },
  { re: /^(?:souviens-toi|rappelle-toi|n'oublie pas|retiens|souvenez-vous)(?: que| qu'|:)?\s*(.+)$/i, make: m => cap(m[1] ?? '') },
]

// Arabic has no case; the rule keeps the sentence from the trigger on.
const AR: Rule[] = [
  { re: /^لا\s*[،,.!:]+\s*(استخدم.+|اكتب.+|افعل.+|اجعل.+)$/, make: m => m[1] ?? '' },
  { re: /^(?:من الآن(?: فصاعدا| فصاعداً)?|من الان|بعد الآن)\s*[،,]?\s*(.+)$/, make: m => m[1] ?? '' },
  { re: /^((?:دائما|دائماً|دوما|دوماً)\s+.+)$/, make: m => m[1] ?? '' },
  { re: /^((?:أبدا|أبداً|ابدا)\s+.+)$/, make: m => m[1] ?? '' },
  { re: /^((?:أفضل|أفضّل|افضل|أُفضّل)\s+.+)$/, make: m => m[1] ?? '' },
  { re: /^(لا\s+ت\S+\s+.+)$/, make: m => m[1] ?? '' },
  { re: /^(?:تذكر|تذكّر|تذكَّر)\s*(?:أن|أنّ|ان)?\s*(.+)$/, make: m => m[1] ?? '' },
]

const ARABIC = /[؀-ۿ]/

// One sentence a line; a question is never a rule.
export const sentences = (text: string): string[] =>
  text
    .split(/(?<=[.!؟?])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length >= 4 && s.length <= 300 && !/[?؟]$/.test(s))

export const tidy = (rule: string): string => {
  let r = rule.replace(/\s+/g, ' ').replace(/^[\s"'`«»]+|[\s"'`«»]+$/g, '').replace(/[.!;,:،]+$/, '').trim()
  if (r.length > MAX_RULE) r = `${r.slice(0, MAX_RULE - 1).replace(/\s+\S*$/, '')}…`
  if (!r) return ''
  return /[…]$/.test(r) ? r : `${r}.`
}

const tryRules = (s: string, rules: Rule[], opener: RegExp): string | null => {
  const bare = s.replace(opener, '')
  for (const rule of rules) {
    const m = bare.match(rule.re)
    if (m) {
      const out = tidy(rule.make(m))
      // A rule of a word or two after its trigger says too little to keep.
      if (out.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').length >= 2) return out
    }
  }
  return null
}

/**
 * The first correction or preference in the prompt, rewritten as one short rule
 * line, or null. Slash commands, code blocks and long pastes are not read.
 */
export const detect = (text: string): string | null => {
  if (!text || text.startsWith('/') || text.length > 2000) return null
  const plain = text.replace(/```[\s\S]*?```/g, ' ')
  for (const s of sentences(plain)) {
    const hit = ARABIC.test(s)
      ? tryRules(s, AR, OPENER_AR)
      : (tryRules(s, EN, OPENER_EN) ?? tryRules(s, FR, OPENER_FR))
    if (hit) return hit
  }
  return null
}

// --- near-duplicate check -------------------------------------------------

export const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ًͯ-ْ]/g, '') // Latin accents, Arabic harakat
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

const words = (s: string): Set<string> => new Set(normalize(s).split(' ').filter(Boolean))

/** Same rule, case and punctuation aside, or one holds the other, or 80% of words shared. */
export const isNearDuplicate = (a: string, b: string): boolean => {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return false
  if (na === nb || na.includes(nb) || nb.includes(na)) return true
  const wa = words(a)
  const wb = words(b)
  let both = 0
  for (const w of wa) if (wb.has(w)) both += 1
  const all = wa.size + wb.size - both
  return all > 0 && both / all >= 0.8
}

export const hasDuplicate = (rule: string, existing: readonly string[]): boolean =>
  existing.some(one => isNearDuplicate(rule, one))

// --- the CLAUDE.md section --------------------------------------------------

export const HEADING = '## Preferences (memory mod)'

const isHeading = (line: string): boolean => /^#{1,2}\s/.test(line)

/** The rules listed under the mod's heading, one `- ` line each. */
export const rulesIn = (md: string): string[] => {
  const lines = md.split('\n')
  const at = lines.findIndex(l => l.trim() === HEADING)
  if (at < 0) return []
  const out: string[] = []
  for (const line of lines.slice(at + 1)) {
    if (isHeading(line)) break
    const m = line.match(/^\s*[-*]\s+(.+?)\s*$/)
    if (m?.[1]) out.push(m[1])
  }
  return out
}

/** The file's text with `rule` appended under the heading (made when missing). */
export const withRule = (md: string, rule: string): string => {
  const line = `- ${rule}`
  const lines = md.split('\n')
  const at = lines.findIndex(l => l.trim() === HEADING)
  if (at < 0) {
    const base = md.replace(/\s+$/, '')
    return `${base ? `${base}\n\n` : ''}${HEADING}\n\n${line}\n`
  }
  let end = lines.length
  for (let i = at + 1; i < lines.length; i += 1) {
    if (isHeading(lines[i] ?? '')) {
      end = i
      break
    }
  }
  // Insert after the section's last non-blank line.
  let last = end - 1
  while (last > at && !(lines[last] ?? '').trim()) last -= 1
  const head = lines.slice(0, last + 1)
  const tail = lines.slice(last + 1)
  if (last === at) head.push('')
  const out = [...head, line, ...tail].join('\n')
  return out.endsWith('\n') ? out : `${out}\n`
}

/** The file's text with the first `- rule` line under the heading removed. */
export const withoutRule = (md: string, rule: string): string => {
  const lines = md.split('\n')
  const at = lines.findIndex(l => l.trim() === HEADING)
  if (at < 0) return md
  for (let i = at + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    if (isHeading(line)) break
    const m = line.match(/^\s*[-*]\s+(.+?)\s*$/)
    if (m?.[1] === rule) {
      lines.splice(i, 1)
      return lines.join('\n')
    }
  }
  return md
}
