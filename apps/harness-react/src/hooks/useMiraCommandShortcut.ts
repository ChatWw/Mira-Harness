import { isMiraPrimaryModifier } from '../../../../src/platform/workbenchShortcuts'
import { useEffect, useRef } from 'react'
import type { PilotController } from '../state/pilot-state'
import { miraSessionCommand } from '../lib/mira-command-presentation'

const handlers = new Set<(event: KeyboardEvent) => boolean>()
export function dispatchMiraCommandShortcut(event: KeyboardEvent) {
  return [...handlers].some(handle => handle(event))
}

/** Current task commands take precedence over the sidebar's primary-modifier+B binding. */
export function useMiraCommandShortcut(controller: PilotController, active: boolean) {
  const pending = useRef(false)
  useEffect(() => {
    if (!active) return
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || !isMiraPrimaryModifier(event) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'b') return false
      if (document.querySelector('[role="dialog"]:not(.mira-conversation-find), [role="menu"][data-state="open"], dialog[open]')) return false
      const target = event.target instanceof Element ? event.target : document.activeElement
      // The selected output pane owns its precise record and operation feedback.
      if (target?.closest('.mira-command-pane, .xterm')) return false
      if (!target?.closest('.mira-prompt-editor') && target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return false
      const { session, sessionLoading } = controller.getSnapshot()
      if (sessionLoading || !session?.activeRun) return false
      const tool = [...session.toolCalls].reverse().find(tool => tool.tool === 'bash' && !tool.inherited && !tool.subtaskId && tool.runId === session.activeRun!.id && tool.commandJob?.mode === 'foreground' && tool.commandJob.status === 'running' && tool.commandJob.backgroundAllowed !== false)
      if (!tool || miraSessionCommand(session, session.id, tool.runId!, tool.id) !== tool) return false
      event.preventDefault(); event.stopPropagation()
      if (pending.current) return true
      pending.current = true
      void controller.commandAction(session.id, tool.runId!, tool.id, 'background')
        .catch(error => { if (controller.getSnapshot().session?.id === session.id) controller.reportError(error) })
        .finally(() => { pending.current = false })
      return true
    }
    // Sidebar dispatches here before consuming B; registration order is irrelevant.
    handlers.add(keydown)
    return () => { handlers.delete(keydown) }
  }, [controller, active])
}
