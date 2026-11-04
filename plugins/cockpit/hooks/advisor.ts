// The model and effort advisor: a scored classifier over the prompt's words,
// zero tokens. Signals in English, French and Arabic add or remove points; an
// intensifier ("too", "very", "trop", "جدا") just before a signal adds more; the
// score maps to one of six tiers. A short follow-up ("yes", "continue") keeps the
// tier of the task it follows for a few prompts.

import type { EffortPick, ModelPick } from '../types'

export type Tier = { model: ModelPick; effort: EffortPick }

export const TIERS: readonly Tier[] = [
  { model: 'haiku', effort: 'low' },
  { model: 'sonnet', effort: 'low' },
  { model: 'sonnet', effort: 'medium' },
  { model: 'sonnet', effort: 'high' },
  { model: 'opus', effort: 'high' },
  { model: 'opus', effort: 'xhigh' },
]

export type SignalId =
  | 'deep'
  | 'complex'
  | 'scope_app'
  | 'scope_project'
  | 'scope_codebase'
  | 'scope_arch'
  | 'scope_files'
  | 'scope_large'
  | 'scope_whole'
  | 'workload'
  | 'bugs'
  | 'trace'
  | 'analysis'
  | 'design'
  | 'perf'
  | 'build'
  | 'edit'
  | 'code'
  | 'paste'
  | 'long'
  | 'very_long'
  | 'intense'
  | 'quick'
  | 'greeting'
  | 'simple_q'
  | 'small_edit'
  | 'follow'
  | 'ai'

type Signal = { id: SignalId; weight: number; patterns: readonly RegExp[] }

