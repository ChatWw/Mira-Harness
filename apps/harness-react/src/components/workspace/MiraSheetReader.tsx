import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { XlsxViewer, setWasmSource, type XlsxViewerController } from '@extend-ai/react-xlsx'
import { installMiraDocumentLinks } from '../../lib/mira-document-links'

setWasmSource(new URL('office/duke_sheets_wasm_bg.wasm', document.baseURI).href)

function MiraSheetTabs({ controller }: { controller: XlsxViewerController }) {
  const { activeTabIndex, setActiveTabIndex, tabs } = controller
  if (tabs.length <= 1) return null
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
      : event.key === 'ArrowRight' ? (index + 1) % tabs.length : null
    if (next === null || event.altKey || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    setActiveTabIndex(next)
    const button = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]').item(next)
    button?.focus()
    button?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }
  return <div className="mira-sheet-reader__tabs" role="tablist" aria-label="工作簿工作表">
    {tabs.map((sheet, index) => <button key={sheet.id} type="button" role="tab" title={sheet.name}
      aria-selected={index === activeTabIndex} tabIndex={index === activeTabIndex ? 0 : -1}
      onClick={() => setActiveTabIndex(index)} onKeyDown={event => navigate(event, index)}>{sheet.name}</button>)}
  </div>
}

function MiraSheetFailure({ message, onError }: { message: string; onError(message: string): void }) {
  useEffect(() => { onError(message) }, [message, onError])
  return <div className="mira-file-preview__notice" role="alert">{message}</div>
}

export default function MiraSheetReader({ buffer, path, onOpenLink, onError }: {
  buffer: ArrayBuffer; path: string; onOpenLink?(url: string): void; onError(message: string): void
}) {
  const root = useRef<HTMLDivElement>(null)
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  useEffect(() => root.current ? installMiraDocumentLinks(root.current, onOpenLink) : undefined, [onOpenLink])
  const toolbar = useCallback((controller: XlsxViewerController) => <MiraSheetTabs controller={controller} />, [])
  return <div ref={root} className="mira-sheet-reader" aria-label="工作簿只读预览">
    <XlsxViewer file={buffer} fileName={path} height="100%" isDark={dark} readOnly rounded={false}
      showDefaultToolbar={false} toolbar={toolbar}
      loadingState={<div className="mira-sheet-reader__loading" role="status" aria-busy="true"><span>正在读取工作簿…</span><div aria-hidden="true" /></div>}
      emptyState={<div className="mira-file-preview__notice" role="status">此工作簿没有可显示的工作表。</div>}
      errorState={() => <MiraSheetFailure message="无法读取工作簿。文件可能损坏、受密码保护或格式不受支持，请确认文件后重试。" onError={onError} />}
      fileTooLargeState={() => <MiraSheetFailure message="工作簿超过 25 MiB 预览上限，请使用桌面表格应用打开。" onError={onError} />} />
  </div>
}
