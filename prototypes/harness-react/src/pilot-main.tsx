import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PilotController, type PilotHost } from './pilot-state'
import { PilotWorkbench } from './pilot-workbench'
import './pilot.css'

type PilotWindow = Window & {
  __POWERED_BY_WUJIE__?: boolean
  __WUJIE_MOUNT?: () => void
  __WUJIE_UNMOUNT?: () => void
  $wujie?: { props?: { theme?: string; host?: PilotHost }; bus: { $on: (event: string, listener: (theme: string) => void) => void; $off: (event: string, listener: (theme: string) => void) => void } }
}

const child = window as PilotWindow
let root: Root | undefined
let controller: PilotController | undefined

function setTheme(theme: string) { const container = document.getElementById('root'); if (container) container.dataset.theme = theme === 'dark' ? 'dark' : 'light' }
function mount() {
  const container = document.getElementById('root')
  if (!container || root) return
  setTheme(child.$wujie?.props?.theme || 'light')
  root = createRoot(container)
  const host = child.$wujie?.props?.host
  if (host) {
    controller = new PilotController(host)
    root.render(<React.StrictMode><PilotWorkbench controller={controller} /></React.StrictMode>)
    void controller.start()
    child.$wujie?.bus.$on('mira:harness-pilot-theme', setTheme)
    child.$wujie?.bus.$on('mira:harness-pilot-leave', unmount)
  } else root.render(<p className="pilot-unavailable">请从 Mira 桌面开发版打开此试验。</p>)
}
function unmount() {
  if (!root) return
  child.$wujie?.bus.$off('mira:harness-pilot-theme', setTheme)
  child.$wujie?.bus.$off('mira:harness-pilot-leave', unmount)
  controller?.dispose()
  controller = undefined
  root?.unmount()
  root = undefined
}
if (child.__POWERED_BY_WUJIE__) { child.__WUJIE_MOUNT = mount; child.__WUJIE_UNMOUNT = unmount }
else mount()
