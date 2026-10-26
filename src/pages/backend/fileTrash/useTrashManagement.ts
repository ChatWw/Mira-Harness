import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getPlatformApi } from '@/platform'
import type { HarnessTrashEntry } from '@/config/harness'

export function useTrashManagement() {
  const rows = ref<HarnessTrashEntry[]>([])
  const query = ref(''), sort = ref<'newest' | 'oldest'>('newest'), project = ref('all')
  const loading = ref(false), busy = ref(false), error = ref(''), result = ref('')
  let mounted = true
  onUnmounted(() => { mounted = false })
  function api() {
    const host = getPlatformApi()
    if (!host) throw new Error('回收站仅支持 Mira 桌面端')
    return host
  }
  const options = computed(() => [...new Map(rows.value.map(row => [row.projectId, { key: row.projectId, name: row.projectName }])).values()])
  const groups = computed(() => {
    const search = query.value.trim().toLocaleLowerCase()
    const filtered = rows.value.filter(row => (project.value === 'all' || row.projectId === project.value) && (!search || row.paths.some(path => path.toLocaleLowerCase().includes(search))))
    filtered.sort((a, b) => (sort.value === 'newest' ? b.deletedAt - a.deletedAt : a.deletedAt - b.deletedAt) || a.token.localeCompare(b.token))
    return options.value.map(option => ({ ...option, rows: filtered.filter(row => row.projectId === option.key) })).filter(group => group.rows.length)
  })
  async function refresh() {
    if (loading.value) return
    loading.value = true; error.value = ''
    try {
      const next = await api().listHarnessTrash()
      if (mounted) {
        rows.value = next
        if (project.value !== 'all' && !next.some(row => row.projectId === project.value)) project.value = 'all'
      }
    }
    catch (cause) { if (mounted) error.value = cause instanceof Error ? cause.message : '读取回收站失败' }
    finally { if (mounted) loading.value = false }
  }
  async function restore(candidates: HarnessTrashEntry[]) {
    if (busy.value || loading.value || error.value || !candidates.length) return
    const entries = [...new Map(candidates.map(row => [`${row.projectId}:${row.token}`, row])).values()]
    busy.value = true; result.value = ''
    let succeeded = 0
    const failures: string[] = []
    try {
      const host = api()
      for (const row of entries) {
        if (!mounted) break
        try { await host.restoreHarnessTrash(row.projectId, row.token); succeeded++ }
        catch (cause) { failures.push(`${row.paths[0] || '文件'}：${cause instanceof Error ? cause.message : '还原失败'}`) }
      }
      if (mounted) { result.value = failures.length ? `已还原 ${succeeded} 项，失败 ${failures.length} 项。${failures[0]}` : `已还原 ${succeeded} 项`; await refresh() }
    } catch (cause) { if (mounted) result.value = cause instanceof Error ? cause.message : '还原失败，请重试' }
    finally { if (mounted) busy.value = false }
  }
  onMounted(refresh)
  return { rows, query, sort, project, options, groups, loading, busy, error, result, refresh, restore }
}
