import * as React from 'react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { MiraComposerAttachments } from '../apps/harness-react/src/components/composer/MiraComposerAttachments'
import { MiraAttachmentPreview } from '../apps/harness-react/src/components/composer/MiraAttachmentPreview'
import { UserMessageAttachments } from '../apps/harness-react/src/components/conversation/message-parts'
import { validateAttachmentFiles, readAttachmentFile } from '../apps/harness-react/src/lib/attachment-input'
import type { PilotController } from '../apps/harness-react/src/state/pilot-state'
import type { HarnessFileReference, HarnessMessageAttachment } from '../src/config/harness'

const hooks = vi.hoisted(() => ({ cursor: 0, dirty: false, slots: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }>, effects: [] as Array<() => void> }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => { const slot = hooks.slots[hooks.cursor++] ??= { value: initial }; return [slot.value, (value: unknown) => { slot.value = typeof value === 'function' ? value(slot.value) : value; hooks.dirty = true }] },
  useRef: (initial: unknown) => (hooks.slots[hooks.cursor++] ??= { value: { current: initial } }).value,
  useEffect: (callback: () => (() => void) | undefined, deps: readonly unknown[]) => {
    const slot = hooks.slots[hooks.cursor++] ??= {}
    if (!slot.deps || deps.some((value, index) => value !== slot.deps![index])) { slot.deps = deps; hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() }) }
  },
}))