// A word start (Latin scripts): not preceded by a letter or digit. Stems match
// inflections (bug, bugs; analyse, analysing, analysis, analyzing).
const W = (alt: string, end = false): RegExp => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alt})${end ? '(?![\\p{L}\\p{N}_])' : ''}`, 'iu')
// Arabic: words take attached prefixes (ال، و، ب، ل), so a plain substring.
const A = (alt: string): RegExp => new RegExp(`(?:${alt})`, 'u')

const SIGNALS: readonly Signal[] = [
  { id: 'deep', weight: 6, patterns: [W('think (?:deeply|hard|carefully|really hard)|ultrathink|in[- ]depth|thorough(?:ly)?|deep[- ]?dive|step[- ]by[- ]step reasoning'), W('réfléchis (?:bien|profondément|en profondeur)|analyse approfondie|en profondeur'), A('فكر بعمق|تفكير عميق|بعمق|بشكل معمق')] },
  { id: 'complex', weight: 4, patterns: [W('complex|complicat|difficult|hard(?:er|est)?(?![\\p{L}])|tricky|advanced|sophisticat|challenging|non[- ]trivial'), W('complexe|compliqu|difficile|avancé|poussé|délicat'), A('معقد|صعب|متقدم|معقدة|صعبة')] },
  { id: 'scope_app', weight: 2, patterns: [W('apps?(?![\\p{L}.])|applications?'), A('تطبيق')] },
  { id: 'scope_project', weight: 2, patterns: [W('projects?|projets?'), A('مشروع')] },
  { id: 'scope_codebase', weight: 2, patterns: [W('codebase|code base|repo(?:s|sitor(?:y|ies))?(?![\\p{L}])|monorepo|code source'), A('المستودع|قاعدة الكود')] },
  { id: 'scope_arch', weight: 2, patterns: [W('architect|system design|systèmes?|system(?:s)?(?![\\p{L}])|infrastructure'), A('بنية|معمارية|نظام')] },
  { id: 'scope_files', weight: 2, patterns: [W('(?:multiple|many|several|all the|plusieurs|tous les) (?:files|modules|services|fichiers)'), A('عدة ملفات|ملفات كثيرة')] },
  { id: 'scope_large', weight: 2, patterns: [W('large|big|huge|massive|grand|énorme|volumineu'), A('كبير|ضخم')] },
  { id: 'scope_whole', weight: 2, patterns: [W('whole|entire|end[- ]to[- ]end|tout le|toute l|l\'ensemble'), A('كامل|بالكامل')] },
  { id: 'workload', weight: 2, patterns: [W('a lot of|lots of|many|several|numerous|every|tons of|a bunch of|beaucoup de|plein de|plusieurs|nombreu'), A('الكثير من|كثير من|كثيرة|عدة|جميع')] },
  { id: 'bugs', weight: 2, patterns: [W('bugs?(?![\\p{L}])|buggy|debug|errors?(?![\\p{L}])|crash|exceptions?|fails?(?![\\p{L}])|failing|broken|flaky|regression|fix(?:es|ing)?(?![\\p{L}])|bogue|erreur|plant|débogu|corrig'), A('خطأ|أخطاء|اخطاء|مشكلة|مشاكل|عطل|تصحيح')] },
  { id: 'trace', weight: 3, patterns: [/(?:^|\n)\s*(?:at\s+\S+|File ".+", line \d+|Traceback \(most recent call last\)|Exception in thread|\s{2,}at )/] },
  { id: 'analysis', weight: 2, patterns: [W('analy[sz]|review|audit|investigat|assess|evaluat|diagnos|examin|évalu|analys'), A('تحليل|مراجعة|تدقيق|فحص')] },
  { id: 'design', weight: 3, patterns: [W('refactor|migrat|redesign|re-architect|design|restructur|conce(?:voir|ption)|refonte'), A('تصميم|إعادة هيكلة|ترحيل')] },
  { id: 'perf', weight: 2, patterns: [W('security|vulnerab|performance|optimi[sz]|concurren|race condition|deadlock|memory leak|scal(?:e|ing|ability)|sécurité|concurrence'), A('أمان|الأمن|أداء|الأداء|تحسين')] },
  { id: 'edit', weight: 1, patterns: [W('rename|change|update|edit|replace|move|delete|remove|tweak|adjust|modifie|remplace|renomme|supprime|déplace'), A('عدل|غير|احذف|استبدل')] },
  { id: 'build', weight: 1, patterns: [W('implement|build|create|write|develop|add(?![\\p{L}])|make (?:a|an)|implémente|crée|créer|construi|développ|écri'), A('اكتب|أنشئ|ابن|برمج|طور|أضف')] },
  { id: 'code', weight: 1, patterns: [W('cod(?:e|es|ing)(?![\\p{L}])|coder|programm|function|fonction|class(?:es)?(?![\\p{L}])|script|api(?![\\p{L}])|endpoint|python|kotlin|java(?:script)?|typescript|rust|c\\+\\+|sql|regex|\\.(?:py|ts|tsx|js|kt|java|c|cpp|rs|go)(?![\\p{L}])'), A('كود|برمجة|دالة|الكود')] },
  { id: 'intense', weight: 0, patterns: [] },
  { id: 'quick', weight: -8, patterns: [/^\s*(?:short|quick|brief|tl;?dr|court|rapide|bref|vite|باختصار|بسرعة|سؤال سريع)(?![\p{L}])/iu] },
  { id: 'greeting', weight: -8, patterns: [/^\s*(?:hi|hello|hey|yo|thanks(?: a lot| so much)?|thank you(?: so much| very much)?|thx|good (?:morning|evening)|bonjour|salut|merci(?: beaucoup| bien)?|coucou|مرحبا|السلام عليكم|شكرا(?: جزيلا)?|اهلا|أهلا)[\s!.?,]*$/iu] },
  { id: 'simple_q', weight: -2, patterns: [W('what is|what\'s|who is|who was|when (?:is|was|did)|where is|define|definition of|translate|meaning of|how do you say|qu\'est-ce que|c\'est quoi|traduis|définis|que veut dire'), A('ما هو|ما هي|ترجم|عرف|معنى|من هو')] },
  { id: 'small_edit', weight: -2, patterns: [W('typo|rename|tiny|small|simple|minor|one[- ]line|single line|a comment|spelling|faute de frappe|coquille|renomme|petit|petite|simple'), A('خطأ إملائي|صغير|بسيط')] },
]

const INTENSIFIER_BEFORE = /(?:^|[\s,])(?:too|very|really|extremely|so|super|highly|incredibly|quite|insanely|trop|très|vraiment|extrêmement|hyper|vachement)\s+(?:\p{L}+\s+)?$/iu
const INTENSIFIER_AFTER = /^\s*(?:جدا|جداً|للغاية|كثيرا|كثيراً)/u

export const FOLLOW_UP = /^\s*(?:yes|yep|yeah|ok(?:ay)?|sure|go(?: on| ahead)?|do it|continue|next|proceed|keep going|carry on|please do|and then|then\??|oui|vas-y|continue|suivant|d'accord|ok vas-y|نعم|تابع|حسنا|حسناً|أكمل|استمر|التالي)(?![\p{L}])[\s\S]{0,40}$/iu

// The wrappers a host puts around a prompt are not the person's words.
const WRAPPERS = /<(system-reminder|ide_[a-z_]+|command-[a-z-]+|local-command-[a-z-]+|user-prompt-submit-hook|attachment)[^>]*>[\s\S]*?<\/\1>/gi
export const cleanPrompt = (text: string): string => text.replace(WRAPPERS, ' ').trim()

export type Scored = {
  score: number
  tier: number
  // Signals that counted, strongest first.
  why: SignalId[]
}

const looksLikeCode = (t: string): boolean => /```/.test(t) || (t.split('\n').filter(l => /[{};=()<>]|^\s{2,}\S/.test(l)).length >= 6)

