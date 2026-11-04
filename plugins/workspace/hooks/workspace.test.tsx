import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { bashPaths, isIgnored, keyOf, parseGitignore, sortEntries, visibleRows } from './lib'

// ---------- a small fake world beneath the plugin ----------

type Kind = 'file' | 'dir'
const ROOT = '/repo'

const startFs = (): Map<string, [string, Kind][]> =>
  new Map([
    [
      ROOT,
      [
        ['README.md', 'file'],
        ['src', 'dir'],
        ['.git', 'dir'],
        ['node_modules', 'dir'],
        ['dist', 'dir'],
        ['app.log', 'file'],
        ['.env', 'file'],
        ['b.txt', 'file'],
        ['A.txt', 'file'],
      ],
    ],
    [
      `${ROOT}/src`,
      [
        ['main.ts', 'file'],
        ['util', 'dir'],
      ],
    ],
    [`${ROOT}/src/util`, [['x.ts', 'file']]],
  ])

type World = {
  fs: Map<string, [string, Kind][]>
  lists: string[]
  filled: string[]
  copied: string[]
  toasts: string[]
  writes: string[]
  panes: Set<string>
  clock: ReturnType<typeof mock.clock>
}

async function world($: Engine, on: On, opts: { canFill?: boolean } = {}): Promise<World> {
  const w: World = {
    fs: startFs(),
    lists: [],
    filled: [],
    copied: [],
    toasts: [],
    writes: [],
    panes: new Set(),
    clock: mock.clock(on, { now: 1_000_000 }),
  }
  const exists = (path: string): boolean => {
    if (w.fs.has(path)) return true
    const dir = path.slice(0, path.lastIndexOf('/'))
    const name = path.slice(path.lastIndexOf('/') + 1)
    return (w.fs.get(dir) ?? []).some(([n]) => n === name)
  }
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: ROOT }))
  on('command.register', () => ({ value: { command: 'tree' } }) as never)
  on('fs.list', (_, e) => {
    w.lists.push(e.path)
    const list = w.fs.get(e.path)
    if (list === undefined) throw new Error('ENOENT')
    return { value: list.map(([name, kind]) => ({ name, kind, size: 1, mtimeMs: 0, isLink: false })) }
  })
  on('fs.read', (_, e) => {
    if (e.path === `${ROOT}/.gitignore`) return { value: '# build\ndist/\n*.log\n!keep.log\n' }
    throw new Error('ENOENT')
  })
  on('fs.write', (_, e) => {
    w.writes.push(e.path)
    return { value: undefined }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('fs.exists', (_, e) => ({ value: exists(e.path) }))
  on('ui.open', (_, e) => {
    w.panes.add(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    w.panes.delete(e.id)
    return { value: undefined } as never
  })
  on('ui.panes', () => ({
    value: [...w.panes].map(id => ({ id, title: 'Files', isShown: true, isFocused: false, isPlaced: true })),
  }) as never)
  on('ui.toast', (_, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.copy', (_, e) => {
    w.copied.push(e.text)
    return { value: { isCopied: true } }
  })
  on('prompt.fill', (_, e) => {
    if (opts.canFill === false) return { isFilled: false, refusal: 'no_composer' } as never
    w.filled.push(e.text)
    return { isFilled: true, text: e.text, cursor: e.text.length } as never
  })
  // The tools themselves: a Write adds its file to the fake folder.
  on('tool.call', (_, e) => {
    if (e.tool === 'Write') {
      const dir = e.file_path.slice(0, e.file_path.lastIndexOf('/'))
      const name = e.file_path.slice(e.file_path.lastIndexOf('/') + 1)
      w.fs.set(dir, [...(w.fs.get(dir) ?? []), [name, 'file']])
    }
    return { result: {} } as never
  })
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  return w
}

const PANE = {
  plugin: 'workspace',
  component: 'Pane',
  requestId: 'workspace',
  props: { title: 'Files', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const BAND = {
  plugin: 'workspace',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const SURFACES = ['terminal', 'desktop', 'mobile'] as const

const buttonsText = async (ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }): Promise<string[]> =>
  (await ui.findAll({ type: 'Button' })).map(b => b.text.trim())

// ---------- pure helpers ----------

test('folders sort first, then names case-insensitively', async () => {
  const sorted = sortEntries([
    { name: 'b.txt', isDir: false },
    { name: 'Zed', isDir: true },
    { name: 'A.txt', isDir: false },
    { name: 'app', isDir: true },
    { name: 'file10', isDir: false },
    { name: 'file2', isDir: false },
  ])
  expect(sorted.map(e => e.name)).toEqual(['app', 'Zed', 'A.txt', 'b.txt', 'file2', 'file10'])
})

test('.gitignore rules: names, folders, anchored paths, globs; negations skipped', async () => {
  const rules = parseGitignore('# c\n\ndist/\n*.log\n/build\ndocs/**/*.tmp\n!keep.log\n')
  expect(isIgnored(rules, 'dist', true)).toBe(true)
  expect(isIgnored(rules, 'dist', false)).toBe(false)
  expect(isIgnored(rules, 'src/a.log', false)).toBe(true)
  expect(isIgnored(rules, 'build', true)).toBe(true)
  expect(isIgnored(rules, 'src/build', true)).toBe(false)
  expect(isIgnored(rules, 'docs/a/b/c.tmp', false)).toBe(true)
  expect(isIgnored(rules, 'docs/c.tmp', false)).toBe(true)
  expect(isIgnored(rules, 'src/main.ts', false)).toBe(false)
})

test('paths are kept relative to the root, outside ones absolute', async () => {
  expect(keyOf('/repo', '/repo/src/a.ts')).toBe('src/a.ts')
  expect(keyOf('/repo', './src/../b.ts')).toBe('b.ts')
  expect(keyOf('/repo', '/etc/hosts')).toBe('/etc/hosts')
  expect(keyOf('/repo', '/repo')).toBe(undefined)
  expect(keyOf('/repo', '/repository/x')).toBe('/repository/x')
})

test('Bash: only clear paths are taken', async () => {
  expect(bashPaths('cat README.md src/a.ts')).toEqual({ read: ['README.md', 'src/a.ts'], written: [] })
  expect(bashPaths('echo hi > out.txt && touch new.md')).toEqual({ read: [], written: ['out.txt', 'new.md'] })
  expect(bashPaths('cp a.txt b.txt')).toEqual({ read: ['a.txt'], written: ['b.txt'] })
  expect(bashPaths("sed -i 's/a/b/' f.txt")).toEqual({ read: [], written: ['f.txt'] })
  expect(bashPaths('ls 2>/dev/null; cat x 2>&1')).toEqual({ read: ['x'], written: [] })
  expect(bashPaths('cat $HOME/x *.ts')).toEqual({ read: [], written: [] })
  expect(bashPaths('echo $(date) > log.txt')).toEqual({ read: [], written: [] })
  expect(bashPaths('cat <<EOF > f\nhi\nEOF')).toEqual({ read: [], written: [] })
})

test('rows stop at the depth cap and the row limit', async () => {
  const tree = {
    root: '/r',
    dirs: { '': [{ name: 'a', isDir: true }], a: [{ name: 'b', isDir: true }], 'a/b': [{ name: 'c', isDir: false }] },
    count: 3,
    isTruncated: false,
    at: 0,
  }
  const open = new Set(['a', 'a/b'])
  expect(visibleRows(tree, open, 8, 100).map(r => r.rel)).toEqual(['a', 'a/b', 'a/b/c'])
  const capped = visibleRows(tree, open, 2, 100)
  expect(capped.map(r => r.rel)).toEqual(['a', 'a/b'])
  expect(capped[1]?.isCapped).toBe(true)
  expect(visibleRows(tree, open, 8, 1)).toHaveLength(1)
})

// ---------- the pane ----------

test('/tree opens the pane: folders first, .git, node_modules, ignored and hidden skipped', async ($, on) => {
  const w = await world($, on)
  const ran = await $.command.run({ command: 'tree' } as never)
  expect(JSON.stringify(ran)).toContain('opened')

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const rows = (await buttonsText(ui)).filter(t => !['Refresh', 'Changed · 0'].includes(t))
    expect(rows).toEqual(['▸ src/', 'A.txt', 'b.txt', 'README.md'])
    // The crab header is an SVG where the surface draws one, a text row on the terminal.
    expect((await ui.findAll({ type: 'Svg' })).length).toBe(surface === 'terminal' ? 0 : 1)
    await ui.unmount()
  }
  expect(w.lists).toEqual([ROOT])

  const again = await $.command.run({ command: 'tree' } as never)
  expect(JSON.stringify(again)).toContain('closed')
  expect(w.panes.size).toBe(0)
})

test('a folder opens on a press and lists only that folder', async ($, on) => {
  const w = await world($, on)
  await $.command.run({ command: 'tree' } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'd:src' })
    const rows = await buttonsText(ui)
    expect(rows).toContain('▾ src/')
    expect(rows).toContain('main.ts')
    expect(rows).toContain('▸ util/')
    await ui.press({ key: 'd:src' })
    expect(await buttonsText(ui)).not.toContain('main.ts')
    await ui.unmount()
  }
  // Listed once: closing and opening again uses what was listed.
  expect(w.lists.filter(p => p === `${ROOT}/src`)).toHaveLength(1)
})

test('marks follow Read, Edit, Write and Bash; the changed filter lists them', async ($, on) => {
  const w = await world($, on)
  await $.command.run({ command: 'tree' } as never)
  await $.tool.call({ tool: 'Read', file_path: `${ROOT}/README.md` } as never)
  await $.tool.call({ tool: 'Edit', file_path: `${ROOT}/b.txt`, old_string: 'a', new_string: 'b' } as never)
  await $.tool.call({ tool: 'Write', file_path: `${ROOT}/new.ts`, content: 'x' } as never)
  await $.tool.call({ tool: 'Read', file_path: `${ROOT}/b.txt` } as never)
  await $.tool.call({ tool: 'Bash', command: 'cat src/main.ts' } as never)
  await w.clock.advance(6000)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const rows = await buttonsText(ui)
    expect(rows).toContain('README.md R')
    // Read after Edit keeps the stronger mark.
    expect(rows).toContain('b.txt E')
    expect(rows).toContain('new.ts +')
    expect(rows).toContain('▸ src/ •')

    await ui.press({ key: 'filter' })
    const changed = (await buttonsText(ui)).filter(t => t !== 'Refresh' && t !== 'All files')
    expect(changed).toEqual(['b.txt E', 'new.ts +', 'README.md R', 'src/main.ts R'])
    await ui.press({ key: 'filter' })
    await ui.unmount()
  }

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await band.find({ type: 'Text', text: /touched/ }))?.text).toBe('4 touched')
  await band.unmount()
})

