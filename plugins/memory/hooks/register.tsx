import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderSurface } from 'claude-code'

import type { Notice, PendingRemove, Proposal, Saved, Scope } from '../types'
import { HEADING, detect, hasDuplicate, rulesIn, tidy, withRule, withoutRule } from './detect'

// ---------------------------------------------------------------------------
// State. Values outlive a hot reload; the shape tags drop what an older
// version stored under another layout.

const pending = atom({ plugin: 'memory', key: 'pending' } as const, null, { shape: 'pending-1' })
const paused = atom({ plugin: 'memory', key: 'paused' } as const, false)
const saved = atom({ plugin: 'memory', key: 'saved' } as const, { project: [], user: [] }, { shape: 'saved-1' })
const removing = atom({ plugin: 'memory', key: 'removing' } as const, null, { shape: 'removing-1' })
const notice = atom({ plugin: 'memory', key: 'notice' } as const, null, { shape: 'notice-1' })
const skipped = atom({ plugin: 'memory', key: 'skipped' } as const, [], { shape: 'skipped-1' })
const isProposing = atom({ plugin: 'memory', key: 'isProposing' } as const, false)

const PANE = 'memory'
const CLAY = '#D97757'
const INK = '#1F1E1D'
const ACCENT = '#8f8cf4'
const MAX_SKIPPED = 50

// ---------------------------------------------------------------------------
// Language: the `language` option, else Claude Code's `language` setting, else
// the locale. Arabic draws right to left.

type Lang = 'en' | 'fr' | 'ar'

