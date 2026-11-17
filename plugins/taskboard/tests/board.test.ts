import { expect, test } from 'claude-code/testing'

import type { Board } from '../types'
import { EMPTY, activityOf, afterCall, beforeCall, countsOf, estimateTokens, fmtSpan, propOf, stateOf, textSpan, timelineOf } from '../hooks/board'

const T0 = 1_000_000
const create = (b: Board, id: string, subject: string, at = T0, agentId?: string) =>
  afterCall(b, 'TaskCreate', { subject, description: subject }, { result: { task: { id, subject } } }, at, agentId)
const set = (b: Board, taskId: string, input: Record<string, unknown>, at: number) =>
  afterCall(b, 'TaskUpdate', { taskId, ...input }, { result: { success: true, taskId, updatedFields: [] } }, at)

test('each tool kind gets its prop', () => {
  expect(propOf('Edit')).toBe('wrench')
  expect(propOf('Write')).toBe('wrench')
  expect(propOf('Read')).toBe('magnifier')
  expect(propOf('Grep')).toBe('magnifier')
  expect(propOf('Glob')).toBe('magnifier')
  expect(propOf('Bash')).toBe('terminal')
  expect(propOf('WebSearch')).toBe('antenna')
  expect(propOf('WebFetch')).toBe('antenna')
  expect(propOf('Agent')).toBe('think')
})

test('the activity names the file, the command or the host', () => {
  expect(activityOf('Read', { file_path: '/repo/src/parser.py' }, 0)).toMatchObject({ verb: 'read', target: 'parser.py' })
  expect(activityOf('Edit', { file_path: 'C:\\app\\api.ts' }, 0)).toMatchObject({ verb: 'edit', target: 'api.ts' })
  expect(activityOf('Bash', { command: 'npm   test' }, 0)).toMatchObject({ verb: 'run', target: 'npm test' })
  expect(activityOf('WebFetch', { url: 'https://example.com/a?b' }, 0)).toMatchObject({ verb: 'fetch', target: 'example.com' })
  expect(activityOf('mcp__github__get_me', {}, 0)).toMatchObject({ verb: 'mcp', target: 'github get_me', prop: 'antenna' })
  expect(activityOf('TaskUpdate', {}, 0).verb).toBe('plan')
  // A task tool call keeps the line on the last real tool.
  expect(beforeCall(beforeCall(EMPTY, 'Read', { file_path: 'a.ts' }, 0), 'TaskUpdate', {}, 0).activity?.verb).toBe('read')
})

test('TaskCreate and TaskUpdate drive the states and their times', () => {
  let b = create(create(EMPTY, '1', 'Parse'), '2', 'Test')
  expect(countsOf(b)).toMatchObject({ done: 0, total: 2, pct: 0 })
  b = set(b, '1', { status: 'in_progress' }, T0 + 1000)
  expect(b.tasks[0]).toMatchObject({ status: 'in_progress', startedAt: T0 + 1000 })
  b = set(b, '1', { status: 'completed' }, T0 + 61_000)
  expect(b.tasks[0]?.endedAt).toBe(T0 + 61_000)
  expect(b.doneAt).toBeNull()
  b = set(b, '2', { status: 'completed' }, T0 + 70_000)
  expect(countsOf(b).pct).toBe(100)
  expect(b.doneAt).toBe(T0 + 70_000)
  // A new list after a finished one starts the board over.
  b = create(b, '3', 'Next')
  expect(b.tasks.map(t => t.id)).toEqual(['3'])
  expect(b.doneAt).toBeNull()
})

test('deleted tasks go; a failed update changes nothing', () => {
  let b = create(create(EMPTY, '1', 'A'), '2', 'B')
  b = set(b, '2', { status: 'deleted' }, T0)
  expect(b.tasks.map(t => t.id)).toEqual(['1'])
  const same = afterCall(b, 'TaskUpdate', { taskId: '1', status: 'completed' }, { result: { success: false, taskId: '1', updatedFields: [] } }, T0)
  expect(same.tasks[0]?.status).toBe('pending')
})