export function scorePrompt(text: string): Scored {
  const t = cleanPrompt(text)
  const hits = new Map<SignalId, number>()
  let bonus = 0
  for (const s of SIGNALS) {
    for (const re of s.patterns) {
      const m = re.exec(t)
      if (!m) continue
      hits.set(s.id, s.weight)
      // An intensifier just before (or, in Arabic, just after) a positive signal.
      const before = t.slice(Math.max(0, m.index - 24), m.index)
      const after = t.slice(m.index + m[0].length, m.index + m[0].length + 12)
      if (s.weight > 0 && (INTENSIFIER_BEFORE.test(before) || INTENSIFIER_AFTER.test(after))) bonus += 2
      break
    }
  }
  if (bonus) hits.set('intense', Math.min(4, bonus))
  // Size: pasted code, long text, very long documents.
  if (looksLikeCode(t)) hits.set('paste', 2)
  if (t.length > 1500) hits.set('long', 2)
  if (t.length > 6000 || t.split('\n').length > 150) hits.set('very_long', 5)
  // Workload only weighs when there is work: "a lot of" alone is no task.
  if (hits.has('workload') && ![...hits.keys()].some(k => k !== 'workload' && (hits.get(k) ?? 0) > 0)) hits.delete('workload')
  // Several scope words count as two at most.
  const scopes = [...hits.keys()].filter(k => k.startsWith('scope_'))
  for (const k of scopes.slice(2)) hits.delete(k)

  const score = [...hits.values()].reduce((a, b) => a + b, 0)
  const isDeep = hits.has('deep')
  const tier =
    score <= -2 ? 0 : score <= 0 ? 1 : score <= 3 ? 2 : score <= 6 ? 3 : isDeep && score >= 10 ? 5 : 4
  // Reasons, strongest first: bugs that come in numbers rank as "many bugs"; the
  // intensifier only modifies, so it is not a reason of its own.
  const rank = (k: SignalId, w: number): number => Math.abs(w) + (k === 'bugs' && hits.has('workload') ? 1.5 : 0)
  const why = [...hits.entries()]
    .filter(([k, w]) => w !== 0 && k !== 'intense')
    .sort((a, b) => rank(b[0], b[1]) - rank(a[0], a[1]))
    .map(([k]) => k)
  return { score, tier, why }
}

// Is the score in the middle band (sonnet·medium to opus·high), where a second
// opinion (the optional AI check) is worth its cost?
export const isAmbiguous = (s: Pick<Scored, 'score'>): boolean => s.score >= 3 && s.score <= 7

// ---------------------------------------------------------------------------
// Sticky task context.

export type Sticky = { tier: number; left: number; why: SignalId[] }

export const STICKY_PROMPTS = 5

export type Advised = Scored & { sticky: Sticky | null; isFollowUp: boolean }

export function adviseInContext(text: string, prev: Sticky | null): Advised {
  const s = scorePrompt(text)
  const t = cleanPrompt(text)
  const isFollowUp = FOLLOW_UP.test(t) && t.split(/\s+/).length <= 8 && s.tier <= 2
  if (isFollowUp && prev && prev.left > 0 && prev.tier > s.tier) {
    const sticky = { ...prev, left: prev.left - 1 }
    return { score: s.score, tier: prev.tier, why: ['follow', ...prev.why], sticky, isFollowUp }
  }
  if (isFollowUp && prev && prev.left > 0) return { ...s, sticky: { ...prev, left: prev.left - 1 }, isFollowUp }
  // A real task (sonnet·medium or more) starts a new context; a clearly small
  // new task ends the old one.
  const sticky = s.tier >= 2 ? { tier: s.tier, left: STICKY_PROMPTS, why: s.why.slice(0, 3) } : null
  return { ...s, sticky, isFollowUp }
}

