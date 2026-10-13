// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessSession, ToolCallRecord } from '../src/config/harness'
import type { PilotController, PilotState } from '../apps/harness-react/src/state/pilot-state'
import { useMiraCommandShortcut } from '../apps/harness-react/src/hooks/useMiraCommandShortcut'
import { useHarnessSessionShortcuts } from '../apps/harness-react/src/components/session/SessionSidebar'
import { MiraPromptEditor } from '../apps/harness-react/src/components/composer/MiraPromptEditor'

let root: Root | undefined
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.spyOn(navigator, 'platform', 'get').mockReturnValue('') })
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const command = (id = 'one', patch: Partial<ToolCallRecord> = {}): ToolCallRecord => ({ id, runId: 'run', tool: 'bash', status: 'running', createdAt: 1, commandJob: { mode: 'foreground', status: 'running', revision: 1, startedAt: 1 }, ...patch })
function controller(id: string) {
  const session = { id, activeRun: { id: 'run' }, toolCalls: [command()] } as HarnessSession
  const state = { session, sessionLoading: false } as PilotState
  const instance = { getSnapshot: () => state, commandAction: vi.fn(async () => undefined), reportError: vi.fn() }
  return { ...instance, state, controller: instance as unknown as PilotController }
}
async function mount() {
  const main = controller('main'), side = controller('side'), sidebar = vi.fn(), changed = vi.fn()
  let focused = 'main', active = true
  function Side() { useMiraCommandShortcut(side.controller, active && focused === 'side'); return <div className="side"><button>侧面对话</button></div> }
  function App() {
    useMiraCommandShortcut(main.controller, active && focused === 'main')
    useHarnessSessionShortcuts(() => undefined, () => undefined, sidebar)
    return <><MiraPromptEditor text="保留草稿" onChange={changed} aria-label="实际输入框" /><button>主对话</button><Side /><input /><textarea /><div className="xterm"><textarea /></div><div className="mira-command-pane"><button>面板</button></div></>
  }
  const container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container)
  const render = () => act(async () => root!.render(<App />)); await render()
  const key = async (options: KeyboardEventInit = {}, target: Element = container.querySelector('[aria-label="实际输入框"]')!) => {
    const event = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true, ...options })
    await act(async () => target.dispatchEvent(event)); return event
  }
  return { main, side, sidebar, changed, container, key, focus: async (id: string) => { focused = id; await render() }, deactivate: async () => { active = false; await render() } }
}

describe('foreground background shortcut routing', () => {
  it('retains explicit Control+B on macOS while an unavailable background action leaves the editor binding alone', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel')
    const view = await mount()
    expect((await view.key()).defaultPrevented).toBe(true)
    expect(view.main.commandAction).toHaveBeenCalledExactlyOnceWith('main', 'run', 'one', 'background')
    view.main.state.session!.toolCalls = []
    await view.key()
    expect(view.main.commandAction).toHaveBeenCalledOnce(); expect(view.sidebar).not.toHaveBeenCalled()
    await view.key({ ctrlKey: false, metaKey: true })
    expect(view.sidebar).toHaveBeenCalledOnce(); expect(view.changed).not.toHaveBeenCalled()
  })

  it('consumes Control+B before Lexical and sidebar, leaves text intact, and preserves Meta+B', async () => {
    const view = await mount()
    expect((await view.key()).defaultPrevented).toBe(true)
    expect(view.main.commandAction).toHaveBeenCalledExactlyOnceWith('main', 'run', 'one', 'background')
    expect(view.side.commandAction).not.toHaveBeenCalled(); expect(view.sidebar).not.toHaveBeenCalled(); expect(view.changed).not.toHaveBeenCalled()
    expect(view.container.querySelector('[aria-label="实际输入框"]')?.textContent).toBe('保留草稿')
    await view.key({ ctrlKey: false, metaKey: true }); expect(view.sidebar).toHaveBeenCalledOnce()
  })
  it('routes only the focused task and handles neutral conversation controls', async () => {
    const view = await mount(); await view.focus('side')
    await view.key()
    expect(view.side.commandAction).toHaveBeenCalledExactlyOnceWith('side', 'run', 'one', 'background')
    expect(view.main.commandAction).not.toHaveBeenCalled(); expect(view.sidebar).not.toHaveBeenCalled()
    await view.focus('main'); await view.key({}, view.container.querySelector('button')!)
    expect(view.main.commandAction).toHaveBeenCalledExactlyOnceWith('main', 'run', 'one', 'background')
  })
  it('selects the latest current-run root command and rejects ambiguous or restricted records', async () => {
    const view = await mount(), tools = view.main.state.session!.toolCalls
    tools.push(command('latest'), command('old', { runId: 'old-run' }), command('child', { subtaskId: 'child' }), command('inherited', { inherited: true }))
    await view.key(); expect(view.main.commandAction).toHaveBeenCalledExactlyOnceWith('main', 'run', 'latest', 'background')
    tools.push(command('latest')); view.main.commandAction.mockClear(); await view.key()
    expect(view.main.commandAction).not.toHaveBeenCalled(); expect(view.sidebar).toHaveBeenCalledOnce()
    tools.splice(0, tools.length, command('automation', { commandJob: { mode: 'foreground', status: 'running', revision: 1, startedAt: 1, backgroundAllowed: false } }))
    await view.key(); expect(view.main.commandAction).not.toHaveBeenCalled()
  })
  it('preserves terminal, output-pane and other editor shortcuts', async () => {
    const view = await mount()
    for (const target of view.container.querySelectorAll('input, textarea, .mira-command-pane button')) await view.key({}, target)
    expect(view.main.commandAction).not.toHaveBeenCalled()
  })
  it('ignores repeats, IME, modifier chords, loading tasks and open dialogs', async () => {
    const view = await mount()
    for (const options of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }, { altKey: true }, { shiftKey: true }, { ctrlKey: false }]) await view.key(options)
    view.main.state.sessionLoading = true; await view.key(); view.main.state.sessionLoading = false
    const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); document.body.append(dialog); await view.key(); dialog.remove()
    await view.deactivate(); await view.key()
    expect(view.main.commandAction).not.toHaveBeenCalled()
  })
  it('holds duplicate operations and reports rejection only in the original task', async () => {
    const view = await mount()
    let reject!: (error: Error) => void
    view.main.commandAction.mockImplementation(() => new Promise<void>((_resolve, fail) => { reject = fail }))
    await view.key(); await view.key(); expect(view.main.commandAction).toHaveBeenCalledOnce(); expect(view.sidebar).not.toHaveBeenCalled()
    await act(async () => reject(new Error('真实拒绝'))); expect(view.main.reportError).toHaveBeenCalledWith(expect.objectContaining({ message: '真实拒绝' }))
    view.main.reportError.mockClear(); await view.key(); view.main.state.session = { ...view.main.state.session!, id: 'another-task' }
    await act(async () => reject(new Error('旧任务拒绝'))); expect(view.main.reportError).not.toHaveBeenCalled()
  })
})
