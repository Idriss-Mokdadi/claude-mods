import type { Mood } from '../types'

export type Lang = 'en' | 'fr' | 'ar'

export type Strings = {
  mood: Record<Mood, string>
  limit: string
  doneAfter: string
  waitingYou: string
  question: string
  themeOn: string
  themeOff: string
  themeNotDrawn: string
  themeUsage: string
  soundOn: string
  soundOff: string
  themeButton: string
  soundButton: string
}

export const STRINGS: Record<Lang, Strings> = {
  en: {
    mood: {
      ready: 'ready',
      working: 'working',
      reading: 'reading',
      editing: 'editing',
      running: 'running',
      waiting: 'waiting for you',
      error: 'error',
      done: 'done',
      sleeping: 'sleeping',
      dance: 'party!',
    },
    limit: 'limit {n}%',
    doneAfter: 'Claude is done ({t})',
    waitingYou: 'Claude is waiting for you',
    question: 'Claude has a question for you',
    themeOn: 'Lagoon on',
    themeOff: 'Lagoon off',
    themeNotDrawn: 'Lagoon on, not drawn here: {why}',
    themeUsage: 'Usage: /theme on | off | toggle',
    soundOn: 'Sound on',
    soundOff: 'Sound off',
    themeButton: 'Lagoon',
    soundButton: 'Sound',
  },
  fr: {
    mood: {
      ready: 'prêt',
      working: 'au travail',
      reading: 'lecture',
      editing: 'édition',
      running: 'exécution',
      waiting: 'vous attend',
      error: 'erreur',
      done: 'terminé',
      sleeping: 'endormi',
      dance: 'fête !',
    },
    limit: 'limite {n} %',
    doneAfter: 'Claude a terminé ({t})',
    waitingYou: 'Claude vous attend',
    question: 'Claude a une question pour vous',
    themeOn: 'Lagon activé',
    themeOff: 'Lagon désactivé',
    themeNotDrawn: 'Lagon activé, non affiché ici : {why}',
    themeUsage: 'Usage : /theme on | off | toggle',
    soundOn: 'Son activé',
    soundOff: 'Son coupé',
    themeButton: 'Lagon',
    soundButton: 'Son',
  },
  ar: {
    mood: {
      ready: 'جاهز',
      working: 'يعمل',
      reading: 'يقرأ',
      editing: 'يحرّر',
      running: 'ينفّذ',
      waiting: 'ينتظرك',
      error: 'خطأ',
      done: 'انتهى',
      sleeping: 'نائم',
      dance: 'احتفال!',
    },
    limit: 'الحد {n}%',
    doneAfter: 'انتهى Claude ({t})',
    waitingYou: 'Claude ينتظرك',
    question: 'لدى Claude سؤال لك',
    themeOn: 'البحيرة مفعّلة',
    themeOff: 'البحيرة متوقفة',
    themeNotDrawn: 'البحيرة مفعّلة، لكنها لا تُرسم هنا: {why}',
    themeUsage: 'الاستخدام: /theme on | off | toggle',
    soundOn: 'الصوت مفعّل',
    soundOff: 'الصوت متوقف',
    themeButton: 'البحيرة',
    soundButton: 'الصوت',
  },
}

export const langOf = (v: unknown): Lang | null => {
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase()
  if (s === 'auto' || s === '') return null
  if (s.startsWith('fr') || s.startsWith('fran')) return 'fr'
  if (s.startsWith('ar') || s.startsWith('arab') || s === 'العربية') return 'ar'
  if (s.startsWith('en') || s.startsWith('engl')) return 'en'
  return null
}

export const fill = (s: string, vars: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
