import type { HarnessFileReference, PermissionMode } from '../../../../src/config/harness'

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
  return {
    drafts, fileDrafts,
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
    config: { ...saved.config, ...Object.fromEntries([...editedConfig].map(key => [key, local.config[key]])) },
  }
}

export function serializeComposerDrafts(value: ComposerDraftSnapshot): ComposerDraftSnapshot {
  const snapshot = readComposerDrafts(value)
  if (JSON.stringify(snapshot).length > 262_144) throw new Error('草稿超过宿主保存上限，请先发送或精简部分草稿后再离开')
  return snapshot
}
