import type { HarnessFileReference, HarnessMessageSubmissionOptions, HarnessQueuedMessage, ModelSelection, PermissionMode, ThinkingLevel } from '../../../../src/config/harness'

export interface ComposerDraftConfig {
  permission: PermissionMode
  skillIds: string[]
  mcpIds: string[]
  delegation: boolean
  planning: boolean
  projectId?: string
}

export interface ComposerDraftSnapshot {
  drafts: Record<string, string>
  fileDrafts: Record<string, HarnessFileReference[]>
  config: ComposerDraftConfig
  recoveries?: Record<string, HarnessQueuedMessage[]>
  submissions?: Record<string, ComposerDraftSubmission | undefined>
}

export interface ComposerDraftSubmission {
  id: string
  text: string
  planning: boolean
  references: HarnessFileReference[]
  selection: ModelSelection
  options?: HarnessMessageSubmissionOptions
}

export function appendComposerReferences(existing: HarnessFileReference[], selected: HarnessFileReference[]): HarnessFileReference[] {
  const references = [...existing]
  for (const reference of selected) {
    if (!references.some(item => item.path === reference.path)) references.push(reference)
  }
  if (references.length > 12) throw new Error('一次最多引用 12 个文件，请先移除部分文件。')
  return references
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function ids(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())))] : []
}

function submission(value: unknown): ComposerDraftSubmission | undefined {
  const item = object(value), selection = object(item.selection)
  const text = (value: unknown, limit: number) => typeof value === 'string' && Boolean(value.trim()) && value.length <= limit && !value.includes('\0')
  if (!text(item.id, 128) || !text(item.text, 100_000) || !text(selection.providerId, 256) || !text(selection.modelId, 256)) return
  if (selection.thinkingLevel !== undefined && !['off', 'low', 'medium', 'high'].includes(selection.thinkingLevel as string)) return
  if (typeof item.planning !== 'boolean') return
  if (!Array.isArray(item.references) || item.references.length > 12) return
  const references: HarnessFileReference[] = []
  for (const raw of item.references) {
    const file = object(raw)
    if (!text(file.path, 4096) || !text(file.name, 256)) return
    if (!references.some(reference => reference.path === file.path)) references.push({ path: file.path as string, name: file.name as string })
  }
  let options: HarnessMessageSubmissionOptions | undefined
  if (item.options !== undefined) {
    if (!item.options || typeof item.options !== 'object' || Array.isArray(item.options)) return
    const raw = object(item.options)
    if (raw.delivery !== undefined && raw.delivery !== 'immediate' || raw.pausedQueueDecision !== undefined && raw.pausedQueueDecision !== 'retain' && raw.pausedQueueDecision !== 'discard') return
    if (raw.expectedRunId !== undefined && raw.expectedRunId !== null && !text(raw.expectedRunId, 128)) return
    if (raw.expectedQueueRevision !== undefined && (typeof raw.expectedQueueRevision !== 'number' || !Number.isSafeInteger(raw.expectedQueueRevision) || raw.expectedQueueRevision < 0)) return
    if (raw.expectedQueueItemIds !== undefined && (!Array.isArray(raw.expectedQueueItemIds) || raw.expectedQueueItemIds.length > 32 || raw.expectedQueueItemIds.some(id => !text(id, 128)) || new Set(raw.expectedQueueItemIds).size !== raw.expectedQueueItemIds.length)) return
    if ((raw.delivery || raw.pausedQueueDecision) && raw.expectedRunId === undefined || raw.pausedQueueDecision && (raw.expectedQueueRevision === undefined || raw.expectedQueueItemIds === undefined)) return
    options = { ...(raw.delivery ? { delivery: 'immediate' as const } : {}), ...(raw.pausedQueueDecision ? { pausedQueueDecision: raw.pausedQueueDecision as 'retain' | 'discard' } : {}), ...(raw.expectedRunId !== undefined ? { expectedRunId: raw.expectedRunId as string | null } : {}), ...(raw.expectedQueueRevision !== undefined ? { expectedQueueRevision: raw.expectedQueueRevision as number } : {}), ...(raw.expectedQueueItemIds !== undefined ? { expectedQueueItemIds: raw.expectedQueueItemIds as string[] } : {}) }
  }
  return { id: item.id as string, text: item.text as string, references, selection: { providerId: selection.providerId as string, modelId: selection.modelId as string, ...(selection.thinkingLevel ? { thinkingLevel: selection.thinkingLevel as ThinkingLevel } : {}) }, planning: item.planning, ...(options ? { options } : {}) }
}

