import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PilotController, type PilotHost } from '../state/pilot-state'
import { HarnessWorkbench } from '../components/workbench/HarnessWorkbench'
import { applyHostTheme, type HostThemeContext } from '../platform/theme'
import { miraCodeHighlightWorker } from '../lib/code-highlight-worker-client'

type PilotWindow = Window & {
  __POWERED_BY_WUJIE__?: boolean
  __WUJIE_MOUNT?: () => void
  __WUJIE_UNMOUNT?: () => void
  $wujie?: { props?: { theme?: HostThemeContext; host?: PilotHost }; bus: { $on: (event: string, listener: (context: HostThemeContext) => void) => void; $off: (event: string, listener: (context: HostThemeContext) => void) => void } }
}

const child = window as PilotWindow
let root: Root | undefined
let controller: PilotController | undefined
let containerRef: HTMLElement | undefined

function onThemeContext(context: HostThemeContext) { applyHostTheme(containerRef, context) }

function mount() {
  const container = document.getElementById('root')
  if (!container || root) return
  containerRef = container
  applyHostTheme(container, child.$wujie?.props?.theme || { theme: 'light' })
  root = createRoot(container)
  const host = child.$wujie?.props?.host
  if (host) {
    controller = new PilotController(host)
    root.render(<React.StrictMode><HarnessWorkbench controller={controller} /></React.StrictMode>)
    void controller.start()
    child.$wujie?.bus.$on('mira:harness-pilot-theme', onThemeContext)
    child.$wujie?.bus.$on('mira:harness-pilot-leave', unmount)
  } else root.render(<p className="pilot-unavailable">请从 Mira 桌面开发版打开此试验。</p>)
}
function unmount() {
  if (!root) return
  child.$wujie?.bus.$off('mira:harness-pilot-theme', onThemeContext)
  child.$wujie?.bus.$off('mira:harness-pilot-leave', unmount)
  controller?.dispose()
  controller = undefined
  root?.unmount()
  miraCodeHighlightWorker.dispose()
  root = undefined
  containerRef = undefined
}
if (child.__POWERED_BY_WUJIE__) { child.__WUJIE_MOUNT = mount; child.__WUJIE_UNMOUNT = unmount }
else mount()