const STRINGS = {
  en: {
    ask: 'Save this rule?',
    project: 'Save to project',
    user: 'Save to user',
    edit: 'Edit',
    skip: 'Skip',
    keep: 'keep',
    cancel: 'Cancel',
    editLabel: 'Rule: ',
    editHint: 'Or type /memory-edit <new wording>.',
    warn: 'User level (~/.claude/CLAUDE.md) is lost when a cloud container ends. Project is the default.',
    savedTo: (where: string) => `Saved to ${where}.`,
    already: 'Already saved: nothing written.',
    failed: (why: string) => `Not saved: ${why}`,
    skippedNote: 'Skipped. Nothing written.',
    dismiss: 'OK',
    pane: 'Memory',
    projectRules: 'Project rules (CLAUDE.md)',
    userRules: 'User rules (~/.claude/CLAUDE.md)',
    none: 'None yet.',
    remove: 'Remove',
    confirmRemove: (t: string, where: string) => `Remove "${t}" from ${where}?`,
    yesRemove: 'Yes, remove',
    removed: 'Removed.',
    pause: 'Pause',
    resume: 'Resume',
    isPaused: 'Detection is paused.',
    isOn: 'Detection is on.',
    fromTurn: 'Propose from this turn',
    proposing: 'Asking Haiku...',
    noRule: 'No rule found in the last exchange.',
    noTurn: 'No exchange to read yet.',
    proposed: 'memory: a rule is waiting for your answer above the prompt (or /memory-list).',
    listOpened: 'Memory pane opened.',
    pausedText: 'memory: paused. Nothing will be proposed until /memory-resume.',
    resumedText: 'memory: resumed.',
    editUsage: 'Usage: /memory-edit <rule wording>. Nothing is saved until you press Save.',
    editSet: 'memory: wording updated. Press Save to write it.',
    pending: 'Waiting for your answer',
  },
  fr: {
    ask: 'Enregistrer cette règle ?',
    project: 'Projet',
    user: 'Utilisateur',
    edit: 'Modifier',
    skip: 'Ignorer',
    keep: 'garder',
    cancel: 'Annuler',
    editLabel: 'Règle : ',
    editHint: 'Ou tapez /memory-edit <nouvelle formulation>.',
    warn: "Le niveau utilisateur (~/.claude/CLAUDE.md) est perdu à la fin d'un conteneur cloud. Projet est le choix par défaut.",
    savedTo: (where: string) => `Enregistré dans ${where}.`,
    already: 'Déjà enregistré : rien écrit.',
    failed: (why: string) => `Non enregistré : ${why}`,
    skippedNote: 'Ignoré. Rien écrit.',
    dismiss: 'OK',
    pane: 'Mémoire',
    projectRules: 'Règles du projet (CLAUDE.md)',
    userRules: 'Règles utilisateur (~/.claude/CLAUDE.md)',
    none: 'Aucune pour le moment.',
    remove: 'Supprimer',
    confirmRemove: (t: string, where: string) => `Supprimer « ${t} » de ${where} ?`,
    yesRemove: 'Oui, supprimer',
    removed: 'Supprimé.',
    pause: 'Pause',
    resume: 'Reprendre',
    isPaused: 'La détection est en pause.',
    isOn: 'La détection est active.',
    fromTurn: 'Proposer depuis ce tour',
    proposing: 'Question à Haiku...',
    noRule: 'Aucune règle trouvée dans le dernier échange.',
    noTurn: "Pas encore d'échange à lire.",
    proposed: 'memory : une règle attend votre réponse au-dessus du prompt (ou /memory-list).',
    listOpened: 'Panneau mémoire ouvert.',
    pausedText: "memory : en pause. Rien ne sera proposé jusqu'à /memory-resume.",
    resumedText: 'memory : reprise.',
    editUsage: "Usage : /memory-edit <formulation>. Rien n'est enregistré avant d'appuyer sur Enregistrer.",
    editSet: 'memory : formulation modifiée. Appuyez sur Projet ou Utilisateur pour écrire.',
    pending: 'En attente de votre réponse',
  },
  ar: {
    ask: 'هل تحفظ هذه القاعدة؟',
    project: 'حفظ في المشروع',
    user: 'حفظ للمستخدم',
    edit: 'تعديل',
    skip: 'تخطي',
    keep: 'اعتماد',
    cancel: 'إلغاء',
    editLabel: 'القاعدة: ',
    editHint: 'أو اكتب /memory-edit <الصياغة الجديدة>.',
    warn: 'ملف المستخدم (~/.claude/CLAUDE.md) يضيع عند انتهاء الحاوية السحابية. المشروع هو الخيار الافتراضي.',
    savedTo: (where: string) => `حُفظت في ${where}.`,
    already: 'محفوظة من قبل: لم يُكتب شيء.',
    failed: (why: string) => `لم تُحفظ: ${why}`,
    skippedNote: 'تم التخطي. لم يُكتب شيء.',
    dismiss: 'حسنا',
    pane: 'الذاكرة',
    projectRules: 'قواعد المشروع (CLAUDE.md)',
    userRules: 'قواعد المستخدم (~/.claude/CLAUDE.md)',
    none: 'لا شيء بعد.',
    remove: 'حذف',
    confirmRemove: (t: string, where: string) => `حذف "${t}" من ${where}؟`,
    yesRemove: 'نعم، احذف',
    removed: 'حُذفت.',
    pause: 'إيقاف مؤقت',
    resume: 'استئناف',
    isPaused: 'الكشف متوقف مؤقتا.',
    isOn: 'الكشف يعمل.',
    fromTurn: 'اقترح من هذا الدور',
    proposing: 'جارٍ سؤال Haiku...',
    noRule: 'لم أجد قاعدة في التبادل الأخير.',
    noTurn: 'لا يوجد تبادل بعد.',
    proposed: 'memory: قاعدة تنتظر جوابك فوق خانة الكتابة (أو /memory-list).',
    listOpened: 'فُتحت لوحة الذاكرة.',
    pausedText: 'memory: متوقف مؤقتا حتى /memory-resume.',
    resumedText: 'memory: استؤنف.',
    editUsage: 'الاستعمال: /memory-edit <الصياغة>. لا يُحفظ شيء قبل الضغط على حفظ.',
    editSet: 'memory: تم تعديل الصياغة. اضغط حفظ للكتابة.',
    pending: 'بانتظار جوابك',
  },
} as const

let lang: Lang = 'en'
const tr = () => STRINGS[lang]
const isRtl = () => lang === 'ar'

const langOf = (v: unknown): Lang => {
  if (typeof v !== 'string') return 'en'
  const s = v.trim().toLowerCase()
  if (/^(fr|french|fran)/.test(s)) return 'fr'
  if (/^(ar|arabic|عرب)/.test(s)) return 'ar'
  return 'en'
}

