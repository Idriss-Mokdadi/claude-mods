import { expect, test } from 'claude-code/testing'

import { TIERS, adviseInContext, isAmbiguous, scorePrompt, tierFromLabel, whyText } from '../hooks/advisor'

// Tier names: 0 haiku·low, 1 sonnet·low, 2 sonnet·medium, 3 sonnet·high, 4 opus·high, 5 opus·xhigh.
const H_LOW = 0
const S_LOW = 1
const S_MED = 2
const S_HIGH = 3
const O_HIGH = 4
const O_XHIGH = 5

const LONG_DOC = 'The report covers the deployment of the network functions. '.repeat(140)
const TRACE = 'why does this fail?\nTraceback (most recent call last):\n  File "app.py", line 12, in <module>\n    main()\n  File "app.py", line 8, in main\n    run()\nValueError: bad'
const CODE = 'refactor this:\n```ts\nfunction a(x) {\n  if (x) {\n    return b(x);\n  }\n  return c();\n}\n```'

// [prompt, accepted tiers]
export const TABLE: readonly (readonly [string, readonly number[]])[] = [
  // The owner's two prompts.
  ['i have a too complex coding task that i need help in', [O_HIGH]],
  ['i have a too complex app that needs a lot of analysing and a lot of coding knowledge and that has a lot of bugs so help me in it', [O_HIGH]],
  // The examples given with the request.
  ['hi', [H_LOW]],
  ['fix this typo', [S_LOW]],
  ['write a python function that sorts a list', [S_MED]],
  ['think deeply about the architecture of my 5G core app', [O_HIGH, O_XHIGH]],
  // English.
  ['thanks!', [H_LOW]],
  ['short: what is OFDM?', [H_LOW]],
  ['quick question, what does HTTP 429 mean', [H_LOW]],
  ['what is the default MTU of Ethernet?', [H_LOW]],
  ['translate "good morning" to Spanish', [H_LOW]],
  ['rename the variable x to count', [S_LOW]],
  ['Fix the bug in parser.py where empty lines crash the import', [S_MED]],
  ['write a polite email to my professor asking to move the exam meeting to Thursday', [S_MED]],
  ['add a dark mode toggle to the settings screen', [S_MED]],
  ['debug why the login API returns 500 errors for some users and review the auth code', [S_HIGH, O_HIGH]],
  ['refactor the whole codebase to use dependency injection and migrate the tests', [O_HIGH]],
  ['do a security audit of my entire project, it has many endpoints', [O_HIGH]],
  ['this is a really hard concurrency bug with a race condition in the scheduler', [O_HIGH]],
  ['ultrathink: design the architecture of a distributed rate limiter for a large system', [O_XHIGH]],
  [TRACE, [S_HIGH, O_HIGH]],
  [CODE, [S_MED, S_HIGH]],
  [LONG_DOC, [O_HIGH]],
  // French.
  ['salut', [H_LOW]],
  ['merci beaucoup', [H_LOW]],
  ["c'est quoi un PDU session ?", [H_LOW]],
  ['corrige la faute de frappe dans le titre', [S_LOW]],
  ['écris une fonction python qui trie une liste', [S_MED]],
  ["j'ai une application très complexe avec beaucoup de bugs, aide-moi à tout corriger", [O_HIGH]],
  ['réfléchis en profondeur à la conception de mon projet complexe de cœur 5G', [O_HIGH, O_XHIGH]],
  // Arabic.
  ['مرحبا', [H_LOW]],
  ['شكرا', [H_LOW]],
  ['ما هو بروتوكول HTTP؟', [H_LOW]],
  ['اكتب دالة بايثون لترتيب قائمة', [S_MED]],
  ['لدي تطبيق معقد جدا فيه الكثير من الأخطاء وأحتاج إلى تحليل الكود', [O_HIGH]],
  ['فكر بعمق في تصميم بنية مشروع معقد كبير', [O_HIGH, O_XHIGH]],
]

const name = (i: number): string => {
  const t = TIERS[i]
  return t ? `${t.model}·${t.effort}` : String(i)
}

test(`the advisor table: ${TABLE.length} prompts in English, French and Arabic`, () => {
  expect(TABLE.length).toBeGreaterThanOrEqual(30)
  const wrong: string[] = []
  for (const [prompt, ok] of TABLE) {
    const s = scorePrompt(prompt)
    if (!ok.includes(s.tier)) wrong.push(`${prompt.slice(0, 60)} → ${name(s.tier)} (score ${s.score}: ${s.why.join(', ')}), expected ${ok.map(name).join(' or ')}`)
  }
  expect(wrong).toEqual([])
})

test('sticky context: a short follow-up keeps the task tier, then decays', () => {
  let r = adviseInContext('i have a too complex app with a lot of bugs, help me', null)
  expect(r.tier).toBe(O_HIGH)
  for (const follow of ['yes', 'ok do it', 'continue', 'next', 'oui vas-y']) {
    r = adviseInContext(follow, r.sticky)
    expect(r.tier).toBe(O_HIGH)
    expect(r.why[0]).toBe('follow')
  }
  // Five follow-ups used the context up: the next one stands alone.
  r = adviseInContext('continue', r.sticky)
  expect(r.tier).toBeLessThan(O_HIGH)
})

test('sticky context: a clearly new small task ends it', () => {
  let r = adviseInContext('refactor the whole codebase and migrate the tests', null)
  expect(r.tier).toBe(O_HIGH)
  r = adviseInContext('what is the capital of Tunisia?', r.sticky)
  expect(r.tier).toBe(H_LOW)
  expect(r.sticky).toBe(null)
  r = adviseInContext('yes', r.sticky)
  expect(r.tier).toBeLessThan(S_MED)
})

test('why: the top three reasons, localised, "many bugs" when bugs come in numbers', () => {
  const s = scorePrompt('i have a too complex app that needs a lot of analysing and a lot of coding knowledge and that has a lot of bugs so help me in it')
  expect(whyText(s.why, 'en')).toMatch(/^complex · /)
  expect(whyText(s.why, 'en')).toContain('many bugs')
  expect(whyText(s.why, 'fr')).toMatch(/^complexe/)
  expect(whyText(scorePrompt('hi').why, 'ar')).toBe('تحية')
})

test('the AI check: only in the ambiguous middle, and its label parses', () => {
  expect(isAmbiguous(scorePrompt('hi'))).toBe(false)
  expect(isAmbiguous(scorePrompt('ultrathink: design the architecture of a distributed rate limiter for a large system'))).toBe(false)
  expect(tierFromLabel('opus-high')).toBe(O_HIGH)
  expect(tierFromLabel(' Sonnet-medium.')).toBe(S_MED)
  expect(tierFromLabel('no idea')).toBe(null)
})