function recovery(value: unknown, owner: string): HarnessQueuedMessage | undefined {
  const raw = object(value), item = submission(raw)
  if (!item || typeof raw.submissionId !== 'string' || !raw.submissionId.trim() || raw.submissionId.length > 128 || raw.submissionId.includes('\0') || raw.sessionId !== owner || !['default', 'auto-approve', 'full'].includes(raw.permissionMode as string) || typeof raw.createdAt !== 'number' || !Number.isFinite(raw.createdAt) || raw.createdAt < 0) return
  return { ...item, submissionId: raw.submissionId, sessionId: owner, permissionMode: raw.permissionMode as PermissionMode, createdAt: raw.createdAt }
}

/** Only restore known data fields; model credentials and file contents never belong in this snapshot. */
export function readComposerDrafts(value: unknown): ComposerDraftSnapshot {
  const raw = object(value)
  const config = object(raw.config)
  const drafts = Object.fromEntries(Object.entries(object(raw.drafts)).filter(([key, text]) => key && typeof text === 'string' && text.trim())) as Record<string, string>
  const fileDrafts = Object.fromEntries(Object.entries(object(raw.fileDrafts)).flatMap(([key, value]) => {
    if (!key || !Array.isArray(value)) return []
    const files: HarnessFileReference[] = []
    for (const item of value) {
      const file = object(item)
      if (typeof file.path === 'string' && file.path.trim() && typeof file.name === 'string' && file.name.trim() && !files.some(existing => existing.path === file.path)) files.push({ path: file.path, name: file.name })
    }
    return files.length ? [[key, files]] : []
  }))
  const recoveries = Object.fromEntries(Object.entries(object(raw.recoveries)).flatMap(([owner, value]) => {
    if (!owner || !Array.isArray(value)) return []
    const items: HarnessQueuedMessage[] = []
    for (const raw of value) {
      const item = recovery(raw, owner)
      if (item && !items.some(existing => existing.id === item.id)) items.push(item)
    }
    return items.length ? [[owner, items]] : []
  }))
  const submissions = Object.fromEntries(Object.entries(object(raw.submissions)).flatMap(([owner, value]) => {
    const item = submission(value)
    return owner && item ? [[owner, item]] : []
  }))
  return {
    drafts, fileDrafts,
    ...(Object.keys(recoveries).length ? { recoveries } : {}),
    ...(Object.keys(submissions).length ? { submissions } : {}),
    config: {
      permission: config.permission === 'full' || config.permission === 'auto-approve' ? config.permission : 'default',
      skillIds: ids(config.skillIds), mcpIds: ids(config.mcpIds),
      delegation: typeof config.delegation === 'boolean' ? config.delegation : true,
      planning: config.planning === true,
      ...(typeof config.projectId === 'string' && config.projectId.trim() ? { projectId: config.projectId } : {}),
    },
  }
}

/** Empty local entries are intentional clears and take precedence over a late preference response. */
export function mergeComposerDrafts(saved: ComposerDraftSnapshot, local: ComposerDraftSnapshot, editedConfig: ReadonlySet<keyof ComposerDraftConfig>): ComposerDraftSnapshot {
  return {
    drafts: { ...saved.drafts, ...local.drafts },
    fileDrafts: { ...saved.fileDrafts, ...local.fileDrafts },
    ...(saved.recoveries || local.recoveries ? { recoveries: { ...saved.recoveries, ...local.recoveries } } : {}),
    ...(saved.submissions || local.submissions ? { submissions: { ...saved.submissions, ...local.submissions } } : {}),
    config: { ...saved.config, ...Object.fromEntries([...editedConfig].map(key => [key, local.config[key]])) },
  }
}

export function serializeComposerDrafts(value: ComposerDraftSnapshot): ComposerDraftSnapshot {
  const snapshot = readComposerDrafts(value)
  if (JSON.stringify(snapshot).length > 262_144) throw new Error('草稿超过宿主保存上限，请先发送或精简部分草稿后再离开')
  return snapshot
}