async function detectLang($: EngineInterface, option: unknown): Promise<Lang> {
  if (option === 'en' || option === 'fr' || option === 'ar') return option
  try {
    const settings = (await $.settings.read()) as Record<string, unknown>
    if (typeof settings.language === 'string' && settings.language.trim()) return langOf(settings.language)
  } catch {
    // No settings: fall through to the locale.
  }
  const locale = (await $.env.get('LC_ALL')) || (await $.env.get('LC_MESSAGES')) || (await $.env.get('LANG'))
  return langOf(locale)
}

// ---------------------------------------------------------------------------
// Files. The project file is CLAUDE.md in the session's directory; the user
// file is ~/.claude/CLAUDE.md. Only `writeRule` and `removeRule` write, and
// only button handlers call them.

async function pathOf($: EngineInterface, scope: Scope): Promise<string> {
  if (scope === 'project') return `${(await $.session.cwd()).replace(/\/+$/, '')}/CLAUDE.md`
  const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE')) || ''
  if (!home) throw new Error('no home directory')
  return `${home.replace(/[\\/]+$/, '')}/.claude/CLAUDE.md`
}

const label = (scope: Scope): string => (scope === 'project' ? 'CLAUDE.md' : '~/.claude/CLAUDE.md')

// A missing file reads as empty; a file that is there and cannot be read
// throws, so nothing overwrites it.
async function readFile($: EngineInterface, path: string): Promise<string> {
  if (!(await $.fs.exists(path))) return ''
  return $.fs.read(path)
}

async function refreshSaved($: EngineInterface): Promise<Saved> {
  const one = async (scope: Scope): Promise<string[]> => {
    try {
      return rulesIn(await readFile($, await pathOf($, scope)))
    } catch {
      return []
    }
  }
  const next: Saved = { project: await one('project'), user: await one('user') }
  await update($, saved, () => next)
  return next
}

async function writeRule($: EngineInterface, scope: Scope, rule: string): Promise<'saved' | 'duplicate'> {
  const path = await pathOf($, scope)
  const md = await readFile($, path)
  if (hasDuplicate(rule, rulesIn(md))) return 'duplicate'
  await $.fs.write(path, withRule(md, rule))
  return 'saved'
}

async function removeRule($: EngineInterface, scope: Scope, rule: string): Promise<boolean> {
  const path = await pathOf($, scope)
  const md = await readFile($, path)
  const out = withoutRule(md, rule)
  if (out === md) return false
  await $.fs.write(path, out)
  return true
}

// ---------------------------------------------------------------------------
// Proposals. Setting `pending` writes no file: it only draws the band.

let seq = 0

async function propose($: EngineInterface, text: string): Promise<boolean> {
  const rule = tidy(text)
  if (!rule) return false
  const known = await read($, saved)
  const passed = await read($, skipped)
  const now = await read($, pending)
  if (hasDuplicate(rule, [...known.project, ...known.user, ...passed])) return false
  if (now && hasDuplicate(rule, [now.text])) return false
  seq += 1
  const proposal: Proposal = { id: `${await $.clock.now()}-${seq}`, text: rule, isEditing: false }
  await update($, pending, () => proposal)
  await update($, notice, () => null)
  return true
}

async function answerSave($: EngineInterface, scope: Scope): Promise<void> {
  const p = await read($, pending)
  if (!p) return
  let result: Notice
  try {
    const outcome = await writeRule($, scope, p.text)
    result = { text: outcome === 'saved' ? tr().savedTo(label(scope)) : tr().already, isError: false }
  } catch (err) {
    result = { text: tr().failed(err instanceof Error ? err.message : String(err)), isError: true }
  }
  await update($, pending, now => (now?.id === p.id ? null : now))
  await update($, notice, () => result)
  await refreshSaved($)
}

async function answerSkip($: EngineInterface): Promise<void> {
  const p = await read($, pending)
  if (!p) return
  await update($, skipped, list => [...list, p.text].slice(-MAX_SKIPPED))
  await update($, pending, now => (now?.id === p.id ? null : now))
  await update($, notice, () => ({ text: tr().skippedNote, isError: false }))
}

async function setWording($: EngineInterface, text: string): Promise<void> {
  const rule = tidy(text)
  if (!rule) return
  await update($, pending, now => (now ? { ...now, text: rule, isEditing: false } : now))
}

