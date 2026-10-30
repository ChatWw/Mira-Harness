import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { getPlatformApi } from '@/platform'
import type { HarnessHistoryRow, HarnessProject } from '@/config/harness'

export function useArchiveManagement() {
  const rows = ref<HarnessHistoryRow[]>([]), projects = ref<HarnessProject[]>([])
  const query = ref(''), sort = ref<'updated' | 'created'>('updated'), project = ref('all')
  const loading = ref(false), busy = ref(false), error = ref(''), result = ref('')
  let mounted = true
  onUnmounted(() => { mounted = false })
  function api() {
    const host = getPlatformApi()
    if (!host) throw new Error('归档管理仅支持 Mira 桌面端')
    return host
  }
  const projectKey = (id?: string) => JSON.stringify(id ?? null)
  const options = computed(() => {
    const entries = new Map(projects.value.map(p => [projectKey(p.id), { key: projectKey(p.id), name: p.name }]))
    for (const row of rows.value) {
      const key = projectKey(row.projectId)
      if (!entries.has(key)) entries.set(key, { key, name: row.projectId ? `${row.projectName || '已移除的项目'} · 已移除` : '未分类' })
    }
    return [...entries.values()]
  })
  const groups = computed(() => {
    const filtered = rows.value.filter(row => row.title.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase()) && (project.value === 'all' || projectKey(row.projectId) === project.value))
    const time = sort.value === 'created' ? 'createdAt' : 'updatedAt'
    filtered.sort((a, b) => b[time] - a[time] || a.id.localeCompare(b.id))
    return options.value.map(option => ({ ...option, rows: filtered.filter(row => projectKey(row.projectId) === option.key) })).filter(group => group.rows.length)
  })
  const visibleRows = computed(() => groups.value.flatMap(group => group.rows))
  async function refresh() {
    if (loading.value) return
    loading.value = true; error.value = ''
    try {
      const host = api(), nextProjects = await host.listHarnessProjects()
      const next: HarnessHistoryRow[] = []
      let page = 1
      while (true) {
        const response = await host.queryHarnessHistory({ archiveView: 'archived', sort: 'updated-desc', page, pageSize: 100 })
        next.push(...response.rows)
        if (response.page * response.pageSize >= response.total || !response.rows.length) break
        page = response.page + 1
      }
      if (mounted) { rows.value = [...new Map(next.map(row => [row.id, row])).values()]; projects.value = nextProjects }
    } catch (cause) { if (mounted) error.value = cause instanceof Error ? cause.message : '读取归档会话失败' }
    finally { if (mounted) loading.value = false }
  }
  async function run(candidates: HarnessHistoryRow[], operation: 'restore' | 'delete') {
    if (busy.value || loading.value || error.value || !candidates.length) return
    // Freeze the selected identities before confirmation; later filters cannot expand this batch.
    const ids = [...new Set(candidates.map(row => row.id))]
    busy.value = true; result.value = ''
    try {
      if (operation === 'delete') {
        try { await ElMessageBox.confirm(`这 ${ids.length} 个会话及相关记录将被永久删除，无法恢复；磁盘文件不受影响。`, `删除 ${ids.length} 个归档会话？`, { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }) }
        catch (cause) { if (cause === 'cancel' || cause === 'close') return; throw cause }
      }
      if (!mounted) return
      const host = api()
      let succeeded = 0, failed = 0, skipped = 0
      for (const id of ids) {
        if (!mounted) break
        try {
          // A restored or running session is outside the confirmed archive selection.
          const current = await host.getHarnessSession(id)
          if (!current.archivedAt || current.activeRun || current.pendingInteraction?.status === 'waiting') { skipped++; continue }
          if (operation === 'restore') await host.restoreHarnessSessions([id])
          else await host.deleteHarnessSession(id)
          succeeded++
        } catch { failed++ }
      }
      if (mounted) { result.value = `已${operation === 'restore' ? '取消归档' : '删除'} ${succeeded} 个会话，失败 ${failed} 个，跳过 ${skipped} 个。`; await refresh() }
    } catch (cause) { if (mounted) result.value = cause instanceof Error ? cause.message : '归档操作失败，请重试' }
    finally { if (mounted) busy.value = false }
  }
  onMounted(refresh)
  return { rows, query, sort, project, options, groups, visibleRows, loading, busy, error, result, refresh, run }
}
