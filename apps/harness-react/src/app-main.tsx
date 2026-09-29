import React from 'react'
import { createRoot } from 'react-dom/client'
import { PilotController } from './pilot-state'
import { PilotWorkbench } from './pilot-workbench'
import { FirstPartyHarnessHost } from './first-party-host'
import { applyHostTheme, type HostThemeContext } from './theme'

const container = document.getElementById('root')!
const root = createRoot(container)
let connected = false

window.addEventListener('message', event => {
  if (connected || event.source !== window.parent || event.data?.type !== 'mira:connect' || event.ports.length !== 1) return
  if (event.data.apiVersion?.major !== 1) return
  connected = true
  const host = new FirstPartyHarnessHost(event.ports[0])
  const controller = new PilotController(host)
  event.ports[0].addEventListener('message', message => {
    if (message.data?.type === 'mira:context') applyHostTheme(container, (message.data.context ?? {}) as HostThemeContext)
  })
  root.render(<React.StrictMode><PilotWorkbench controller={controller} /></React.StrictMode>)
  void controller.start()
  window.addEventListener('pagehide', () => { controller.dispose(); host.close() }, { once: true })
})

setTimeout(() => { if (!connected) root.render(<p className="pilot-unavailable">请从 Mira 桌面版打开 Harness。</p>) }, 3000)