function mounted(renderComponent: () => React.ReactNode) {
  let tree: React.ReactNode
  const visit = (node: React.ReactNode, match: (props: Record<string, unknown>, type: unknown) => boolean): Record<string, unknown> | undefined => {
    if (Array.isArray(node)) { for (const child of node) { const found = visit(child, match); if (found) return found } }
    if (!React.isValidElement<Record<string, unknown>>(node)) return
    if (match(node.props, node.type)) return node.props
    return visit(node.props.children as React.ReactNode, match)
  }
  const render = (beforeEffects?: () => void) => { hooks.cursor = 0; hooks.dirty = false; tree = renderComponent(); beforeEffects?.(); hooks.effects.splice(0).forEach(callback => callback()) }
  const drain = async () => { for (let i = 0; i < 15; i++) { await Promise.resolve(); if (hooks.dirty) render() } }
  const find = (match: (props: Record<string, unknown>, type: unknown) => boolean) => { const props = visit(tree, match); if (!props) throw new Error('Missing attachment control'); return props }
  render()
  return { render, drain, find, query: (match: Parameters<typeof find>[0]) => visit(tree, match), unmount: () => hooks.slots.forEach(slot => slot.cleanup?.()) }
}

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const image: HarnessMessageAttachment = { path: 'mira-attachment:image', name: '截图.png', mediaType: 'image/png', size: 70, content: 'frozen-image-bytes' }
beforeEach(() => { hooks.cursor = 0; hooks.dirty = false; hooks.slots = []; hooks.effects = []; vi.stubGlobal('React', React); vi.stubGlobal('document', { getElementById: () => null }) })
afterEach(() => { hooks.slots.forEach(slot => slot.cleanup?.()); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Mira attachment controls', () => {
  it('blocks pending images, loads the host snapshot, previews and removes the selected attachment', async () => {
    const read = deferred<HarnessMessageAttachment>(), onRemove = vi.fn(), onBlocked = vi.fn()
    const controller = { supportsAttachments: true, getAttachment: vi.fn(() => read.promise) } as unknown as PilotController
    const view = mounted(() => MiraComposerAttachments({ references: [image], ownerId: 'owner', controller, active: true, disabled: false, onRemove, onBlocked }))
    await view.drain(); expect(onBlocked).toHaveBeenLastCalledWith(true)
    read.resolve(image); await view.drain(); expect(onBlocked).toHaveBeenLastCalledWith(false)
    expect(view.find((_, type) => type === 'img').src).toBe('data:image/png;base64,frozen-image-bytes')
    ;(view.find(props => props['aria-label'] === '预览附件 截图.png').onClick as () => void)(); await view.drain()
    expect(view.find((_, type) => type === MiraAttachmentPreview).attachment).toEqual(image)
    ;(view.find(props => props['aria-label'] === '移除 截图.png').onClick as () => void)()
    expect(onRemove).toHaveBeenCalledExactlyOnceWith(image.path)
  })

  it('keeps failed reads blocked and retries without losing the reference', async () => {
    const getAttachment = vi.fn().mockRejectedValueOnce(new Error('附件不可读取')).mockResolvedValueOnce(image), onBlocked = vi.fn()
    const controller = { supportsAttachments: true, getAttachment } as unknown as PilotController
    const view = mounted(() => MiraComposerAttachments({ references: [image], ownerId: 'owner', controller, active: true, disabled: false, onRemove: vi.fn(), onBlocked }))
    await view.drain(); expect(onBlocked).toHaveBeenLastCalledWith(true)
    ;(view.find(props => props['aria-label'] === '重试附件 截图.png').onClick as () => void)(); await view.drain()
    expect(getAttachment).toHaveBeenCalledTimes(2); expect(onBlocked).toHaveBeenLastCalledWith(false)
  })

  it('ignores an old owner result, releases removed content and closes a hidden preview', async () => {
    const old = deferred<HarnessMessageAttachment>(), fresh = { ...image, path: 'mira-attachment:fresh', content: 'new-owner' }
    let ownerId = 'old', references: HarnessFileReference[] = [image], active = true
    const getAttachment = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(fresh), onBlocked = vi.fn()
    const controller = { supportsAttachments: true, getAttachment } as unknown as PilotController
    const view = mounted(() => MiraComposerAttachments({ references, ownerId, controller, active, disabled: false, onRemove: vi.fn(), onBlocked }))
    ownerId = 'fresh'; references = [fresh]; view.render(); await view.drain(); old.resolve(image); await view.drain()
    expect(view.find((_, type) => type === 'img').src).toBe('data:image/png;base64,new-owner')
    ;(view.find(props => props['aria-label'] === '预览附件 截图.png').onClick as () => void)(); await view.drain()
    active = false; view.render(); await view.drain()
    expect(view.find((_, type) => type === MiraAttachmentPreview).attachment).toBeUndefined()
    references = []; active = true; view.render(); await view.drain(); expect(onBlocked).toHaveBeenLastCalledWith(false)
  })

  it('reads each pending Composer attachment once when more files are appended', async () => {
    const first = deferred<HarnessMessageAttachment>(), second = deferred<HarnessMessageAttachment>()
    const other = { ...image, path: 'mira-attachment:second', name: '第二张.png' }
    let references: HarnessFileReference[] = [image]
    const getAttachment = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise), onBlocked = vi.fn()
    const controller = { supportsAttachments: true, getAttachment } as unknown as PilotController
    const view = mounted(() => MiraComposerAttachments({ references, ownerId: 'owner', controller, active: true, disabled: false, onRemove: vi.fn(), onBlocked }))
    references = [image, other]; view.render(); await view.drain()
    expect(getAttachment.mock.calls).toEqual([['owner', image.path], ['owner', other.path]])
    first.resolve(image); await view.drain(); expect(onBlocked).toHaveBeenLastCalledWith(true)
    second.resolve(other); await view.drain(); expect(onBlocked).toHaveBeenLastCalledWith(false)
  })

  it('does not revive a removed pending Composer attachment or reuse its late response when re-added', async () => {
    const old = deferred<HarnessMessageAttachment>(), fresh = { ...image, content: 'fresh bytes' }
    let references: HarnessFileReference[] = [image]
    const getAttachment = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(fresh), onBlocked = vi.fn()
    const controller = { supportsAttachments: true, getAttachment } as unknown as PilotController
    const view = mounted(() => MiraComposerAttachments({ references, ownerId: 'owner', controller, active: true, disabled: false, onRemove: vi.fn(), onBlocked }))
    references = []; view.render(); await view.drain()
    expect(onBlocked).toHaveBeenLastCalledWith(false)
    references = [image]; view.render(); await view.drain()
    old.resolve(image); await view.drain()
    expect(getAttachment).toHaveBeenCalledTimes(2)
    expect(view.find((_, type) => type === 'img').src).toBe('data:image/png;base64,fresh bytes')
  })

  it('re-reads legacy Composer file references after hiding and keeps the old preview closed', async () => {
    const file = { path: 'notes.txt', name: 'notes.txt' }, first = { ...file, content: 'version one' }, second = { ...file, content: 'version two' }
    let active = true
    const getAttachment = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    const controller = { supportsAttachments: true, getAttachment } as unknown as PilotController
    const view = mounted(() => MiraComposerAttachments({ references: [file], ownerId: 'owner', controller, active, disabled: false, onRemove: vi.fn(), onBlocked: vi.fn() }))
    await view.drain(); (view.find(props => props['aria-label'] === '预览附件 notes.txt').onClick as () => void)(); await view.drain()
    active = false; view.render(); await view.drain()
    expect(view.find((_, type) => type === MiraAttachmentPreview).attachment).toBeUndefined()
    active = true; view.render(); await view.drain()
    expect(getAttachment).toHaveBeenCalledTimes(2)
    expect(view.find((_, type) => type === MiraAttachmentPreview).attachment).toBeUndefined()
    ;(view.find(props => props['aria-label'] === '预览附件 notes.txt').onClick as () => void)(); await view.drain()
    expect(view.find((_, type) => type === MiraAttachmentPreview).attachment).toEqual(second)
  })

  it('previews persisted images and imported text without routing attachment tokens into workspace files', async () => {
    const onOpen = vi.fn(), view = mounted(() => UserMessageAttachments({ message: { id: 'u', role: 'user', content: '', attachments: [image, { path: 'mira-attachment:text', name: '粘贴.txt', content: 'actual text' }], createdAt: 1 }, onOpen }))
    ;(view.find(props => props.title === '截图.png').onClick as () => void)(); await view.drain()
    expect(view.find((_, type) => type === MiraAttachmentPreview).attachment).toEqual(image)
    ;(view.find(props => props.title === '粘贴.txt').onClick as () => void)(); await view.drain()
    expect((view.find((_, type) => type === MiraAttachmentPreview).attachment as HarnessMessageAttachment).content).toBe('actual text')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('loads visible historical image metadata once and keeps the original message free of image bytes', async () => {
    const pending = deferred<HarnessMessageAttachment>(), metadata = { ...image, content: '' }, onOpen = vi.fn()
    const message = { id: 'u', role: 'user' as const, content: '', attachments: [metadata], createdAt: 1 }
    const controller = { getAttachment: vi.fn(() => pending.promise) }
    const view = mounted(() => UserMessageAttachments({ message, sessionId: 'owner', controller, active: true, onOpen }))
    await view.drain()
    expect(controller.getAttachment).toHaveBeenCalledExactlyOnceWith('owner', image.path)
    expect(view.find(props => props['aria-label'] === '正在读取附件 截图.png')).toMatchObject({ disabled: true, 'aria-busy': true, className: 'mira-message-attachment--image' })
    expect(view.query((_, type) => type === 'img')).toBeUndefined()
    pending.resolve(image); await view.drain()
    expect(view.find((_, type) => type === 'img').src).toBe('data:image/png;base64,frozen-image-bytes')
    ;(view.find(props => props['aria-label'] === '预览附件 截图.png').onClick as () => void)(); await view.drain()
    expect(view.find((_, type) => type === MiraAttachmentPreview).attachment).toEqual(image)
    ;(view.find((_, type) => type === MiraAttachmentPreview).onClose as () => void)(); await view.drain(); view.render(); await view.drain()
    expect(controller.getAttachment).toHaveBeenCalledOnce()
    expect(message.attachments[0].content).toBe('')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('retries historical image read and decode errors locally instead of opening an attachment token as a file', async () => {
    const controller = { getAttachment: vi.fn().mockRejectedValueOnce(new Error('图片读取失败')).mockResolvedValue(image) }, onOpen = vi.fn()
    const view = mounted(() => UserMessageAttachments({ message: { id: 'u', role: 'user', content: '', attachments: [{ ...image, content: '' }], createdAt: 1 }, sessionId: 'owner', controller, active: true, onOpen }))
    await view.drain()
    expect(view.find(props => props.role === 'alert').children).toBe('图片读取失败')
    ;(view.find(props => props['aria-label'] === '重试附件 截图.png').onClick as () => void)(); await view.drain()
    expect(controller.getAttachment).toHaveBeenCalledTimes(2)
    ;(view.find((_, type) => type === 'img').onError as () => void)(); await view.drain()
    expect(view.find(props => props.role === 'alert').children).toContain('无法解码')
    ;(view.find(props => props['aria-label'] === '重试附件 截图.png').onClick as () => void)(); await view.drain()
    expect(controller.getAttachment).toHaveBeenCalledTimes(3)
    expect(view.find((_, type) => type === 'img').src).toContain(image.content)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('discards historical reads from another session and closes previews immediately during page hiding', async () => {
    const old = deferred<HarnessMessageAttachment>(), fresh = { ...image, content: 'fresh-owner' }
    let sessionId = 'old', active = true
    const controller = { getAttachment: vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue(fresh) }
    const message = { id: 'u', role: 'user' as const, content: '', attachments: [{ ...image, content: '' }], createdAt: 1 }
    const view = mounted(() => UserMessageAttachments({ message, sessionId, controller, active, onOpen: vi.fn() }))
    await view.drain(); sessionId = 'fresh'; view.render(); await view.drain(); old.resolve(image); await view.drain()
    expect(controller.getAttachment.mock.calls).toEqual([['old', image.path], ['fresh', image.path]])
    expect(view.find((_, type) => type === 'img').src).toBe('data:image/png;base64,fresh-owner')
    ;(view.find(props => props['aria-label'] === '预览附件 截图.png').onClick as () => void)(); await view.drain()
    active = false; view.render()
    expect(view.find((_, type) => type === MiraAttachmentPreview).attachment).toBeUndefined()
    await view.drain(); active = true; view.render(); await view.drain()
    expect(view.find((_, type) => type === MiraAttachmentPreview).attachment).toBeUndefined()
  })

  it('replaces a historical read after its controller changes and ignores completion after unmount', async () => {
    const old = deferred<HarnessMessageAttachment>(), pending = deferred<HarnessMessageAttachment>()
    const oldController = { getAttachment: vi.fn(() => old.promise) }, freshController = { getAttachment: vi.fn(() => pending.promise) }
    let controller = oldController
    const view = mounted(() => UserMessageAttachments({ message: { id: 'u', role: 'user', content: '', attachments: [{ ...image, content: '' }], createdAt: 1 }, sessionId: 'owner', controller, active: true, onOpen: vi.fn() }))
    await view.drain(); controller = freshController; view.render(); await view.drain(); old.resolve(image); await view.drain()
    expect(freshController.getAttachment).toHaveBeenCalledOnce()
    expect(view.query((_, type) => type === 'img')).toBeUndefined()
    view.unmount(); hooks.dirty = false; pending.resolve(image)
    for (let i = 0; i < 8; i++) await Promise.resolve()
    expect(hooks.dirty).toBe(false)
  })

  it('deduplicates historical image reads while another attachment is appended and drops removed results', async () => {
    const first = deferred<HarnessMessageAttachment>(), second = deferred<HarnessMessageAttachment>(), other = { ...image, path: 'mira-attachment:second', name: '第二张.png', content: '' }
    let attachments = [{ ...image, content: '' }]
    const controller = { getAttachment: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise) }
    const view = mounted(() => UserMessageAttachments({ message: { id: 'u', role: 'user', content: '', attachments, createdAt: 1 }, sessionId: 'owner', controller, active: true, onOpen: vi.fn() }))
    await view.drain(); attachments = [attachments[0], other]; view.render(); await view.drain()
    expect(controller.getAttachment.mock.calls).toEqual([['owner', image.path], ['owner', other.path]])
    attachments = [other]; view.render(); await view.drain(); first.resolve(image); second.resolve({ ...other, content: 'second-image' }); await view.drain()
    expect(view.find((_, type) => type === 'img').src).toBe('data:image/png;base64,second-image')
  })

  it('preflights image/text size and count before reading files', () => {
    const file = (name: string, size: number, type: string) => ({ name, size, type }) as File
    expect(() => validateAttachmentFiles([file('screen.png', 20 * 1024 * 1024, 'image/png')], 11)).not.toThrow()
    expect(() => validateAttachmentFiles([file('screen.png', 70, 'image/png')], 12)).toThrow('12')
    expect(() => validateAttachmentFiles([file('screen.heic', 70, 'image/heic')], 0)).toThrow('格式')
    expect(() => validateAttachmentFiles([file('screen.png', 20 * 1024 * 1024 + 1, 'image/png')], 0)).toThrow('上限')
    expect(() => validateAttachmentFiles([file('notes.txt', 256 * 1024 + 1, 'text/plain')], 0)).toThrow('上限')
    expect(() => validateAttachmentFiles([file('screen.png', 20 * 1024 * 1024, 'image/png')], 2, [{ mediaType: 'image/png', size: 40 * 1024 * 1024 }])).toThrow('总大小')
  })

  it('uses a fresh FileReader and propagates failures instead of publishing a ready chip', async () => {
    let reader: { result?: string; onload?: () => void; onerror?: () => void; readAsDataURL: (file: File) => void }
    vi.stubGlobal('FileReader', class { result = ''; onload?: () => void; onerror?: () => void; constructor() { reader = this } readAsDataURL = vi.fn() })
    const file = { name: '截图.png', type: 'image/png' } as File
    const success = readAttachmentFile(file); reader!.result = 'data:image/png;base64,abc='; reader!.onload!()
    await expect(success).resolves.toEqual({ name: '截图.png', mediaType: 'image/png', data: 'abc=' })
    const failure = readAttachmentFile(file); reader!.onerror!(); await expect(failure).rejects.toThrow('截图.png')
  })

  it('passes an ordered image gallery from Composer and history without including text attachments', async () => {
    const other = { ...image, path: 'mira-attachment:second', name: '第二张.png' }, text = { path: 'mira-attachment:text', name: '文本.txt', content: '文字' }
    const controller = { supportsAttachments: true, supportsAttachmentSave: true, getAttachment: vi.fn(async (_owner, path) => [image, other, text].find(file => file.path === path)), saveAttachment: vi.fn().mockResolvedValue({ status: 'canceled' }) } as unknown as PilotController
    const view = mounted(() => MiraComposerAttachments({ references: [image, text, other], ownerId: 'owner', controller, active: true, disabled: false, onRemove: vi.fn(), onBlocked: vi.fn() }))
    await view.drain(); (view.find(props => props['aria-label'] === '预览附件 第二张.png').onClick as () => void)(); await view.drain()
    const props = view.find((_, type) => type === MiraAttachmentPreview)
    expect((props.gallery as Array<{ path: string }>).map(file => file.path)).toEqual([image.path, other.path])
    expect(props.attachment).toEqual(other)
    await (props.onSave as (file: HarnessMessageAttachment) => Promise<unknown>)(other)
    expect(controller.saveAttachment).toHaveBeenCalledExactlyOnceWith('owner', other.path)
    view.unmount(); hooks.slots = []; hooks.effects = []
    const history = mounted(() => UserMessageAttachments({ message: { id: 'u', role: 'user', content: '', attachments: [image, text, other], createdAt: 1 }, sessionId: 'owner', controller, active: true, onOpen: vi.fn() }))
    ;(history.find(props => props.title === '第二张.png').onClick as () => void)(); await history.drain()
    expect((history.find((_, type) => type === MiraAttachmentPreview).gallery as Array<{ path: string }>).map(file => file.path)).toEqual([image.path, other.path])
  })

  it('cycles a gallery with buttons and arrows, resets zoom between images and bounds drag offsets', async () => {
    const other = { ...image, path: 'mira-attachment:second', name: '第二张.png' }
    let attachment: HarnessMessageAttachment | undefined = other
    const view = mounted(() => MiraAttachmentPreview({ attachment, gallery: [image, other].map(attachment => ({ path: attachment.path, name: attachment.name, attachment })), onClose: vi.fn() }))
    await view.drain()
    expect(view.find((_, type) => type === 'img').alt).toBe(other.name)
    ;(view.find((_, type) => type === 'img').onLoad as () => void)(); await view.drain()
    ;(view.find(props => props['aria-label'] === '放大图片').onClick as () => void)(); await view.drain()
    expect((view.find((_, type) => type === 'img').style as { transform: string }).transform).toContain('scale(1.5)')
    const body = view.find(props => props.className === 'mira-attachment-preview__body')
    ;(body.ref as { current: unknown }).current = { clientWidth: 100, clientHeight: 100 }
    ;(view.find((_, type) => type === 'img').ref as { current: unknown }).current = { offsetWidth: 100, offsetHeight: 100 }
    const target = { setPointerCapture: vi.fn(), hasPointerCapture: vi.fn(() => true), releasePointerCapture: vi.fn() }
    ;(body.onPointerDown as (event: unknown) => void)({ currentTarget: target, button: 0, pointerId: 1, clientX: 0, clientY: 0 })
    ;(body.onPointerMove as (event: unknown) => void)({ pointerId: 1, clientX: 1000, clientY: -1000 }); await view.drain()
    expect((view.find((_, type) => type === 'img').style as { transform: string }).transform).toBe('translate3d(25px, -25px, 0) scale(1.5)')
    ;(body.ref as { current: unknown }).current = { clientWidth: 100, clientHeight: 100, hasPointerCapture: target.hasPointerCapture, releasePointerCapture: target.releasePointerCapture }
    ;(view.find(props => props['aria-label'] === '下一张图片').onClick as () => void)(); await view.drain()
    expect(target.releasePointerCapture).toHaveBeenCalledWith(1)
    expect(view.find((_, type) => type === 'img').alt).toBe(image.name)
    expect((view.find((_, type) => type === 'img').style as { transform: string }).transform).toContain('scale(1)')
    const event = { key: 'ArrowLeft', nativeEvent: { isComposing: false }, preventDefault: vi.fn(), stopPropagation: vi.fn() }
    ;(view.find(props => Boolean(props.onKeyDown)).onKeyDown as (event: unknown) => void)(event); await view.drain()
    expect(view.find((_, type) => type === 'img').alt).toBe(other.name)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    attachment = undefined; view.render(); await view.drain(); attachment = other; view.render(); await view.drain()
    expect(view.find((_, type) => type === 'img').alt).toBe(other.name)
  })

  it('keeps gallery errors local, retries reads and ignores save feedback after closing', async () => {
    const failed = { path: 'mira-attachment:failed', name: '失败.png', error: '图片读取失败', onRetry: vi.fn() }
    const save = deferred<unknown>(), onSave = vi.fn(() => save.promise)
    let attachment: HarnessMessageAttachment | undefined = image
    const view = mounted(() => MiraAttachmentPreview({ attachment, gallery: [{ path: image.path, name: image.name, attachment: image }, failed], onSave, onClose: vi.fn() }))
    await view.drain(); (view.find(props => props['aria-label'] === '保存附件').onClick as () => void)(); await view.drain()
    expect(onSave).toHaveBeenCalledExactlyOnceWith(image)
    expect(view.find(props => props['aria-label'] === '保存附件').disabled).toBe(true)
    ;(view.find(props => props['aria-label'] === '下一张图片').onClick as () => void)(); await view.drain()
    expect(view.query((_, type) => type === 'img')).toBeUndefined()
    ;(view.find(props => props.children instanceof Array && props.children.includes('重试')).onClick as () => void)()
    expect(failed.onRetry).toHaveBeenCalledOnce()
    attachment = undefined; view.render(); await view.drain()
    save.reject(new Error('旧任务保存失败')); await view.drain()
    attachment = image; view.render(); await view.drain()
    expect(view.query(props => props.className === 'mira-attachment-preview__save-error')).toBeUndefined()
  })

  it('does not put an earlier image save error on the next gallery item', async () => {
    const save = deferred<unknown>(), other = { ...image, path: 'mira-attachment:second', name: '第二张.png' }
    const view = mounted(() => MiraAttachmentPreview({ attachment: image, gallery: [image, other].map(attachment => ({ path: attachment.path, name: attachment.name, attachment })), onSave: () => save.promise, onClose: vi.fn() }))
    await view.drain(); (view.find(props => props['aria-label'] === '保存附件').onClick as () => void)(); await view.drain()
    ;(view.find(props => props['aria-label'] === '下一张图片').onClick as () => void)(); await view.drain()
    save.reject(new Error('第一张保存失败')); await view.drain()
    expect(view.find((_, type) => type === 'img').alt).toBe(other.name)
    expect(view.query(props => props.className === 'mira-attachment-preview__save-error')).toBeUndefined()
    expect(view.find(props => props['aria-label'] === '保存附件').disabled).toBe(false)
  })

  it('keeps a cached image ready when load completes before passive effects after a retry read', async () => {
    let ready: HarnessMessageAttachment | undefined
    const view = mounted(() => MiraAttachmentPreview({ attachment: image, gallery: [{ path: image.path, name: image.name, attachment: ready }], onClose: vi.fn() }))
    await view.drain()
    ready = image
    view.render(() => { (view.find((_, type) => type === 'img').onLoad as () => void)() })
    await view.drain()
    expect((view.find((_, type) => type === 'img').style as { visibility: string }).visibility).toBe('visible')
    expect(view.find(props => props['aria-label'] === '放大图片').disabled).toBe(false)
    expect(view.query(props => props['aria-label'] === '正在加载图片')).toBeUndefined()
  })
})
