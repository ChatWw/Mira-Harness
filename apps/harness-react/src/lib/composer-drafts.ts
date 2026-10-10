import type { HarnessFileReference, HarnessMessageSubmissionOptions, HarnessQueuedMessage, ModelSelection, PermissionMode, ThinkingLevel } from '../../../../src/config/harness'
import { validateMiraPromptDocument, type MiraPromptDocument } from './prompt-editor-document'

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
  documents?: Record<string, MiraPromptDocument | undefined>
  config: ComposerDraftConfig
  recoveries?: Record<string, HarnessQueuedMessage[]>
  submissions?: Record<string, ComposerDraftSubmission | undefined>
  draft?: ComposerTaskDraft | null
}

export interface ComposerTaskDraft {
  id: string
  groupId?: string
  sessionId?: string
  visible?: boolean
}

export interface ComposerDraftSubmission {
  id: string
  text: string
  planning: boolean
  references: HarnessFileReference[]
  selection: ModelSelection
  options?: HarnessMessageSubmissionOptions
  draft?: ComposerTaskDraft
}

function taskDraft(value: unknown): ComposerTaskDraft | undefined {
  const raw = object(value)
  const validId = (id: unknown): id is string => typeof id === 'string' && Boolean(id.trim()) && id.length <= 128 && !id.includes('\0')
  if (!validId(raw.id) || raw.groupId !== undefined && !validId(raw.groupId) || raw.sessionId !== undefined && !validId(raw.sessionId) || raw.visible !== undefined && typeof raw.visible !== 'boolean') return
  return { id: raw.id, ...(raw.groupId ? { groupId: raw.groupId as string } : {}), ...(raw.sessionId ? { sessionId: raw.sessionId as string } : {}), ...(raw.visible === false ? { visible: false } : {}) }
}

