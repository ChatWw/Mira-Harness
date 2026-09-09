import { ref } from 'vue'
import type { HarnessFileReference, ModelSelection, PermissionMode, ThinkingLevel } from '@/config/harness'

const DRAFT_STORAGE_KEY = 'mira-harness-composer-drafts'
const MODEL_SELECTION_STORAGE_KEY = 'mira-harness-model-selection'

export interface HarnessComposerDraft {
  text: string
  projectId?: string
  modelSelection?: ModelSelection
  permissionMode?: PermissionMode
  activeSkillIds?: string[]
  activeMcpServerIds?: string[]
  attachments: HarnessFileReference[]
  updatedAt: number
}

function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return value === 'off' || value === 'low' || value === 'medium' || value === 'high'
}

function isPermissionMode(value: unknown): value is PermissionMode {
  return value === 'default' || value === 'auto-approve' || value === 'full'
}

function loadDrafts() {
  try {
    const value = JSON.parse(sessionStorage.getItem(DRAFT_STORAGE_KEY) || '{}') as Record<string, Partial<HarnessComposerDraft>>
    return Object.fromEntries(Object.entries(value).flatMap(([key, draft]) => {
      if (!draft || typeof draft.text !== 'string' || !Array.isArray(draft.attachments)) return []
      return [[key, {
        text: draft.text,
        projectId: typeof draft.projectId === 'string' ? draft.projectId : undefined,
        modelSelection: draft.modelSelection && typeof draft.modelSelection.providerId === 'string' && typeof draft.modelSelection.modelId === 'string'
          ? {
              providerId: draft.modelSelection.providerId,
              modelId: draft.modelSelection.modelId,
              thinkingLevel: isThinkingLevel(draft.modelSelection.thinkingLevel) ? draft.modelSelection.thinkingLevel : undefined,
            }
          : undefined,
        permissionMode: isPermissionMode(draft.permissionMode) ? draft.permissionMode : undefined,
        activeSkillIds: Array.isArray(draft.activeSkillIds)
          ? [...new Set(draft.activeSkillIds.filter((id): id is string => typeof id === 'string' && /^[a-f0-9]{16}$/.test(id)))]
          : undefined,
        activeMcpServerIds: Array.isArray(draft.activeMcpServerIds)
          ? [...new Set(draft.activeMcpServerIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())))]
          : undefined,
        attachments: draft.attachments.filter((file): file is HarnessFileReference => Boolean(file && typeof file.path === 'string' && typeof file.name === 'string')),
        updatedAt: typeof draft.updatedAt === 'number' ? draft.updatedAt : Date.now(),
      }]]
    })) as Record<string, HarnessComposerDraft>
  } catch {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY)
    return {} as Record<string, HarnessComposerDraft>
  }
}

function loadModelSelection(): ModelSelection | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(MODEL_SELECTION_STORAGE_KEY) || 'null') as Partial<ModelSelection> | null
    return value && typeof value.providerId === 'string' && typeof value.modelId === 'string'
      ? { providerId: value.providerId, modelId: value.modelId, thinkingLevel: isThinkingLevel(value.thinkingLevel) ? value.thinkingLevel : undefined }
      : undefined
  } catch {
    localStorage.removeItem(MODEL_SELECTION_STORAGE_KEY)
    return undefined
  }
}

export function createHarnessComposerState() {
  const drafts = ref<Record<string, HarnessComposerDraft>>(loadDrafts())
  const lastModelSelection = ref<ModelSelection | undefined>(loadModelSelection())

  function persistDrafts() {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts.value))
  }

  function ensureComposerDraft(key: string, projectId?: string) {
    if (!drafts.value[key]) {
      drafts.value = { ...drafts.value, [key]: { text: '', projectId, attachments: [], updatedAt: Date.now() } }
      persistDrafts()
    }
    return drafts.value[key]
  }

  function updateComposerDraft(key: string, patch: Partial<Pick<HarnessComposerDraft, 'text' | 'projectId' | 'attachments' | 'modelSelection' | 'permissionMode' | 'activeSkillIds' | 'activeMcpServerIds'>>) {
    const current = ensureComposerDraft(key)
    drafts.value = { ...drafts.value, [key]: { ...current, ...patch, updatedAt: Date.now() } }
    persistDrafts()
  }

  function removeComposerDraft(key: string) {
    if (!drafts.value[key]) return
    const next = { ...drafts.value }
    delete next[key]
    drafts.value = next
    persistDrafts()
  }

  function createDraft(projectId?: string) {
    const token = crypto.randomUUID()
    ensureComposerDraft(`draft:${token}`, projectId)
    if (lastModelSelection.value) updateComposerDraft(`draft:${token}`, { modelSelection: { ...lastModelSelection.value } })
    return token
  }

  function setLastModelSelection(selection: ModelSelection) {
    lastModelSelection.value = { ...selection }
    localStorage.setItem(MODEL_SELECTION_STORAGE_KEY, JSON.stringify(lastModelSelection.value))
  }

  return { drafts, lastModelSelection, ensureComposerDraft, updateComposerDraft, removeComposerDraft, createDraft, setLastModelSelection }
}
