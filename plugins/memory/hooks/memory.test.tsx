import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { detect, hasDuplicate, rulesIn, withRule, withoutRule } from './detect'

const PROJECT = '/work/proj/CLAUDE.md'
const USER = '/home/owner/.claude/CLAUDE.md'

const BAND = {
  plugin: 'memory',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const PANE = {
  plugin: 'memory',
  component: 'Pane',
  requestId: 'memory',
  props: {
    title: 'Memory',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

// The engine beneath the plugin: an in-memory file system that records
// every write, a session directory and a home.
function engine(on: On, files: Record<string, string> = {}) {
  const writes: { path: string; text: string }[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('settings.read', () => ({ value: {} }))
  on('session.cwd', () => ({ value: '/work/proj' }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/owner' : undefined }))
  on('fs.exists', (_, e) => ({ value: e.path in files }))
  on('fs.read', (_, e) => {
    const text = files[e.path]
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('fs.write', (_, e) => {
    writes.push({ path: e.path, text: e.text })
    files[e.path] = e.text
    return { value: undefined }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('clock.now', () => ({ value: 1_700_000_000_000 }))
  // The engine's own drawing where the mod passes: an empty box.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  return { files, writes }
}

const start = ($: Engine) =>
  $.session.start({ cwd: '/work/proj', surface: 'desktop', isInteractive: true })

describe('detection (no tokens, three languages)', () => {
  test('finds corrections and preferences', () => {
    expect(detect('no, use pnpm instead of npm')).toBe('Use pnpm instead of npm.')
    expect(detect('Always run the tests before committing.')).toBe('Always run the tests before committing.')
    expect(detect('please never push to main')).toBe('Never push to main.')
    expect(detect('I prefer tabs over spaces')).toBe('Prefer tabs over spaces.')
    expect(detect("don't use emojis in commit messages")).toBe("Don't use emojis in commit messages.")
    expect(detect('remember that the API is v2 now')).toBe('The API is v2 now.')
    expect(detect('from now on reply in French')).toBe('Reply in French.')
    expect(detect('toujours écrire les tests en premier')).toBe('Toujours écrire les tests en premier.')
    expect(detect('je préfère les réponses courtes')).toBe('Préférer les réponses courtes.')
    expect(detect("n'utilise pas de framework lourd")).toBe('Ne pas utiliser de framework lourd.')
    expect(detect('jamais de code sans tests')).toBe('Jamais de code sans tests.')
    expect(detect('دائما اكتب الاختبارات أولا')).toBe('دائما اكتب الاختبارات أولا.')
    expect(detect('لا تستخدم مكتبات غير مفتوحة المصدر')).toBe('لا تستخدم مكتبات غير مفتوحة المصدر.')
  })

  test('leaves ordinary prompts, questions and commands alone', () => {
    expect(detect('fix the failing test in parser.ts')).toBeNull()
    expect(detect('why does it always fail?')).toBeNull()
    expect(detect('/memory-list')).toBeNull()
    expect(detect("don't worry about it")).toBeNull()
    expect(detect('it always crashes on start')).toBeNull()
  })

  test('near duplicates are caught case-insensitively', () => {
    expect(hasDuplicate('use PNPM instead of npm.', ['Use pnpm instead of npm.'])).toBe(true)
    expect(hasDuplicate('Always run the tests', ['Always run the tests before committing.'])).toBe(true)
    expect(hasDuplicate('Prefer tabs.', ['Never push to main.'])).toBe(false)
  })

  test('the section is made, appended to and trimmed', () => {
    const one = withRule('# Project\n\nSome text.\n', 'Use pnpm.')
    expect(one).toBe('# Project\n\nSome text.\n\n## Preferences (memory mod)\n\n- Use pnpm.\n')
    const two = withRule(`${one}\n## Other\n\nkeep\n`, 'Prefer tabs.')
    expect(rulesIn(two)).toEqual(['Use pnpm.', 'Prefer tabs.'])
    expect(two).toContain('## Other\n\nkeep')
    expect(rulesIn(withoutRule(two, 'Use pnpm.'))).toEqual(['Prefer tabs.'])
  })
})

describe('asks before every save', () => {
  test('a detected rule writes nothing and keeps the prompt as typed', async ($, on) => {
    const { writes } = engine(on)
    await start($)
    const out = await $.prompt.submit({ text: 'no, use pnpm instead of npm', wait: false, origin: { kind: 'composer' } })
    expect(out).toMatchObject({ text: 'no, use pnpm instead of npm' })
    expect(writes).toEqual([])
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect((await ui.find({ type: 'Text', text: /Use pnpm instead of npm\./ }))?.text).toBe('Use pnpm instead of npm.')
      expect(await ui.find({ key: 'memory-save-project' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /lost when a cloud container ends/ })).toBeDefined()
      await ui.unmount()
    }
    expect(writes).toEqual([])
  })

  test('Skip and Edit write nothing; only Save writes, once', async ($, on) => {
    const { writes, files } = engine(on)
    await start($)
    await $.prompt.submit({ text: 'always run tests before committing', wait: false, origin: { kind: 'composer' } })
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

    await ui.press({ key: 'memory-edit' })
    await ui.input({ key: 'memory-wording', text: 'Always run the unit tests before a commit' })
    expect(writes).toEqual([])
    expect(await ui.find({ type: 'Text', text: 'Always run the unit tests before a commit.' })).toBeDefined()

    await ui.press({ key: 'memory-save-project' })
    expect(writes).toHaveLength(1)
    expect(writes[0]?.path).toBe(PROJECT)
    expect(rulesIn(files[PROJECT] ?? '')).toEqual(['Always run the unit tests before a commit.'])
    await ui.unmount()

    await $.prompt.submit({ text: 'never push to main', wait: false, origin: { kind: 'composer' } })
    const again = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await again.press({ key: 'memory-skip' })
    expect(writes).toHaveLength(1)
    await again.unmount()
  })

  test('Save to user writes ~/.claude/CLAUDE.md and keeps the file', async ($, on) => {
    const { writes, files } = engine(on, { [USER]: '# Mine\n\nhello\n' })
    await start($)
    await $.prompt.submit({ text: 'I prefer short answers', wait: false, origin: { kind: 'composer' } })
    expect(writes).toEqual([])
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await ui.press({ key: 'memory-save-user' })
    expect(writes.map(w => w.path)).toEqual([USER])
    expect(files[USER]).toBe('# Mine\n\nhello\n\n## Preferences (memory mod)\n\n- Prefer short answers.\n')
    await ui.unmount()
  })

  test('a rule already saved is not proposed again', async ($, on) => {
    const { writes } = engine(on, { [PROJECT]: '## Preferences (memory mod)\n\n- Use pnpm instead of npm.\n' })
    await start($)
    await $.prompt.submit({ text: 'no, use PNPM instead of npm!', wait: false, origin: { kind: 'composer' } })
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect(await ui.find({ key: 'memory-save-project' })).toBeUndefined()
    expect(writes).toEqual([])
    await ui.unmount()
  })

  test('/memory-hold stops proposals; /memory-resume brings them back', async ($, on) => {
    engine(on)
    await start($)
    const presentation = { isFullscreen: false, columns: 100 }
    const origin = { kind: 'composer' } as const
    await $.command.run({ command: 'memory-hold', args: '', origin, presentation })
    await $.prompt.submit({ text: 'always use tabs', wait: false, origin: { kind: 'composer' } })
    let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect(await ui.find({ key: 'memory-save-project' })).toBeUndefined()
    await ui.unmount()
    await $.command.run({ command: 'memory-resume', args: '', origin, presentation })
    await $.prompt.submit({ text: 'always use tabs', wait: false, origin: { kind: 'composer' } })
    ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect(await ui.find({ key: 'memory-save-project' })).toBeDefined()
    await ui.unmount()
  })

  test('/memory-edit changes the wording and still waits for Save', async ($, on) => {
    const { writes } = engine(on)
    await start($)
    await $.prompt.submit({ text: 'always use tabs', wait: false, origin: { kind: 'composer' } })
    const presentation = { isFullscreen: false, columns: 100 }
    await $.command.run({ command: 'memory-edit', args: 'Indent with tabs', origin: { kind: 'composer' }, presentation })
    expect(writes).toEqual([])
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: 'Indent with tabs.' })).toBeDefined()
    await ui.unmount()
  })
})

describe('the /memory-list pane', () => {
  test('Remove asks first; only the confirmation writes', async ($, on) => {
    const { writes, files } = engine(on, {
      [PROJECT]: '# P\n\n## Preferences (memory mod)\n\n- Use pnpm.\n- Prefer tabs.\n',
    })
    await start($)
    for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ type: 'Text', text: '- Use pnpm.' })).toBeDefined()
      await ui.unmount()
    }
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    await ui.press({ key: 'memory-remove-project-0' })
    expect(writes).toEqual([])
    await ui.press({ key: 'memory-cancel-project-0' })
    expect(writes).toEqual([])
    await ui.press({ key: 'memory-remove-project-0' })
    await ui.press({ key: 'memory-confirm-project-0' })
    expect(writes).toHaveLength(1)
    expect(rulesIn(files[PROJECT] ?? '')).toEqual(['Prefer tabs.'])
    await ui.unmount()
  })

  test('the pane offers the waiting rule on mobile, where the band is not drawn', async ($, on) => {
    const { writes } = engine(on)
    await start($)
    await $.prompt.submit({ text: 'jamais de force push', wait: false, origin: { kind: 'composer' } })
    const ui = await $.ui.mount({ ...PANE, surface: 'mobile' })
    expect(await ui.find({ key: 'memory-pane-save-project' })).toBeDefined()
    expect(writes).toEqual([])
    await ui.press({ key: 'memory-pane-save-project' })
    expect(writes).toHaveLength(1)
    await ui.unmount()
  })

  test('propose from this turn asks Haiku, then still waits for Save', async ($, on) => {
    const { writes } = engine(on)
    on('session.messages', () => ({
      value: [
        { role: 'user', text: 'use ruff, not flake8', toolUses: [] },
        { role: 'assistant', text: 'Switched to ruff.', toolUses: [] },
      ],
    }))
    on('model.complete', (_, e) => {
      expect(e.model).toBe('haiku')
      return { value: { isAnswered: true, text: 'Use ruff instead of flake8', usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } }
    })
    await start($)
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    await ui.press({ key: 'memory-from-turn' })
    expect(await ui.find({ type: 'Text', text: 'Use ruff instead of flake8.' })).toBeDefined()
    expect(writes).toEqual([])
    await ui.unmount()
  })
})
