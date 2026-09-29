import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Workbench } from './workbench'
import { applyHostTheme, type HostThemeContext } from './theme'
import './style.css'

type WujieBus = { $on: (event: string, handler: (context: HostThemeContext) => void) => void; $off: (event: string, handler: (context: HostThemeContext) => void) => void }
type PrototypeWindow = Window & {
  __POWERED_BY_WUJIE__?: boolean
  __WUJIE_MOUNT?: () => void
  __WUJIE_UNMOUNT?: () => void
  $wujie?: { props?: { theme?: HostThemeContext }; bus: WujieBus }
}

const childWindow = window as PrototypeWindow
const container = document.getElementById('root')
let root: Root | undefined
let subscribed = false

function onThemeContext(context: HostThemeContext) { applyHostTheme(container, context) }

function mount() {
  if (!container || root) return
  applyHostTheme(container, childWindow.$wujie?.props?.theme || { theme: 'light' })
  root = createRoot(container)
  root.render(<React.StrictMode><Workbench /></React.StrictMode>)
  if (childWindow.$wujie && !subscribed) {
    childWindow.$wujie.bus.$on('mira:harness-prototype-theme', onThemeContext)
    subscribed = true
  }
}

function unmount() {
  if (subscribed) childWindow.$wujie?.bus.$off('mira:harness-prototype-theme', onThemeContext)
  subscribed = false
  root?.unmount()
  root = undefined
}

if (childWindow.__POWERED_BY_WUJIE__) {
  childWindow.__WUJIE_MOUNT = mount
  childWindow.__WUJIE_UNMOUNT = unmount
} else {
  mount()
}