test('blocked by an open task, failed by metadata, both with a reason', () => {
  let b = create(create(EMPTY, '1', 'A'), '2', 'B')
  b = set(b, '2', { addBlockedBy: ['1'] }, T0)
  expect(stateOf(b.tasks[1]!, b.tasks)).toBe('blocked')
  b = set(b, '1', { status: 'in_progress' }, T0)
  b = set(b, '1', { metadata: { failed: 'tests fail: 3 errors' } }, T0)
  expect(stateOf(b.tasks[0]!, b.tasks)).toBe('failed')
  expect(b.tasks[0]?.failed).toBe('tests fail: 3 errors')
  b = set(b, '1', { status: 'completed' }, T0)
  expect(stateOf(b.tasks[0]!, b.tasks)).toBe('completed')
  expect(stateOf(b.tasks[1]!, b.tasks)).toBe('pending')
})

test('tool calls count toward the running task, with a token estimate', () => {
  let b = set(create(EMPTY, '1', 'A'), '1', { status: 'in_progress' }, T0)
  const input = { command: 'npm test' }
  b = beforeCall(b, 'Bash', input, T0)
  expect(b.activity).toMatchObject({ verb: 'run', target: 'npm test' })
  expect(b.tasks[0]).toMatchObject({ tools: 1, prop: 'terminal' })
  b = afterCall(b, 'Bash', input, { text: 'x'.repeat(400), isError: true }, T0)
  expect(b.tasks[0]?.tokens).toBe(estimateTokens(input, 'x'.repeat(400)))
  expect(b.tasks[0]?.lastError).toBe('x'.repeat(79) + '…')
  // The task tools themselves count toward nothing.
  b = beforeCall(b, 'TaskList', {}, T0)
  expect(b.tasks[0]?.tools).toBe(1)
})

test('a subagent call leaves the main activity line alone', () => {
  let b = beforeCall(EMPTY, 'Read', { file_path: 'a.ts' }, T0)
  b = beforeCall(b, 'Bash', { command: 'ls' }, T0, 'agent-1')
  expect(b.activity?.verb).toBe('read')
})

test('TaskList reconciles the list; TodoWrite keeps its own', () => {
  let b = create(EMPTY, '1', 'A')
  b = afterCall(b, 'TaskList', {}, { result: { tasks: [{ id: '1', subject: 'A', status: 'completed', blockedBy: [] }, { id: '2', subject: 'B', status: 'pending', blockedBy: ['1'] }] } }, T0)
  expect(b.tasks.map(t => `${t.id}:${t.status}`)).toEqual(['1:completed', '2:pending'])
  const todos = [{ content: 'Write', status: 'in_progress', activeForm: 'Writing' }, { content: 'Ship', status: 'pending', activeForm: 'Shipping' }]
  b = afterCall(b, 'TodoWrite', { todos }, { result: { oldTodos: [], newTodos: todos } }, T0 + 5)
  expect(b.tasks.length).toBe(4)
  expect(b.tasks[2]).toMatchObject({ subject: 'Write', activeForm: 'Writing', status: 'in_progress', startedAt: T0 + 5, source: 'todo' })
  // The same todo keeps its start time on the next write.
  b = afterCall(b, 'TodoWrite', { todos }, { result: { oldTodos: todos, newTodos: [{ ...todos[0], status: 'completed' }] } }, T0 + 50)
  expect(b.tasks.filter(t => t.source === 'todo').map(t => `${t.subject}:${t.startedAt}:${t.endedAt}`)).toEqual([`Write:${T0 + 5}:${T0 + 50}`])
})

test('the timeline puts each started task on one axis', () => {
  let b = create(create(EMPTY, '1', 'A'), '2', 'B')
  b = set(b, '1', { status: 'in_progress' }, T0)
  b = set(b, '1', { status: 'completed' }, T0 + 30_000)
  b = set(b, '2', { status: 'in_progress' }, T0 + 30_000)
  const tl = timelineOf(b, T0 + 60_000)
  expect(tl.start).toBe(T0)
  expect(tl.end).toBe(T0 + 60_000)
  expect(textSpan(tl.spans[0]!, tl.start, tl.end, 10)).toBe('█████     ')
  expect(textSpan(tl.spans[1]!, tl.start, tl.end, 10)).toBe('     ▓▓▓▓▓')
  expect(fmtSpan(130_000)).toBe('2m 10s')
  expect(fmtSpan(3_900_000)).toBe('1h 05m')
})
