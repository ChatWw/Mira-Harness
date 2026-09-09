import type { HarnessFileReference, ModelSelection, PermissionMode } from '@/config/harness'

export interface HarnessSendAction {
  text: string
  attachments: HarnessFileReference[]
  activeSkillIds: string[]
  activeMcpServerIds: string[]
  projectId?: string
  permissionMode: PermissionMode
  modelSelection: ModelSelection
  planning: boolean
}

export function slashCommandQuery(text: string) {
  const match = /(?:^|\s)\/([^\s]*)$/.exec(text)
  return match ? match[1] : undefined
}

export function clearSlashCommand(text: string) {
  const match = /(^|\s)\/[^\s]*$/.exec(text)
  return match ? `${text.slice(0, match.index)}${match[1]}` : text
}

export function mergeHarnessAttachments(current: HarnessFileReference[], additions: HarnessFileReference[]) {
  const merged = current.map(file => ({ path: file.path, name: file.name }))
  const paths = new Set(merged.map(file => file.path))
  for (const file of additions) {
    if (paths.has(file.path)) continue
    merged.push({ path: file.path, name: file.name })
    paths.add(file.path)
  }
  return merged
}

export function createHarnessSendAction(action: HarnessSendAction): HarnessSendAction {
  return {
    text: action.text,
    attachments: action.attachments.map(file => ({ path: file.path, name: file.name })),
    activeSkillIds: [...action.activeSkillIds],
    activeMcpServerIds: [...action.activeMcpServerIds],
    projectId: action.projectId,
    permissionMode: action.permissionMode,
    modelSelection: {
      providerId: action.modelSelection.providerId,
      modelId: action.modelSelection.modelId,
      thinkingLevel: action.modelSelection.thinkingLevel,
    },
    planning: action.planning,
  }
}
