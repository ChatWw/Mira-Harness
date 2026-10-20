// @vitest-environment happy-dom
import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiraProjectEditor } from '../apps/harness-react/src/components/session/MiraProjectEditor'
import type { PilotController } from '../apps/harness-react/src/state/pilot-state'
import type { HarnessProject } from '../src/config/harness'

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals() })
const project = { id: 'p', name: 'Project', directory: '/work', roots: [{ rootPath: '/work', isPrimary: true }] } as HarnessProject
async function fixture(edit = true) {
  const controller = {
    selectProjectDirectories: vi.fn(async () => ['/shared', '/shared']),
    saveProject: vi.fn(async () => project),
  }
  const onSaved = vi.fn(), onClose = vi.fn(), onDelete = vi.fn()
  function App() {
    const [open, setOpen] = useState(true)
    return open && <MiraProjectEditor project={edit ? project : undefined} controller={controller as unknown as PilotController} onClose={() => { onClose(); setOpen(false) }} onSaved={onSaved} onDelete={onDelete} />
  }
  await act(async () => root.render(<App />))
  const button = (label: string) => Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(node => (node.getAttribute('aria-label') || node.textContent?.trim()) === label)!
  const click = (node: HTMLElement) => act(async () => node.click())
  const submit = () => act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
  return { controller, onSaved, onClose, onDelete, button, click, submit }
}

describe('native React project editor', () => {
  it('keeps multi-root changes local until save and persists the selected primary once', async () => {
    const view = await fixture()
    expect(view.button('移除源文件夹 /work').disabled).toBe(true)
    await view.click(view.button('添加文件夹'))
    expect(container.querySelectorAll('.mira-project-editor__root')).toHaveLength(2)
    await view.click(view.button('将 /shared 设为主要'))
    expect(view.controller.saveProject).not.toHaveBeenCalled()
    await view.submit()
    expect(view.controller.saveProject).toHaveBeenCalledExactlyOnceWith({ name: 'Project', roots: ['/work', '/shared'], primaryRoot: '/shared' }, 'p')
    expect(view.onSaved).toHaveBeenCalledExactlyOnceWith(project)
  })

  it('requires an explicit trust choice, preserves a canceled draft and prevents duplicate creation', async () => {
    const view = await fixture(false)
    await view.click(view.button('选择文件夹')); await view.submit()
    expect(view.controller.saveProject).not.toHaveBeenCalled()
    const trust = container.querySelector('.mira-project-trust')!
    expect(trust.querySelector('button')).toBe(document.activeElement)
    await view.click(trust.querySelector('button')!)
    expect(container.querySelector('.mira-project-trust')).toBeNull()
    expect(container.querySelector<HTMLInputElement>('input')!.value).toBe('shared')
    await view.submit()
    let finish!: (value: HarnessProject) => void
    view.controller.saveProject.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const confirm = view.button('信任文件夹并创建')
    await view.click(confirm)
    expect(confirm.disabled).toBe(true)
    await view.click(confirm)
    expect(view.controller.saveProject).toHaveBeenCalledOnce()
    await act(async () => finish(project))
    expect(view.onSaved).toHaveBeenCalledOnce()
  })

  it('retains the draft and exposes a save error so the user can retry', async () => {
    const view = await fixture()
    await view.click(view.button('添加文件夹'))
    view.controller.saveProject.mockRejectedValueOnce(new Error('项目任务仍在运行'))
    await view.submit()
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('项目任务仍在运行')
    expect(container.querySelectorAll('.mira-project-editor__root')).toHaveLength(2)
    expect(view.onSaved).not.toHaveBeenCalled()
    await view.submit()
    expect(view.onSaved).toHaveBeenCalledOnce()
  })
})
