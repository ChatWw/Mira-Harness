import { useEffect, useId, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Folder, FolderPlus, LoaderCircle, Monitor, X } from 'lucide-react'
import type { HarnessProject } from '../../../../../src/config/harness'
import type { PilotController } from '../../state/pilot-state'

const leaf = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() || path

export function MiraProjectEditor({ project, controller, onClose, onSaved, onDelete }: {
  project?: HarnessProject
  controller: PilotController
  onClose(): void
  onSaved(project: HarnessProject): void
  onDelete?(project: HarnessProject): void
}) {
  const [name, setName] = useState(project?.name || '')
  const [roots, setRoots] = useState(() => project?.roots?.map(root => root.rootPath) || (project ? [project.directory] : []))
  const [primary, setPrimary] = useState(project?.directory || '')
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState('')
  const [trust, setTrust] = useState(false)
  const epoch = useRef(0)
  const pending = useRef(false)
  const cancelTrust = useRef<HTMLButtonElement>(null)
  const nameId = useId()
  useEffect(() => () => { epoch.current++ }, [])
  const browse = async () => {
    if (pending.current || picking) return
    const revision = ++epoch.current
    setPicking(true); setError('')
    try {
      const selected = await controller.selectProjectDirectories()
      if (revision !== epoch.current) return
      setRoots(previous => [...new Set([...previous, ...selected])])
      if (!primary && selected[0]) setPrimary(selected[0])
      if (!name.trim() && selected[0]) setName(leaf(selected[0]))
    } catch (cause) { if (revision === epoch.current) setError(cause instanceof Error ? cause.message : '选择文件夹失败，请重试。') }
    finally { if (revision === epoch.current) setPicking(false) }
  }
  const save = async () => {
    if (pending.current || !name.trim() || !roots.length) return
    pending.current = true; setBusy(true); setError('')
    try { onSaved(await controller.saveProject({ name: name.trim(), roots, primaryRoot: primary }, project?.id)) }
    catch (cause) { setTrust(false); setError(cause instanceof Error ? cause.message : '保存项目失败，请重试。') }
    finally { pending.current = false; setBusy(false) }
  }
  const locked = busy || picking
  return <Dialog.Root open onOpenChange={open => { if (!open && !locked) onClose() }}><Dialog.Portal container={document.getElementById('root')}>
    <Dialog.Content className="mira-project-editor" onEscapeKeyDown={event => { if (locked || trust) event.preventDefault() }} onPointerDownOutside={event => event.preventDefault()}>
      <Dialog.Title>{project ? '编辑项目' : '创建项目'}</Dialog.Title>
      <Dialog.Description className="sr-only">设置项目名称、源文件夹与主要目录</Dialog.Description>
      <button type="button" className="mira-project-editor__close" aria-label="关闭项目设置" disabled={locked} onClick={onClose}><X size={16} /></button>
      <form onSubmit={event => { event.preventDefault(); if (!locked && name.trim() && roots.length) { if (project) void save(); else setTrust(true) } }}>
        <fieldset disabled={locked}>
          <div className="mira-project-editor__field"><label htmlFor={nameId}>项目名称</label><input id={nameId} autoFocus maxLength={120} value={name} placeholder="新项目" onChange={event => setName(event.target.value)} /></div>
          {!project && <div className="mira-project-editor__field"><span>设备</span><div className="mira-project-editor__device"><Monitor size={16} /><span>此电脑</span></div></div>}
          <div className="mira-project-editor__field"><span id={`${nameId}-roots`}>源文件夹</span><div className={`mira-project-editor__roots${roots.length ? '' : ' is-empty'}`} role="group" aria-labelledby={`${nameId}-roots`}>
            {roots.map(root => <div className="mira-project-editor__root" key={root}><Folder size={16} /><span title={root}>{leaf(root)}</span>{root === primary ? <span className="mira-project-editor__primary">主要</span> : <button type="button" aria-label={`将 ${root} 设为主要`} onClick={() => setPrimary(root)}>设为主要</button>}<button type="button" aria-label={`移除源文件夹 ${root}`} disabled={roots.length === 1} title={roots.length === 1 ? '至少保留一个源文件夹' : '移除源文件夹'} onClick={() => { const next = roots.filter(item => item !== root); setRoots(next); if (primary === root) setPrimary(next[0] || '') }}><X size={16} /></button></div>)}
            <button type="button" className="mira-project-editor__browse" aria-label={roots.length ? '添加文件夹' : '选择文件夹'} onClick={() => { void browse() }}>{picking ? <LoaderCircle size={16} className="pilot-spin" /> : <FolderPlus size={16} />}<span>{roots.length ? '添加文件夹' : '选择文件夹'}</span>{!roots.length && <small>选择要添加到项目的文件夹</small>}</button>
          </div></div>
        </fieldset>
        {error && <p className="mira-project-editor__error" role="alert">{error}</p>}
        <div className="mira-project-editor__actions">{project && <button type="button" className="mira-project-editor__delete" disabled={locked} onClick={() => onDelete?.(project)}>删除项目</button>}<button type="button" disabled={locked} onClick={onClose}>取消</button><button type="submit" className="mira-project-editor__save" disabled={locked || !name.trim() || !roots.length}>{busy && <LoaderCircle size={14} className="pilot-spin" />}{project ? '保存' : '创建项目'}</button></div>
      </form>
      {trust && <Dialog.Root open onOpenChange={open => { if (!open && !busy) setTrust(false) }}><Dialog.Portal container={document.getElementById('root')}><Dialog.Content className="mira-project-editor mira-project-trust" onOpenAutoFocus={event => { event.preventDefault(); cancelTrust.current?.focus() }} onEscapeKeyDown={event => { if (busy) event.preventDefault() }} onPointerDownOutside={event => event.preventDefault()}>
        <Dialog.Title>{roots.length === 1 ? '信任此文件夹吗？' : '信任这些文件夹吗？'}</Dialog.Title><div className="mira-project-trust__details"><p>{name.trim()}</p><p>此电脑</p><ul>{roots.map(root => <li key={root}>{root}</li>)}</ul></div><Dialog.Description>Mira 可在当前权限设置允许的范围内读取、编辑这些文件夹中的文件，并运行命令。请仅在你信任列出的所有文件夹时继续。</Dialog.Description><div className="mira-project-editor__actions"><button ref={cancelTrust} type="button" disabled={busy} onClick={() => setTrust(false)}>取消</button><button type="button" className="mira-project-editor__save" disabled={busy} onClick={() => { void save() }}>{busy && <LoaderCircle size={14} className="pilot-spin" />}信任文件夹并创建</button></div>
      </Dialog.Content></Dialog.Portal></Dialog.Root>}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}
