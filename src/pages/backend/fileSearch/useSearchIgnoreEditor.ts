import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { HARNESS_SEARCH_IGNORE_ERRORS, type HarnessWorkspaceSearchIgnoreDocument, type HarnessWorkspaceSearchIgnoreTarget, type HarnessWorkspaceSearchIgnoreTransform } from '@/config/harness'
import type { PlatformApi } from '@/types'

type IgnoreApi = Pick<PlatformApi, 'readHarnessWorkspaceSearchIgnore' | 'transformHarnessWorkspaceSearchIgnore' | 'writeHarnessWorkspaceSearchIgnore'>

export function useSearchIgnoreEditor(api: IgnoreApi | undefined) {
  const target = shallowRef<HarnessWorkspaceSearchIgnoreTarget>()
  const loaded = ref<HarnessWorkspaceSearchIgnoreDocument>()
  const draft = ref('')
  const busy = ref(false)
  const error = ref('')
  const status = ref('')
  let epoch = 0
  let active = true
  const dirty = computed(() => loaded.value !== undefined && draft.value !== loaded.value.content)
  const byteLength = computed(() => new TextEncoder().encode(draft.value).byteLength)
  const canSave = computed(() => !busy.value && !!loaded.value && byteLength.value <= 256 * 1024 && (dirty.value || loaded.value.source === 'template'))

  function showError(cause: unknown) {
    const message = cause instanceof Error ? cause.message : ''
    error.value = HARNESS_SEARCH_IGNORE_ERRORS.find(safe => message === safe || message.endsWith(`: ${safe}`)) ?? '搜索规则操作失败，请检查目录访问权限后重试'
  }

  async function load(nextTarget = target.value) {
    if (!active) return
    const version = ++epoch
    // Electron's bridge cannot clone Vue proxies; keep a plain request snapshot.
    const requestTarget = nextTarget ? { kind: nextTarget.kind, id: nextTarget.id } : undefined
    target.value = requestTarget
    loaded.value = undefined
    draft.value = ''
    error.value = ''
    status.value = ''
    busy.value = !!requestTarget
    if (!requestTarget) return
    try {
      if (!api) throw new Error('搜索规则操作失败，请检查目录访问权限后重试')
      const result = await api.readHarnessWorkspaceSearchIgnore(requestTarget)
      if (version !== epoch) return
      loaded.value = result
      draft.value = result.content
    } catch (cause) { if (version === epoch) showError(cause) }
    finally { if (version === epoch) busy.value = false }
  }

  async function transform(operation: HarnessWorkspaceSearchIgnoreTransform) {
    if (!api || busy.value || !target.value || !loaded.value) return
    const version = ++epoch
    busy.value = true
    error.value = ''
    status.value = ''
    try {
      const result = await api.transformHarnessWorkspaceSearchIgnore(target.value, draft.value, operation)
      if (version === epoch) draft.value = result.content
    } catch (cause) { if (version === epoch) showError(cause) }
    finally { if (version === epoch) busy.value = false }
  }

  async function save() {
    if (!api || !canSave.value || !target.value || !loaded.value) return
    const version = ++epoch
    const content = draft.value
    busy.value = true
    error.value = ''
    status.value = ''
    try {
      const result = await api.writeHarnessWorkspaceSearchIgnore(target.value, content, loaded.value.revision)
      if (version !== epoch) return
      loaded.value = result
      status.value = '已保存'
    } catch (cause) { if (version === epoch) showError(cause) }
    finally { if (version === epoch) busy.value = false }
  }

  function revert() {
    if (busy.value || !loaded.value) return
    draft.value = loaded.value.content
    error.value = ''
    status.value = ''
  }

  onScopeDispose(() => { active = false; epoch++ })
  return { target, loaded, draft, busy, error, status, dirty, byteLength, canSave, load, transform, save, revert }
}
