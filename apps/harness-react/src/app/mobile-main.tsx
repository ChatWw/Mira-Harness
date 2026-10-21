import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PilotController } from '../state/pilot-state'
import { createMobileHost } from '../platform/mobile-host'
import { MiraMobileWorkbench } from '../components/workbench/MiraMobileWorkbench'

// LAN HTTP lacks randomUUID; getRandomValues remains available on mobile browsers.
if (!crypto.randomUUID) Object.defineProperty(crypto, 'randomUUID', { value: () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
} })

// Copy still needs a user gesture; LAN HTTP does not expose the async Clipboard API.
if (!navigator.clipboard) Object.defineProperty(navigator, 'clipboard', { value: {
  writeText: (text: string) => new Promise<void>((resolve, reject) => {
    const input = document.createElement('textarea'); input.value = text
    input.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
    document.body.append(input); input.select()
    try { if (document.execCommand('copy')) resolve(); else reject(new Error('复制失败，请长按文本复制')) }
    finally { input.remove() }
  }),
} })

const accessKey = location.hash.slice(1)
history.replaceState(null, '', location.pathname)
function MobileApp() {
  const [controller] = useState(() => new PilotController(createMobileHost()))
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true, connecting = false
    const refresh = async () => {
      if (connecting) return
      connecting = true
      try {
        let response = await fetch('/connection')
        if (response.status === 401 && accessKey) response = await fetch('/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: accessKey, name: /iPad|Tablet/i.test(navigator.userAgent) ? '平板' : '手机' }) })
        const value = await response.json()
        if (!active) return
        if (!response.ok) throw new Error(value.error || '连接已失效，请重新扫码')
        setConnected(true); setError('')
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : '连接中断，正在重试；电脑上的任务会继续运行。') }
      finally { connecting = false }
    }
    void refresh(); const timer = setInterval(() => void refresh(), 3000)
    return () => { active = false; clearInterval(timer) }
  }, [])
  useEffect(() => { if (connected) void controller.start(); return () => { if (connected) controller.dispose() } }, [connected, controller])
  return connected ? <><MiraMobileWorkbench controller={controller} />{error && <div className="mobile-toast" role="alert">{error}</div>}</> : <main className="mobile-pair"><h1>连接 Mira</h1><p>{error || '正在连接电脑…'}</p>{error && <p>请确认电脑服务已开启，并重新扫描二维码。</p>}</main>
}
createRoot(document.getElementById('root')!).render(<MobileApp />)