test('a file offers Mention and Copy; the pane never writes', async ($, on) => {
  const w = await world($, on)
  await $.command.run({ command: 'tree' } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'f:README.md' })
    expect(await ui.find({ key: 'mention' })).toBeDefined()
    await ui.press({ key: 'mention' })
    await ui.press({ key: 'copy' })
    await ui.press({ key: 'unselect' })
    expect(await ui.find({ key: 'mention' })).toBe(undefined)
    await ui.unmount()
  }
  expect(w.filled).toEqual(['@README.md ', '@README.md '])
  expect(w.copied).toEqual(['README.md', 'README.md'])
  expect(w.toasts).toContain('Added @README.md to the prompt')
  expect(w.writes).toEqual([])
})

test('Mention falls back to the clipboard where the prompt box cannot take it', async ($, on) => {
  const w = await world($, on, { canFill: false })
  await $.command.run({ command: 'tree' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'mobile' })
  await ui.press({ key: 'f:A.txt' })
  await ui.press({ key: 'mention' })
  await ui.unmount()
  expect(w.copied).toEqual(['@A.txt'])
  expect(w.toasts.some(t => t.includes('copied A.txt instead'))).toBe(true)
})

test('refreshes after a change at most once per 5 s; Refresh lists at once', async ($, on) => {
  const w = await world($, on)
  await $.command.run({ command: 'tree' } as never)
  const roots = () => w.lists.filter(p => p === ROOT).length
  expect(roots()).toBe(1)

  // Within 5 s of the open: the refresh waits, and two edits make one refresh.
  await $.tool.call({ tool: 'Edit', file_path: `${ROOT}/b.txt`, old_string: 'a', new_string: 'b' } as never)
  await $.tool.call({ tool: 'Edit', file_path: `${ROOT}/A.txt`, old_string: 'a', new_string: 'b' } as never)
  await w.clock.advance(1000)
  expect(roots()).toBe(1)
  await w.clock.advance(4500)
  expect(roots()).toBe(2)

  // A Read changes nothing on disk: no refresh.
  await w.clock.advance(10_000)
  await $.tool.call({ tool: 'Read', file_path: `${ROOT}/b.txt` } as never)
  await w.clock.advance(10_000)
  expect(roots()).toBe(2)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'refresh' })
  expect(roots()).toBe(3)
  await ui.unmount()

  // Closed: no refresh at all.
  await $.command.run({ command: 'tree' } as never)
  await w.clock.advance(10_000)
  await $.tool.call({ tool: 'Edit', file_path: `${ROOT}/b.txt`, old_string: 'a', new_string: 'b' } as never)
  await w.clock.advance(10_000)
  expect(roots()).toBe(3)
})

