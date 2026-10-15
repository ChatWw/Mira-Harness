import { useEffect, useMemo, useState } from 'react'
import { miraFileTreeIcon } from '../../lib/mira-file-tree-icon'
import { MiraFileOpenButton } from './MiraFileOpenButton'
import type { HarnessFileChange } from '../../../../../src/config/harness'
import type { PilotController } from '../../state/pilot-state'
import { miraDeliverablePaths, miraDeliverableLabel } from '../../lib/mira-deliverable-files'

export function MiraDeliverableFiles({ content, changes, directory, controller, sessionId, active, onOpen }: {
  content: string; changes: HarnessFileChange[]; directory: string; controller: PilotController
  sessionId?: string; active: boolean; onOpen: (path: string) => void
}) {
  const paths = useMemo(() => miraDeliverablePaths(content, changes, directory), [content, changes, directory])
  const signature = JSON.stringify(paths)
  const [validated, setValidated] = useState<{ owner: string; paths: string[] }>()
  const owner = JSON.stringify([sessionId, directory, signature])
  useEffect(() => {
    if (!active || !sessionId || !paths.length) return
    let current = true
    const parents = [...new Set(paths.map(path => path.slice(0, path.lastIndexOf('/') + 1).replace(/\/$/, '')))]
    void Promise.all(parents.map(parent => controller.listFilesFor(sessionId, parent).then(result => result.entries.filter(entry => entry.type === 'file').map(entry => entry.path), () => []))).then(groups => {
      const existing = new Set(groups.flat())
      if (current) setValidated({ owner, paths: paths.filter(path => existing.has(path)) })
    })
    return () => { current = false }
  }, [active, sessionId, directory, signature, controller])
  if (!active || validated?.owner !== owner || !validated.paths.length) return null
  return <div className="mira-deliverable-files">{validated.paths.map(path => <div key={path} className="mira-deliverable-file">
    <div className="mira-deliverable-file__icon"><img src={miraFileTreeIcon(path)} width={24} height={24} alt="" /></div>
    <div><strong title={path}>{path.split('/').pop()}</strong><span>{miraDeliverableLabel(path)}</span></div>
    <MiraFileOpenButton path={path} directory={directory} controller={controller} sessionId={sessionId} active={active} onOpen={onOpen} />
  </div>)}</div>
}