// ---------------------------------------------------------------------------
// The "why" words, localised.

export const WHY: Record<SignalId, { en: string; fr: string; ar: string }> = {
  deep: { en: 'deep thinking asked', fr: 'réflexion approfondie', ar: 'تفكير عميق' },
  complex: { en: 'complex', fr: 'complexe', ar: 'معقد' },
  scope_app: { en: 'whole app', fr: 'application entière', ar: 'تطبيق كامل' },
  scope_project: { en: 'whole project', fr: 'projet entier', ar: 'مشروع كامل' },
  scope_codebase: { en: 'codebase', fr: 'base de code', ar: 'قاعدة الكود' },
  scope_arch: { en: 'architecture', fr: 'architecture', ar: 'بنية' },
  scope_files: { en: 'many files', fr: 'plusieurs fichiers', ar: 'عدة ملفات' },
  scope_large: { en: 'large', fr: 'grande taille', ar: 'كبير' },
  scope_whole: { en: 'whole thing', fr: 'ensemble', ar: 'بالكامل' },
  workload: { en: 'a lot of work', fr: 'beaucoup de travail', ar: 'عمل كثير' },
  bugs: { en: 'bugs', fr: 'bogues', ar: 'أخطاء' },
  trace: { en: 'stack trace', fr: 'trace d’erreur', ar: 'تتبع خطأ' },
  analysis: { en: 'analysis', fr: 'analyse', ar: 'تحليل' },
  design: { en: 'design or refactor', fr: 'conception', ar: 'تصميم' },
  perf: { en: 'security or performance', fr: 'sécurité ou performance', ar: 'أمان أو أداء' },
  build: { en: 'building', fr: 'développement', ar: 'بناء' },
  edit: { en: 'edit', fr: 'modification', ar: 'تعديل' },
  code: { en: 'code', fr: 'code', ar: 'كود' },
  paste: { en: 'pasted code', fr: 'code collé', ar: 'كود ملصق' },
  long: { en: 'long text', fr: 'texte long', ar: 'نص طويل' },
  very_long: { en: 'long document', fr: 'long document', ar: 'مستند طويل' },
  intense: { en: 'intensified', fr: 'intensifié', ar: 'مشدد' },
  quick: { en: 'asked short', fr: 'réponse courte', ar: 'مختصر' },
  greeting: { en: 'greeting', fr: 'salutation', ar: 'تحية' },
  simple_q: { en: 'simple question', fr: 'question simple', ar: 'سؤال بسيط' },
  small_edit: { en: 'small edit', fr: 'petite retouche', ar: 'تعديل صغير' },
  follow: { en: 'follow-up of the task', fr: 'suite de la tâche', ar: 'متابعة للمهمة' },
  ai: { en: 'AI check', fr: 'vérifié par IA', ar: 'فحص بالذكاء الاصطناعي' },
}

// The top three reasons, in the UI language. "many bugs" when there are bugs and
// a lot of them.
export function whyText(why: readonly string[], lang: 'en' | 'fr' | 'ar'): string {
  const isMany = why.includes('bugs') && why.includes('workload')
  const many = { en: 'many bugs', fr: 'nombreux bogues', ar: 'أخطاء كثيرة' }[lang]
  return why
    .filter(id => !(isMany && id === 'workload'))
    .slice(0, 3)
    .map(id => (isMany && id === 'bugs' ? many : (WHY[id as SignalId]?.[lang] ?? id)))
    .join(' · ')
}

// The prompt for the optional AI check: one label, nothing else.
export const AI_PROMPT = (text: string): string =>
  `Classify how much model power this request to a coding assistant needs. Answer with exactly one label and nothing else:
haiku-low (greeting, tiny factual question), sonnet-low (trivial edit), sonnet-medium (normal coding or writing task), sonnet-high (sizeable task), opus-high (complex, multi-step, large scope, many bugs), opus-xhigh (asks for very deep reasoning on a hard problem).

Request:
"""
${cleanPrompt(text).slice(0, 4000)}
"""`

export const tierFromLabel = (label: string): number | null => {
  const m = /(haiku|sonnet|opus)[-\s·]*(low|medium|high|xhigh)/i.exec(label)
  if (!m) return null
  const i = TIERS.findIndex(t => t.model === (m[1] ?? '').toLowerCase() && t.effort === (m[2] ?? '').toLowerCase())
  return i < 0 ? null : i
}