test('the band button toggles the pane', async ($, on) => {
  const w = await world($, on)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ key: 'workspace-toggle' }))?.text).toBe('Files')
  await ui.press({ key: 'workspace-toggle' })
  expect(w.panes.has('workspace')).toBe(true)
  expect((await ui.find({ key: 'workspace-toggle' }))?.text).toBe('Hide files')
  await ui.unmount()
})

test('French labels', { options: { language: 'fr' } }, async ($, on) => {
  await world($, on)
  await $.command.run({ command: 'tree' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ key: 'refresh' }))?.text).toBe('Actualiser')
  await ui.unmount()
})

test('Arabic draws right to left', { options: { language: 'ar' } }, async ($, on) => {
  await world($, on)
  await $.command.run({ command: 'tree' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'refresh' }))?.text).toBe('تحديث')
  expect((await ui.find({ type: 'Svg' }))?.props.source).toContain('direction="rtl"')
  await ui.unmount()
})

test('the band stays out of the way when turned off', { options: { showBand: false } }, async ($, on) => {
  await world($, on)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'workspace-toggle' })).toBe(undefined)
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})

test('a huge folder stops at maxEntries and says so', { options: { maxEntries: 50 } }, async ($, on) => {
  const w = await world($, on)
  w.fs.set(ROOT, Array.from({ length: 120 }, (_, i) => [`f${i}.txt`, 'file'] as [string, Kind]))
  await $.command.run({ command: 'tree' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const files = (await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('f:'))
  expect(files).toHaveLength(50)
  expect((await ui.find({ type: 'Text', text: /stopped at 50/ }))?.text).toContain('maxEntries')
  await ui.unmount()
})

test('the crab walks while the tree refreshes, then stands', async ($, on) => {
  const w = await world($, on)
  await $.command.run({ command: 'tree' } as never)
  const source = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const svg = String((await ui.find({ type: 'Svg' }))?.props.source)
    await ui.unmount()
    return svg
  }
  expect(await source()).toContain('class="run"')
  expect(await source()).toContain('prefers-reduced-motion')
  await w.clock.advance(1500)
  expect(await source()).not.toContain('class="run"')
})