// The optional "propose from this turn": one cheap Haiku call on the last
// exchange. Its answer only becomes a proposal; Save is still asked.
async function proposeFromTurn($: EngineInterface): Promise<void> {
  if (await read($, isProposing)) return
  await update($, isProposing, () => true)
  try {
    const messages = await $.session.messages()
    const lastUser = [...messages].reverse().find(m => m.role === 'user' && m.text.trim())
    const at = lastUser ? messages.lastIndexOf(lastUser) : -1
    const reply = at >= 0 ? messages.slice(at + 1).find(m => m.role === 'assistant' && m.text.trim()) : undefined
    if (!lastUser) {
      await update($, notice, () => ({ text: tr().noTurn, isError: false }))
      return
    }
    const prompt = [
      'From this exchange between a user and a coding assistant, extract at most ONE lasting rule the user wants followed in future sessions (a correction or a preference).',
      'Answer with the rule alone, as one short imperative line under 120 characters, in the language the user wrote in. If there is no such rule, answer exactly NONE.',
      '',
      `<user>${lastUser.text.slice(0, 4000)}</user>`,
      `<assistant>${(reply?.text ?? '').slice(0, 4000)}</assistant>`,
    ].join('\n')
    const r = await $.model.complete({ model: 'haiku', prompt, maxTokens: 80, timeoutMs: 30000 })
    const line = r.isAnswered ? (r.text.trim().split('\n')[0] ?? '').trim() : ''
    const isRule = line && !/^none\.?$/i.test(line)
    if (!isRule || !(await propose($, line))) {
      await update($, notice, () => ({ text: tr().noRule, isError: false }))
    }
  } finally {
    await update($, isProposing, () => false)
  }
}

// ---------------------------------------------------------------------------
// The crab with a notebook. Pixel Clawd and its drawing code come from
// savvy-progress in JohnnyVizz/claude-kit (MIT, see THIRD_PARTY_NOTICES.md);
// the notebook costume is this mod's own.

type Fill = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void

const stamp = (f: Fill, x: number, y: number, rows: string[], map: Record<string, string>, cls?: string): void =>
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => map[ch] && f(x + dx, y + dy, 1, 1, map[ch] ?? '', cls)))

const crabBody = (f: Fill, armFront = 0, armCls?: string): void => {
  f(7, 10, 16, 12, CLAY)
  f(3, 14, 4, 4, CLAY)
  f(23, 14 + armFront, 4, 4, CLAY, armCls)
  f(9, 12, 2, 2, INK)
  f(19, 12, 2, 2, INK)
  f(7, 22, 2, 4, CLAY, 'la')
  f(17, 22, 2, 4, CLAY, 'la')
  f(11, 22, 2, 4, CLAY, 'lb')
  f(21, 22, 2, 4, CLAY, 'lb')
}

// Notebook held up in the front claw; a pencil in the other claw jots.
const notebook = (f: Fill): void => {
  crabBody(f, -4, 'nb')
  stamp(
    f,
    22,
    1,
    ['bbbbbbbb', 'kwwwwwwb', 'bwllllwb', 'kwwwwwwb', 'bwllllwb', 'kwwwwwwb', 'bwlllwwb', 'kwwwwwwb', 'bbbbbbbb'],
    { b: '#3E6FB0', w: '#F8F6F1', l: '#9DB4D6', k: INK },
    'nb',
  )
  stamp(f, 1, 8, ['..t', '.yy', '.yy', 'yy.', 'y..'], { y: '#F5C542', t: '#E89A9A' }, 'pen')
}

const CRAB_CSS = `<style>
.crab g{transform-box:fill-box}
.crab .pen{animation:jot .5s steps(1) infinite}
.crab .nb{animation:bob 1s ease-in-out infinite}
@keyframes jot{50%{transform:translate(1px,-1px)}}
@keyframes bob{50%{transform:translateY(-1px)}}
@media (prefers-reduced-motion: reduce){.crab g{animation:none!important}}
</style>`

