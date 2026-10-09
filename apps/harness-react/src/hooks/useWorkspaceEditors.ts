import { useEffect, useRef, useState } from 'react'
import type { PilotController } from '../state/pilot-state'
import { selectWorkspaceEditor, type WorkspaceEditorInfo } from '../lib/workspace-editors'

const EDITOR_PREFERENCE_KEY = 'harness-react-editor'

export function useWorkspaceEditors(controller: PilotController) {
  const [editors, setEditors] = useState<WorkspaceEditorInfo[]>([])
  const [preferredId, setPreferredId] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [detectionError, setDetectionError] = useState<string>()
  const [preferenceError, setPreferenceError] = useState<string>()
  const [revision, setRevision] = useState(0)
  const [preferenceRevision, setPreferenceRevision] = useState(0)
  const explicitSelection = useRef(0)
  const hasSuccessfulSelection = useRef(false)
  const lifecycle = useRef({ controller, generation: 0, mounted: false })

  useEffect(() => {
    lifecycle.current = { controller, generation: lifecycle.current.generation + 1, mounted: true }
    hasSuccessfulSelection.current = false
    return () => { lifecycle.current.mounted = false; lifecycle.current.generation++ }
  }, [controller])

  useEffect(() => {
    let current = true
    setLoading(true)
    setDetectionError(undefined)
    void controller.listEditors(revision > 0).then(list => {
      if (current) setEditors(list)
    }).catch(cause => { if (current) setDetectionError(cause instanceof Error ? cause.message : '无法检测已安装的编辑器，请重试') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [controller, revision])

  useEffect(() => {
    let current = true
    void controller.getPreference(EDITOR_PREFERENCE_KEY).then(value => {
      if (!current) return
      setPreferenceError(undefined)
      // Failed launches do not supersede hydration; successful choices do, including during read retry.
      if (!hasSuccessfulSelection.current && typeof value === 'string') setPreferredId(value)
    }).catch(cause => { if (current) setPreferenceError(cause instanceof Error ? cause.message : '编辑器偏好读取失败，请重试') })
    return () => { current = false }
  }, [controller, preferenceRevision])

  async function open(sessionId: string, path: string, editorId: string, remember = false) {
    if (!editors.some(editor => editor.id === editorId)) throw new Error('该编辑器不可用，请重新选择打开方式')
    const selectionVersion = remember ? ++explicitSelection.current : undefined
    const generation = lifecycle.current.generation
    await controller.openFileInEditorFor(sessionId, path, editorId)
    if (remember && lifecycle.current.mounted && lifecycle.current.controller === controller && generation === lifecycle.current.generation && selectionVersion === explicitSelection.current) {
      hasSuccessfulSelection.current = true
      setPreferredId(editorId)
      await controller.setPreference(EDITOR_PREFERENCE_KEY, editorId, true)
    }
  }

  function retry() {
    setRevision(value => value + 1)
    if (preferenceError) setPreferenceRevision(value => value + 1)
  }

  return { editors, selectedEditor: selectWorkspaceEditor(editors, preferredId), loading, error: detectionError || preferenceError, retry, open }
}
