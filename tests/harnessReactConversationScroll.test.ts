import { describe, expect, it } from 'vitest'
import { conversationRestoreTop, conversationScrollKey, createConversationScrollMemory, type ConversationScrollPosition } from '../apps/harness-react/src/lib/conversation-scroll'

const reading: ConversationScrollPosition = { scrollTop: 720, scrollHeight: 2400, clientHeight: 600, following: false }

describe('Mira conversation reading memory', () => {
  it('restores each task independently when switching between projects and tasks', () => {
    const memory = createConversationScrollMemory()
    const first = conversationScrollKey('task-a', '/project-a')
    const second = conversationScrollKey('task-b', '/project-a')
    const otherProject = conversationScrollKey('task-a', '/project-b')
    expect(new Set([first, second, otherProject]).size).toBe(3)
    memory.save(first, reading)
    memory.save(second, { ...reading, scrollTop: 1200 })
    memory.save(otherProject, { ...reading, scrollTop: 300 })
    expect(memory.read(first)).toEqual(reading)
    expect(memory.read(second)?.scrollTop).toBe(1200)
    expect(memory.read(otherProject)?.scrollTop).toBe(300)
  })

  it('keeps a task without a project separate from the same task in a project', () => {
    const memory = createConversationScrollMemory()
    const unscoped = conversationScrollKey('task')
    const scoped = conversationScrollKey('task', '/project')
    expect(unscoped).not.toBeNull()
    expect(unscoped).not.toBe(scoped)
    memory.save(unscoped, reading)
    expect(memory.read(unscoped)).toEqual(reading)
    expect(memory.read(scoped)).toBeUndefined()
  })

  it('does not give a draft a persisted reading position', () => {
    const memory = createConversationScrollMemory()
    expect(conversationScrollKey()).toBeNull()
    expect(conversationScrollKey(undefined, '/project')).toBeNull()
    memory.save(null, reading)
    expect(memory.read(null)).toBeUndefined()
    expect(memory.read(conversationScrollKey('new-task', '/project'))).toBeUndefined()
  })

  it('retains the 200 most recently visited tasks rather than the 200 newest tasks', () => {
    const memory = createConversationScrollMemory()
    for (let index = 0; index < 200; index++) memory.save(`task-${index}`, { ...reading, scrollTop: index })
    expect(memory.read('task-0')?.scrollTop).toBe(0)
    memory.save('task-200', reading)
    expect(memory.read('task-1')).toBeUndefined()
    expect(memory.read('task-0')?.scrollTop).toBe(0)
    expect(memory.read('task-199')?.scrollTop).toBe(199)
    expect(memory.read('task-200')).toEqual(reading)
  })

  it('refreshes the most recently saved task without consuming another memory slot', () => {
    const memory = createConversationScrollMemory(2)
    memory.save('first', reading)
    memory.save('second', reading)
    memory.save('first', { ...reading, scrollTop: 1000 })
    memory.save('third', reading)
    expect(memory.read('second')).toBeUndefined()
    expect(memory.read('first')?.scrollTop).toBe(1000)
    expect(memory.read('third')).toEqual(reading)
  })

  it('keeps historical reading detached even if its saved position now coincides with the bottom', () => {
    const memory = createConversationScrollMemory()
    memory.save('task', reading)
    const restored = memory.read('task')!
    expect(conversationRestoreTop(restored, { scrollHeight: 1320, clientHeight: 600 })).toBe(720)
    expect(memory.read('task')?.following).toBe(false)
    expect(restored).toEqual(reading)
  })

  it('restores the saved reading position when more output arrived while the task was inactive', () => {
    expect(conversationRestoreTop(reading, { scrollHeight: 5000, clientHeight: 600 })).toBe(720)
  })

  it.each([
    { position: { ...reading, scrollTop: -20 }, metrics: { scrollHeight: 2400, clientHeight: 600 }, expected: 0 },
    { position: reading, metrics: { scrollHeight: 1000, clientHeight: 600 }, expected: 400 },
    { position: reading, metrics: { scrollHeight: 300, clientHeight: 600 }, expected: 0 },
    { position: reading, metrics: { scrollHeight: 0, clientHeight: 600 }, expected: 0 },
  ])('clamps a saved position to the available content ($expected)', ({ position, metrics, expected }) => {
    expect(conversationRestoreTop(position, metrics)).toBe(expected)
  })

  it('returns a task that was following to the actual new bottom', () => {
    expect(conversationRestoreTop({ ...reading, following: true }, { scrollHeight: 5000, clientHeight: 600 })).toBe(4400)
  })
})