export function appendComposerReferences(existing: HarnessFileReference[], selected: HarnessFileReference[]): HarnessFileReference[] {
  const references = [...existing]
  for (const reference of selected) {
    if (!references.some(item => item.path === reference.path)) references.push(reference)
  }
  if (references.length > 12) throw new Error('一次最多引用 12 个文件，请先移除部分文件。')
  const imageBytes = references.reduce((sum, file) => sum + (file.mediaType ? file.size || 0 : 0), 0)
  const textBytes = references.reduce((sum, file) => sum + (!file.mediaType ? file.size || 0 : 0), 0)
  if (imageBytes > 40 * 1024 * 1024 || textBytes > 1024 * 1024) throw new Error('附件总大小超过上限（图片 40 MiB，文本 1 MiB），请先移除部分附件。')
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
  if (!text(item.id, 128) || typeof item.text !== 'string' || item.text.length > 100_000 || item.text.includes('\0') || !text(selection.providerId, 256) || !text(selection.modelId, 256)) return
  if (selection.thinkingLevel !== undefined && !['off', 'low', 'medium', 'high'].includes(selection.thinkingLevel as string)) return
  if (typeof item.planning !== 'boolean') return
  if (!Array.isArray(item.references) || item.references.length > 12) return
  const references: HarnessFileReference[] = []
  for (const raw of item.references) {
    const file = object(raw)
    if (!text(file.path, 4096) || !text(file.name, 256)) return
    if (!references.some(reference => reference.path === file.path)) references.push(referenceMetadata(file.path as string, file.name as string, file))
  }
  if (!item.text.trim() && !references.length) return
  let options: HarnessMessageSubmissionOptions | undefined
  if (item.options !== undefined) {
    if (!item.options || typeof item.options !== 'object' || Array.isArray(item.options)) return
    const raw = object(item.options)
    if (raw.delivery !== undefined && raw.delivery !== 'immediate' && raw.delivery !== 'guide' || raw.pausedQueueDecision !== undefined && raw.pausedQueueDecision !== 'retain' && raw.pausedQueueDecision !== 'discard') return
    if (raw.expectedRunId !== undefined && raw.expectedRunId !== null && !text(raw.expectedRunId, 128)) return
    if (raw.expectedQueueRevision !== undefined && (typeof raw.expectedQueueRevision !== 'number' || !Number.isSafeInteger(raw.expectedQueueRevision) || raw.expectedQueueRevision < 0)) return
    if (raw.expectedQueueItemIds !== undefined && (!Array.isArray(raw.expectedQueueItemIds) || raw.expectedQueueItemIds.length > 32 || raw.expectedQueueItemIds.some(id => !text(id, 128)) || new Set(raw.expectedQueueItemIds).size !== raw.expectedQueueItemIds.length)) return
    if ((raw.delivery || raw.pausedQueueDecision) && raw.expectedRunId === undefined || raw.pausedQueueDecision && (raw.expectedQueueRevision === undefined || raw.expectedQueueItemIds === undefined)) return
    if (raw.delivery === 'guide' && (typeof raw.expectedRunId !== 'string' || raw.pausedQueueDecision !== undefined)) return
    options = { ...(raw.delivery ? { delivery: raw.delivery as 'immediate' | 'guide' } : {}), ...(raw.pausedQueueDecision ? { pausedQueueDecision: raw.pausedQueueDecision as 'retain' | 'discard' } : {}), ...(raw.expectedRunId !== undefined ? { expectedRunId: raw.expectedRunId as string | null } : {}), ...(raw.expectedQueueRevision !== undefined ? { expectedQueueRevision: raw.expectedQueueRevision as number } : {}), ...(raw.expectedQueueItemIds !== undefined ? { expectedQueueItemIds: raw.expectedQueueItemIds as string[] } : {}) }
  }
  return { id: item.id as string, text: item.text as string, references, selection: { providerId: selection.providerId as string, modelId: selection.modelId as string, ...(selection.thinkingLevel ? { thinkingLevel: selection.thinkingLevel as ThinkingLevel } : {}) }, planning: item.planning, ...(options ? { options } : {}), ...(taskDraft(item.draft) ? { draft: taskDraft(item.draft) } : {}) }
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
      if (typeof file.path === 'string' && file.path.trim() && typeof file.name === 'string' && file.name.trim() && !files.some(existing => existing.path === file.path)) files.push(referenceMetadata(file.path, file.name, file))
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
  const documents = Object.fromEntries(Object.entries(object(raw.documents)).flatMap(([owner, value]) => {
    if (!Object.prototype.hasOwnProperty.call(drafts, owner)) return []
    const document = validateMiraPromptDocument(value, drafts[owner])
    if (!document) return []
    // A restored file pill must still have an attachment owned by this draft.
    document.parts = document.parts.map(part => part.type === 'reference' && part.reference.kind === 'file' && !fileDrafts[owner]?.some(file => file.path === part.reference.value) ? { type: 'text' as const, text: part.reference.text } : part)
    return document.parts.some(part => part.type === 'reference') ? [[owner, document]] : []
  }))
  return {
    drafts, fileDrafts,
    ...(Object.keys(documents).length ? { documents } : {}),
    ...(raw.draft === null ? { draft: null } : taskDraft(raw.draft) ? { draft: taskDraft(raw.draft) } : {}),
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

function referenceMetadata(path: string, name: string, file: Record<string, unknown>): HarnessFileReference {
  return { path, name,
    ...(['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.mediaType as string) ? { mediaType: file.mediaType as HarnessFileReference['mediaType'] } : {}),
    ...(typeof file.size === 'number' && Number.isSafeInteger(file.size) && file.size >= 0 ? { size: file.size } : {}),
  }
}

/** Empty local entries are intentional clears and take precedence over a late preference response. */
export function mergeComposerDrafts(saved: ComposerDraftSnapshot, local: ComposerDraftSnapshot, editedConfig: ReadonlySet<keyof ComposerDraftConfig>): ComposerDraftSnapshot {
  return {
    drafts: { ...saved.drafts, ...local.drafts },
    fileDrafts: { ...saved.fileDrafts, ...local.fileDrafts },
    ...(saved.documents || local.documents ? { documents: { ...saved.documents, ...Object.fromEntries(Object.keys(local.drafts).map(owner => [owner, local.documents?.[owner]])), ...local.documents } } : {}),
    ...(saved.recoveries || local.recoveries ? { recoveries: { ...saved.recoveries, ...local.recoveries } } : {}),
    ...(saved.submissions || local.submissions ? { submissions: { ...saved.submissions, ...local.submissions } } : {}),
    ...(Object.prototype.hasOwnProperty.call(local, 'draft') ? { draft: local.draft } : saved.draft ? { draft: saved.draft } : {}),
    config: { ...saved.config, ...Object.fromEntries([...editedConfig].map(key => [key, local.config[key]])) },
  }
}

export function serializeComposerDrafts(value: ComposerDraftSnapshot): ComposerDraftSnapshot {
  const snapshot = readComposerDrafts(value)
  // Rich labels are optional; duplicated canonical bodies must never prevent saving a valid submission.
  if (JSON.stringify(snapshot).length > 262_144) delete snapshot.documents
  if (JSON.stringify(snapshot).length > 262_144) throw new Error('草稿超过宿主保存上限，请先发送或精简部分草稿后再离开')
  return snapshot
}

export function withoutComposerDraftOwners(value: ComposerDraftSnapshot, ids: ReadonlySet<string>): ComposerDraftSnapshot {
  const keep = <T,>(items: Record<string, T>) => Object.fromEntries(Object.entries(items).filter(([id]) => !ids.has(id)))
  return { ...value, drafts: keep(value.drafts), fileDrafts: keep(value.fileDrafts),
    ...(value.documents ? { documents: keep(value.documents) } : {}),
    ...(value.draft?.sessionId && ids.has(value.draft.sessionId) ? { draft: null } : {}),
    ...(value.recoveries ? { recoveries: keep(value.recoveries) } : {}),
    ...(value.submissions ? { submissions: keep(value.submissions) } : {}) }
}
