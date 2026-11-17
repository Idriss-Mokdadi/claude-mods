// UI text in English, French and Arabic (right to left). The mode tags and the
// EN / FR / AR buttons stay as the owner types them.

import type { ShortcutId } from './lib'

export type Lang = 'en' | 'fr' | 'ar'

type Shortcuts = Record<ShortcutId, string>

const en = {
  modes: 'Modes',
  more: 'More',
  glossary: 'Glossary',
  modesPane: 'Modes',
  replyIn: 'Reply language',
  shortcuts: 'Mods',
  stickyOn: 'Sticky: {tags} (added to every prompt, ~3 tokens each)',
  stickyOff: 'Sticky mode is off: a button puts its tag in the prompt box.',
  clear: 'Clear',
  stickySet: 'Sticky: {tags} goes in front of every prompt until cleared (~3 tokens each).',
  stickyCleared: 'Sticky tags cleared.',
  copied: 'Copied "{text}": paste it at the start of your prompt.',
  notCopied: 'Type "{text}" at the start of your prompt.',
  search: 'Search',
  searchHint: 'term, French, Arabic…',
  az: 'A–Z',
  seen: 'Order seen',
  copyAll: 'Copy all',
  copiedAll: 'Copied {n} terms as Markdown.',
  copyFailed: 'Could not copy: the surface has no clipboard.',
  noTerms: 'No terms yet. Ask in STUDY mode: terms like **Term** (FR: … | AR: …) — … show here.',
  noHits: 'No term matches "{q}".',
  count: '{n} terms',
  colEn: 'English',
  colFr: 'French',
  colAr: 'Arabic',
  colNote: 'Explanation',
  failed: '/{cmd} failed: {why}',
  cmdModes: 'Show or hide the launcher: answer modes, reply language and your mod shortcuts',
  cmdGlossary: 'Show or hide the glossary of terms from this chat (English, French, Arabic)',
  shortcut: {
    usage: 'Usage', handoff: 'Handoff', files: 'Files', crew: 'Crew', memory: 'Memory', tasks: 'Tasks', undo: 'Undo', theme: 'Theme',
  } as Shortcuts,
}

export type Strings = typeof en

const fr: Strings = {
  modes: 'Modes',
  more: 'Plus',
  glossary: 'Glossaire',
  modesPane: 'Modes',
  replyIn: 'Langue de réponse',
  shortcuts: 'Mods',
  stickyOn: 'Fixe : {tags} (ajouté à chaque prompt, ~3 tokens)',
  stickyOff: 'Mode fixe désactivé : un bouton met son tag dans la zone de prompt.',
  clear: 'Effacer',
  stickySet: 'Fixe : {tags} ajouté devant chaque prompt jusqu’à effacement (~3 tokens chacun).',
  stickyCleared: 'Tags fixes effacés.',
  copied: '« {text} » copié : collez-le au début du prompt.',
  notCopied: 'Tapez « {text} » au début du prompt.',
  search: 'Rechercher',
  searchHint: 'terme, français, arabe…',
  az: 'A–Z',
  seen: 'Ordre vu',
  copyAll: 'Tout copier',
  copiedAll: '{n} termes copiés en Markdown.',
  copyFailed: 'Copie impossible : pas de presse-papiers ici.',
  noTerms: 'Aucun terme. Demandez en mode STUDY : les termes **Terme** (FR: … | AR: …) — … s’affichent ici.',
  noHits: 'Aucun terme pour « {q} ».',
  count: '{n} termes',
  colEn: 'Anglais',
  colFr: 'Français',
  colAr: 'Arabe',
  colNote: 'Explication',
  failed: '/{cmd} a échoué : {why}',
  cmdModes: 'Afficher ou masquer le lanceur : modes, langue de réponse et raccourcis des mods',
  cmdGlossary: 'Afficher ou masquer le glossaire des termes de cette conversation',
  shortcut: {
    usage: 'Usage', handoff: 'Relais', files: 'Fichiers', crew: 'Équipe', memory: 'Mémoire', tasks: 'Tâches', undo: 'Annuler', theme: 'Thème',
  },
}

const ar: Strings = {
  modes: 'الأوضاع',
  more: 'المزيد',
  glossary: 'المسرد',
  modesPane: 'الأوضاع',
  replyIn: 'لغة الرد',
  shortcuts: 'الإضافات',
  stickyOn: 'ثابت: {tags} (يضاف إلى كل رسالة، ~3 رموز)',
  stickyOff: 'الوضع الثابت متوقف: الزر يضع وسمه في خانة الكتابة.',
  clear: 'مسح',
  stickySet: 'ثابت: {tags} يضاف أمام كل رسالة حتى المسح (~3 رموز لكل رسالة).',
  stickyCleared: 'تم مسح الوسوم الثابتة.',
  copied: 'تم نسخ "{text}": ألصقه في بداية رسالتك.',
  notCopied: 'اكتب "{text}" في بداية رسالتك.',
  search: 'بحث',
  searchHint: 'مصطلح، فرنسي، عربي…',
  az: 'أ–ي',
  seen: 'حسب الظهور',
  copyAll: 'نسخ الكل',
  copiedAll: 'تم نسخ {n} مصطلحات بصيغة Markdown.',
  copyFailed: 'تعذر النسخ: لا توجد حافظة هنا.',
  noTerms: 'لا توجد مصطلحات بعد. اسأل بوضع STUDY: تظهر هنا المصطلحات **Term** (FR: … | AR: …) — …',
  noHits: 'لا يوجد مصطلح يطابق "{q}".',
  count: '{n} مصطلحات',
  colEn: 'الإنجليزية',
  colFr: 'الفرنسية',
  colAr: 'العربية',
  colNote: 'الشرح',
  failed: 'فشل /{cmd}: {why}',
  cmdModes: 'إظهار أو إخفاء المشغل: أوضاع الرد ولغة الرد واختصارات الإضافات',
  cmdGlossary: 'إظهار أو إخفاء مسرد مصطلحات هذه المحادثة',
  shortcut: {
    usage: 'الاستخدام', handoff: 'تسليم', files: 'الملفات', crew: 'الفريق', memory: 'الذاكرة', tasks: 'المهام', undo: 'تراجع', theme: 'المظهر',
  },
}

export const STRINGS: Record<Lang, Strings> = { en, fr, ar }

export const fill = (s: string, vars: Record<string, string | number>): string =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))

export const langOf = (v: unknown): Lang | null => {
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase()
  if (/^(ar|arabic|عربي|العربية)/.test(s)) return 'ar'
  if (/^(fr|french|français|francais)/.test(s)) return 'fr'
  if (/^(en|english)/.test(s)) return 'en'
  return null
}
