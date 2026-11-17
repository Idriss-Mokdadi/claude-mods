// UI text in English, French and Arabic (right to left).

import type { TaskState, Verb } from '../types'

export type Lang = 'en' | 'fr' | 'ar'

type Words = {
  tasks: string
  tasksBtn: string
  count: string
  allDone: string
  noTasks: string
  timeline: string
  subagents: string
  estimate: string
  tools: string
  tokens: string
  total: string
  lastError: string
  waitingOn: string
  opened: string
  closed: string
  idle: string
  state: Record<TaskState, string>
  verb: Record<Verb, string>
}

const en: Words = {
  tasks: 'Tasks',
  tasksBtn: 'Tasks',
  count: '{done}/{total} tasks · {pct}%',
  allDone: 'All {total} tasks done',
  noTasks: 'No task list yet. It shows up when Claude plans its work.',
  timeline: 'Timeline',
  subagents: 'Subagent tasks',
  estimate: 'estimate',
  tools: '{n} tool calls',
  tokens: '≈{n} tokens',
  total: 'Total',
  lastError: 'last error',
  waitingOn: 'waiting on {ids}',
  opened: 'Tasks pane opened.',
  closed: 'Tasks pane closed.',
  idle: 'Waiting for the next step',
  state: { pending: 'pending', in_progress: 'in progress', completed: 'done', failed: 'failed', blocked: 'blocked' },
  verb: {
    read: 'Reading {t}',
    edit: 'Editing {t}',
    write: 'Writing {t}',
    run: 'Running {t}',
    search: 'Searching for {t}',
    find: 'Finding files {t}',
    web: 'Searching the web',
    fetch: 'Fetching {t}',
    agent: 'Starting a subagent: {t}',
    mcp: 'Using {t}',
    plan: 'Updating the task list',
    other: 'Using {t}',
  },
}

const fr: Words = {
  tasks: 'Tâches',
  tasksBtn: 'Tâches',
  count: '{done}/{total} tâches · {pct} %',
  allDone: 'Les {total} tâches sont faites',
  noTasks: 'Pas encore de liste de tâches. Elle apparaît quand Claude planifie son travail.',
  timeline: 'Chronologie',
  subagents: 'Tâches des sous-agents',
  estimate: 'estimation',
  tools: '{n} appels d’outils',
  tokens: '≈{n} jetons',
  total: 'Total',
  lastError: 'dernière erreur',
  waitingOn: 'attend {ids}',
  opened: 'Volet Tâches ouvert.',
  closed: 'Volet Tâches fermé.',
  idle: 'En attente de la prochaine étape',
  state: { pending: 'en attente', in_progress: 'en cours', completed: 'fait', failed: 'échec', blocked: 'bloqué' },
  verb: {
    read: 'Lecture de {t}',
    edit: 'Modification de {t}',
    write: 'Écriture de {t}',
    run: 'Exécution de {t}',
    search: 'Recherche de {t}',
    find: 'Recherche de fichiers {t}',
    web: 'Recherche sur le web',
    fetch: 'Téléchargement de {t}',
    agent: 'Lancement d’un sous-agent : {t}',
    mcp: 'Utilisation de {t}',
    plan: 'Mise à jour des tâches',
    other: 'Utilisation de {t}',
  },
}

const ar: Words = {
  tasks: 'المهام',
  tasksBtn: 'المهام',
  count: '{done}/{total} مهام · {pct}٪',
  allDone: 'اكتملت المهام الـ {total}',
  noTasks: 'لا توجد قائمة مهام بعد. تظهر عندما يخطط Claude لعمله.',
  timeline: 'الجدول الزمني',
  subagents: 'مهام الوكلاء الفرعيين',
  estimate: 'تقدير',
  tools: '{n} استدعاءات أدوات',
  tokens: '≈{n} رموز',
  total: 'المجموع',
  lastError: 'آخر خطأ',
  waitingOn: 'ينتظر {ids}',
  opened: 'فُتحت لوحة المهام.',
  closed: 'أُغلقت لوحة المهام.',
  idle: 'في انتظار الخطوة التالية',
  state: { pending: 'قيد الانتظار', in_progress: 'قيد التنفيذ', completed: 'تمّت', failed: 'فشلت', blocked: 'محجوبة' },
  verb: {
    read: 'قراءة {t}',
    edit: 'تعديل {t}',
    write: 'كتابة {t}',
    run: 'تشغيل {t}',
    search: 'البحث عن {t}',
    find: 'إيجاد ملفات {t}',
    web: 'البحث في الويب',
    fetch: 'جلب {t}',
    agent: 'تشغيل وكيل فرعي: {t}',
    mcp: 'استخدام {t}',
    plan: 'تحديث قائمة المهام',
    other: 'استخدام {t}',
  },
}

export const STRINGS: Record<Lang, Words> = { en, fr, ar }

export const fill = (s: string, vars: Record<string, string | number>): string =>
  s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))

export const langOf = (v: unknown): Lang | null => {
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase()
  if (s === 'en' || s.startsWith('en_') || s.startsWith('en-') || s === 'english') return 'en'
  if (s === 'fr' || s.startsWith('fr_') || s.startsWith('fr-') || s === 'french' || s === 'français') return 'fr'
  if (s === 'ar' || s.startsWith('ar_') || s.startsWith('ar-') || s === 'arabic' || s === 'العربية') return 'ar'
  return null
}