const crabSvg = (size = 34): string => {
  const groups = new Map<string, string[]>([['bd', []]])
  const f: Fill = (x, y, w, h, c, cls = 'bd') => {
    if (!groups.has(cls)) groups.set(cls, [])
    groups.get(cls)?.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`)
  }
  notebook(f)
  const group = (cls: string) => `<g class="${cls}">${(groups.get(cls) ?? []).join('')}</g>`
  const flip = isRtl() ? ' transform="translate(30,0) scale(-1,1)"' : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 30 28">${CRAB_CSS}<g class="crab" shape-rendering="crispEdges"${flip}>${[...groups.keys()].map(group).join('')}</g></svg>`
}

// The edit field, shared by the band and the pane. It sets the wording only.
const editField = ($: EngineInterface, ui: { Input: Elements[RenderSurface]['Input'] }, p: Proposal) => (
  <ui.Input
    key="memory-wording"
    label={tr().editLabel}
    value={p.text}
    submitLabel={tr().keep}
    autoFocus
    onSubmit={value => void setWording($, value)}
  />
)

// ---------------------------------------------------------------------------

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    lang = await detectLang($, options.language)
    await $.command.register({ name: 'memory-list', description: 'Show saved memory rules (and any waiting one) in a pane' })
    await $.command.register({ name: 'memory-hold', description: 'Stop proposing memory rules' })
    await $.command.register({ name: 'memory-resume', description: 'Propose memory rules again' })
    await $.command.register({
      name: 'memory-edit',
      description: 'Change the wording of the waiting memory rule (still asks before saving)',
      argumentHint: '<rule wording>',
    })
    await refreshSaved($).catch(() => undefined)
    return next(e)
  })

  // Detect only: the prompt goes on exactly as typed, and no file is touched.
  on('prompt.submit', async ($, e, next) => {
    if (!e.command && !e.isMeta && !(await read($, paused))) {
      const rule = detect(e.text)
      if (rule && (await propose($, rule))) $.ui.toast(tr().proposed)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'memory-list' }, async $ => {
    await refreshSaved($)
    await $.ui.open({ id: PANE, title: tr().pane })
    return { text: tr().listOpened }
  })

  on('command.run', { command: 'memory-hold' }, async $ => {
    await update($, paused, () => true)
    return { text: tr().pausedText }
  })

  on('command.run', { command: 'memory-resume' }, async $ => {
    await update($, paused, () => false)
    return { text: tr().resumedText }
  })

  // Sets the wording only. With nothing waiting, the text becomes a proposal.
  on('command.run', { command: 'memory-edit' }, async ($, e) => {
    const text = e.args.trim()
    if (!text) return { text: tr().editUsage }
    if (await read($, pending)) await setWording($, text)
    else {
      await update($, skipped, list => list.filter(s => !hasDuplicate(tidy(text), [s])))
      await propose($, text)
    }
    return { text: tr().editSet }
  })

  // --- the band above the prompt -------------------------------------------

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const p = await read($, pending)
    const note = await read($, notice)
    if (!p && !note) return next(e)

    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const s = tr()
    const dir = isRtl() ? 'row-reverse' : 'row'
    const crab =
      e.surface !== 'terminal' && 'Svg' in ui ? (
        <ui.Svg source={crabSvg()} alt="crab with a notebook" width={34} height={34} />
      ) : (
        <Text color={CLAY}>▣▤</Text>
      )

    if (!p && note) {
      return (
        <Box flexDirection="column">
          <Box flexDirection={dir} gap={1} alignItems="center">
            {crab}
            <Text color={note.isError ? 'red' : undefined} dimColor={!note.isError}>
              {note.text}
            </Text>
            <Button key="memory-ok" label={s.dismiss} plain role="dismiss" onPress={() => update($, notice, () => null)} />
          </Box>
          {below}
        </Box>
      )
    }
    if (!p) return next(e)

    const body = p.isEditing ? (
      <Box flexDirection="column">
        {editField($, ui, p)}
        <Box flexDirection={dir} gap={1}>
          <Button key="memory-cancel" label={s.cancel} onPress={() => update($, pending, now => (now ? { ...now, isEditing: false } : now))} />
          <Text dimColor>{s.editHint}</Text>
        </Box>
      </Box>
    ) : (
      <Box flexDirection="column">
        <Text bold color={ACCENT}>
          {p.text}
        </Text>
        <Box flexDirection={dir} gap={1}>
          <Button key="memory-save-project" label={s.project} variant="primary" onPress={() => answerSave($, 'project')} />
          <Button key="memory-save-user" label={s.user} onPress={() => answerSave($, 'user')} />
          <Button key="memory-edit" label={s.edit} onPress={() => update($, pending, now => (now ? { ...now, isEditing: true } : now))} />
          <Button key="memory-skip" label={s.skip} role="dismiss" onPress={() => answerSkip($)} />
        </Box>
        <Text dimColor>⚠ {s.warn}</Text>
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Box flexDirection={dir} gap={1}>
          {crab}
          <Box flexDirection="column" flexShrink={1}>
            <Text dimColor>{s.ask}</Text>
            {body}
          </Box>
        </Box>
        {below}
      </Box>
    )
  })

  // --- the pane: saved rules, removal with confirmation, the waiting rule ----

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const s = tr()
    const dir = isRtl() ? 'row-reverse' : 'row'
    const list = await read($, saved)
    const p = await read($, pending)
    const asking = await read($, removing)
    const isPaused = await read($, paused)
    const busy = await read($, isProposing)
    const note = await read($, notice)

    const section = (scope: Scope, title: string, rules: string[]) => (
      <Box flexDirection="column">
        <Text bold>{title}</Text>
        {rules.length === 0 && <Text dimColor>{s.none}</Text>}
        {rules.map((rule, i) =>
          asking && asking.scope === scope && asking.text === rule ? (
            <Box flexDirection="column">
              <Text color="red">{s.confirmRemove(rule, label(scope))}</Text>
              <Box flexDirection={dir} gap={1}>
                <Button
                  key={`memory-confirm-${scope}-${i}`}
                  label={s.yesRemove}
                  variant="primary"
                  onPress={async () => {
                    const target: PendingRemove = asking
                    await update($, removing, () => null)
                    try {
                      await removeRule($, target.scope, target.text)
                      await update($, notice, () => ({ text: s.removed, isError: false }))
                    } catch (err) {
                      await update($, notice, () => ({ text: s.failed(err instanceof Error ? err.message : String(err)), isError: true }))
                    }
                    await refreshSaved($)
                  }}
                />
                <Button key={`memory-cancel-${scope}-${i}`} label={s.cancel} onPress={() => update($, removing, () => null)} />
              </Box>
            </Box>
          ) : (
            <Box flexDirection={dir} gap={1}>
              <Text>- {rule}</Text>
              <Button key={`memory-remove-${scope}-${i}`} label={s.remove} plain onPress={() => update($, removing, () => ({ scope, text: rule }))} />
            </Box>
          ),
        )}
      </Box>
    )

    const header =
      e.surface !== 'terminal' && 'Svg' in ui ? (
        <ui.Svg source={crabSvg(40)} alt="crab with a notebook" width={40} height={40} />
      ) : (
        <Text color={CLAY}>▣▤ {s.pane}</Text>
      )

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection={dir} gap={1} alignItems="center">
          {header}
          <Text dimColor>{isPaused ? s.isPaused : s.isOn}</Text>
          <Button
            key="memory-toggle"
            label={isPaused ? s.resume : s.pause}
            plain
            onPress={() => update($, paused, v => !v)}
          />
        </Box>
        {p && (
          <Box flexDirection="column">
            <Text dimColor>{s.pending}</Text>
            {p.isEditing ? (
              editField($, ui, p)
            ) : (
              <Text bold color={ACCENT}>
                {p.text}
              </Text>
            )}
            <Box flexDirection={dir} gap={1}>
              <Button key="memory-pane-save-project" label={s.project} variant="primary" onPress={() => answerSave($, 'project')} />
              <Button key="memory-pane-save-user" label={s.user} onPress={() => answerSave($, 'user')} />
              <Button
                key="memory-pane-edit"
                label={p.isEditing ? s.cancel : s.edit}
                onPress={() => update($, pending, now => (now ? { ...now, isEditing: !now.isEditing } : now))}
              />
              <Button key="memory-pane-skip" label={s.skip} onPress={() => answerSkip($)} />
            </Box>
            <Text dimColor>⚠ {s.warn}</Text>
          </Box>
        )}
        {note && !p && <Text dimColor={!note.isError} color={note.isError ? 'red' : undefined}>{note.text}</Text>}
        {section('project', s.projectRules, list.project)}
        {section('user', s.userRules, list.user)}
        <Button
          key="memory-from-turn"
          label={busy ? s.proposing : s.fromTurn}
          onPress={() => (busy ? undefined : proposeFromTurn($))}
        />
        <Text dimColor>{HEADING}</Text>
      </Box>
    )
  })
}
