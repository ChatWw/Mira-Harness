import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, CircleAlert, ExternalLink, RefreshCw } from 'lucide-react'
import type { MiraComputerSettingsHost, MiraComputerStatus } from '../../../../../src/config/miraComputerUse'

export function MiraComputerUseSettings({ host }: { host: MiraComputerSettingsHost }) {
  const [status, setStatus] = useState<MiraComputerStatus>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(false), working = useRef(false), revision = useRef(0)
  async function perform(operation: () => Promise<void>) {
    if (working.current) return
    const cycle = revision.current
    working.current = true; setBusy(true); setError('')
    try { await operation() }
    catch (cause) { if (active.current && cycle === revision.current) setError(cause instanceof Error ? cause.message : '无法读取电脑控制设置，请重新检测。') }
    finally { if (cycle === revision.current) { working.current = false; if (active.current) setBusy(false) } }
  }
  async function refresh() {
    const cycle = revision.current
    const value = await host.getComputerUseStatus()
    if (active.current && cycle === revision.current) setStatus(value)
  }
  useEffect(() => {
    active.current = true
    working.current = false; setStatus(undefined)
    void perform(refresh)
    const focus = () => { void perform(refresh) }
    window.addEventListener('focus', focus)
    return () => { active.current = false; revision.current++; window.removeEventListener('focus', focus) }
  }, [host])
  if (status && status.platform !== 'darwin') return null
  const ready = !error && status?.engineAvailable && status.screenRecording === true && status.accessibility === true && (!status.showCursor || status.cursorAvailable)
  const title = error ? '未能完成设置，请重试' : !status ? '正在检测使用条件…' : ready ? '已就绪，可以控制电脑' : '还需要完成设置'
  const permissions = [
    { key: 'screen-recording' as const, title: '屏幕录制权限', granted: status?.screenRecording, description: '用于截图和识别屏幕上的文字。' },
    { key: 'accessibility' as const, title: '辅助功能权限', granted: status?.accessibility, description: '用于点击、输入、按键、滚动和拖拽。' },
  ]
  return <section className="mira-computer-settings" aria-label="macOS 电脑控制设置" aria-busy={busy}>
    <div className="mira-computer-settings-heading"><h2>使用设置</h2><button type="button" disabled={busy} onClick={() => void perform(refresh)}><RefreshCw size={14} />{busy ? '检测中…' : '重新检测'}</button></div>
    <div className="mira-computer-readiness" role="status">
      {ready ? <CheckCircle2 size={18} className="mira-computer-ready" /> : <CircleAlert size={18} />}
      <div><strong>{title}</strong><p>{ready ? '操作时会按下方设置显示 Mira 光标。' : '请在系统设置中为 Mira 授权；开发环境可能显示为 Electron。授权后如系统提示，请退出并重新打开应用。'}</p></div>
    </div>
    {error && <p className="mira-market-error" role="alert">{error}</p>}
    {status?.error && <p className="mira-market-error" role="alert">{status.error}</p>}
    {status && <>
      <div className="mira-computer-setting-row"><div><strong>电脑控制组件</strong><p>{status.engineAvailable ? '已随 Mira 安装' : '组件缺失，请修复 Mira 安装；开发环境请运行 npm run tools:build。'}</p></div><span>{status.engineAvailable ? '已安装' : '缺失'}</span></div>
      {permissions.map(permission => <div className="mira-computer-setting-row" key={permission.key}>
        <div><strong>{permission.title}</strong><p>{permission.description}</p></div>
        <span className={permission.granted === true ? 'mira-computer-ready' : undefined}>{permission.granted === true ? '已开启' : permission.granted === false ? '未开启' : '未检测'}</span>
        {permission.granted !== true && <button type="button" disabled={busy} onClick={() => void perform(async () => { await host.openComputerUsePermission(permission.key); await refresh() })}>前往授权<ExternalLink size={13} /></button>}
      </div>)}
      <div className="mira-computer-setting-row"><div><strong>在屏幕上显示 Mira 光标</strong><p id="mira-computer-cursor-description">{status.cursorAvailable ? '操作时自动出现，任务结束或停止后退出。关闭后仍可执行电脑操作。' : '光标组件缺失，请修复 Mira 安装后重新检测。'}</p></div>
        <button className="mira-computer-switch" type="button" role="switch" aria-label="在屏幕上显示 Mira 光标" aria-describedby="mira-computer-cursor-description" aria-checked={status.showCursor} disabled={busy || !status.cursorAvailable} onClick={() => void perform(async () => { const cycle = revision.current, showCursor = !status.showCursor; await host.setComputerUseCursor(showCursor); if (active.current && cycle === revision.current) setStatus({ ...status, showCursor }) })}><span /></button>
      </div>
    </>}
  </section>
}
