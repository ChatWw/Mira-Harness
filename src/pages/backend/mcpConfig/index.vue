<template>
  <SettingsPageShell title="MCP 服务" wide>
    <div class="mcp-page">
      <h2 class="mcp-page__title">MCP 服务器</h2>
      <p class="mcp-page__desc">连接本地进程或远程 MCP 服务，为智能体提供工具。回到工作台，通过 /mcp 选择当前会话可用的服务。</p>
      <div class="mcp-toolbar">
        <label class="mcp-scope-label">配置范围<el-select :model-value="workspace" :disabled="scopeChanging || operationsPending" aria-label="MCP 配置范围" @update:model-value="selectWorkspace">
          <el-option label="全局" value="global" /><el-option v-for="project in projects" :key="project.id" :label="project.name" :value="project.id" :disabled="!project.directoryExists" />
        </el-select></label>
        <el-button :loading="loading" aria-label="刷新 MCP 服务器" @click="load()">刷新</el-button>
        <el-button type="primary" :disabled="saving || scopeChanging" aria-label="添加 MCP 服务器" @click="openCreate"><AppIcon name="Plus" />添加服务器</el-button>
      </div>
      <p v-if="workspace !== 'global'" class="mcp-scope-hint">项目配置：{{ projectConfigPath }}。仅此项目的任务可用，任务启动时连接。</p>
      <div v-if="projectsError" class="mcp-error" role="alert"><span>{{ projectsError }}</span><el-button text aria-label="重试加载 MCP 项目范围" @click="loadProjects">重试</el-button></div>
      <div v-if="loadError" class="mcp-error" role="alert"><span>{{ loadError }}</span><el-button text :loading="loading" aria-label="重试加载 MCP 服务器" @click="load()">重试</el-button></div>

      <section v-if="visible" class="mcp-editor" aria-label="MCP 服务器配置">
        <h3>{{ form.id ? '编辑服务器' : '添加服务器' }}</h3>
        <el-form label-position="top" :disabled="saving || !!rowPending[form.id || '']">
          <el-form-item label="名称"><el-input v-model="form.name" aria-label="MCP 服务器名称" placeholder="例如 filesystem" /></el-form-item>
          <el-form-item label="传输协议">
            <el-select v-model="form.type" aria-label="MCP 传输协议">
              <el-option label="本地进程（stdio）" value="stdio" /><el-option label="Streamable HTTP" value="streamableHttp" /><el-option label="SSE" value="sse" />
            </el-select>
          </el-form-item>
          <template v-if="form.type === 'stdio'">
            <el-form-item label="启动命令"><el-input v-model="form.command" aria-label="MCP 启动命令" placeholder="例如 npx 或 /usr/bin/node" /></el-form-item>
            <el-form-item label="参数（每行一个）"><el-input v-model="form.argsText" aria-label="MCP 启动参数" type="textarea" :rows="3" placeholder="-y&#10;@modelcontextprotocol/server-filesystem&#10;/Users/me" /></el-form-item>
            <el-form-item label="环境变量（可选，JSON）"><el-input v-model="form.envText" aria-label="MCP 环境变量 JSON" type="textarea" :rows="3" placeholder='{"MY_API_KEY": "your-key"}' /></el-form-item>
          </template>
          <template v-else>
            <el-form-item label="服务 URL"><el-input v-model="form.url" aria-label="MCP 服务 URL" placeholder="https://mcp.example.com/mcp" /></el-form-item>
            <el-form-item label="认证方式"><el-select v-model="form.authentication" aria-label="MCP 认证方式"><el-option label="请求头 / 无认证" value="headers" /><el-option label="浏览器登录（OAuth）" value="oauth" /></el-select></el-form-item>
            <p v-if="form.authentication === 'oauth'" class="mcp-scope-hint">保存后在服务行打开浏览器授权，登录完成后自动更新连接状态。</p>
            <el-form-item label="请求头（可选，JSON）"><el-input v-model="form.headersText" aria-label="MCP 请求头 JSON" type="textarea" :rows="3" placeholder='{"Authorization": "Bearer your-token"}' /></el-form-item>
          </template>
          <el-form-item label="启用"><el-switch v-model="form.enabled" aria-label="启用 MCP 服务器" /></el-form-item>
        </el-form>
        <p v-if="saveError" class="mcp-error" role="alert">{{ saveError }}</p>
        <div class="mcp-editor__actions"><el-button type="primary" :loading="saving" :disabled="saving || !!rowPending[form.id || '']" aria-label="保存 MCP 服务器" @click="save">保存</el-button><el-button :disabled="saving" aria-label="取消 MCP 编辑" @click="cancelEdit">取消</el-button></div>
      </section>

      <div v-if="loading && !servers.length && !loadError" class="mcp-loading" aria-label="正在加载 MCP 服务器"><el-skeleton :rows="3" animated /></div>
      <div v-else-if="servers.length" class="mcp-list">
        <article v-for="server in servers" :key="server.id" class="mcp-row" :data-mcp-id="server.id" :data-mcp-scope="isProjectServer(server) ? 'project' : 'global'" :data-mcp-type="server.type || 'stdio'" :data-mcp-status="server.connection?.state || 'unknown'" :data-mcp-tool-count="server.connection?.toolCount">
          <div class="mcp-row__identity">
            <span class="mcp-row__mark"><AppIcon name="Connection" /><span class="mcp-row__dot" :class="`mcp-row__dot--${server.enabled ? server.connection?.state || 'unknown' : 'disabled'}`" :title="statusLabel(server)" /></span>
            <div class="mcp-row__details">
              <h3>{{ server.name }} <el-tag size="small" effect="plain">{{ statusLabel(server) }}</el-tag><span v-if="server.connection?.state === 'connected' && server.enabled" class="mcp-row__count">{{ server.connection.toolCount }} 个工具</span></h3>
              <p :title="endpointLabel(server)">{{ endpointLabel(server) }}</p>
              <p v-if="server.connection?.error && server.enabled" class="mcp-error" role="alert">{{ safeError(server.connection.error) }}</p>
              <p v-if="rowErrors[server.id]" class="mcp-error" role="alert">{{ rowErrors[server.id] }}</p>
            </div>
          </div>
          <div class="mcp-row__actions">
            <el-button v-if="server.authentication === 'oauth' && server.connection?.state !== 'connected' && server.connection?.state !== 'authorized'" text :loading="rowPending[server.id] === 'authorize'" :disabled="!server.enabled || !!rowPending[server.id]" :aria-label="`打开授权 ${server.name}`" @click="authorize(server)"><AppIcon name="Link" />打开授权</el-button>
            <el-button v-if="!isProjectServer(server)" text :loading="rowPending[server.id] === 'reconnect'" :disabled="!server.enabled || !!rowPending[server.id]" :aria-label="`重新连接 ${server.name}`" @click="reconnect(server)">重新连接</el-button>
            <el-button text circle :disabled="saving || !!rowPending[server.id]" :aria-label="`编辑 ${server.name}`" :title="`编辑 ${server.name}`" @click="edit(server)"><AppIcon name="EditPen" /></el-button>
            <el-button text circle type="danger" :loading="rowPending[server.id] === 'delete'" :disabled="saving || !!rowPending[server.id]" :aria-label="`删除 ${server.name}`" :title="`删除 ${server.name}`" @click="remove(server)"><AppIcon name="Delete" /></el-button>
          </div>
        </article>
      </div>
      <div v-else-if="!loadError" class="mcp-empty"><strong>还没有配置 MCP 服务器</strong><p>支持本地 stdio、Streamable HTTP 和 SSE。添加并启用后，可在工作台的 /mcp 面板中选择。</p></div>
      <p v-if="notice" class="mcp-notice" role="status">{{ notice }}</p>
    </div>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { getPlatformApi } from '@/platform'
import type { MiraMcpServerRecord, MiraMcpTransport } from '@/config/miraMcp'
import type { HarnessProject } from '@/config/harness'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

interface McpForm { id?: string, name: string, type: MiraMcpTransport, command: string, argsText: string, envText: string, url: string, headersText: string, authentication: 'headers' | 'oauth', enabled: boolean }
const emptyForm = (): McpForm => ({ name: '', type: 'stdio', command: '', argsText: '', envText: '', url: '', headersText: '', authentication: 'headers', enabled: true })
const servers = ref<MiraMcpServerRecord[]>([])
const loading = ref(false), visible = ref(false), saving = ref(false)
const loadError = ref(''), saveError = ref(''), notice = ref('')
const rowErrors = ref<Record<string, string>>({}), rowPending = ref<Record<string, 'delete' | 'reconnect' | 'authorize'>>({})
let authorizingId = ''
const form = ref<McpForm>(emptyForm())
const workspace = ref('global'), projects = ref<HarnessProject[]>([]), projectsError = ref(''), scopeChanging = ref(false)
const operationsPending = computed(() => saving.value || Object.keys(rowPending.value).length > 0)
const projectConfigPath = computed(() => {
  const project = projects.value.find(project => project.id === workspace.value)
  return project ? `${project.directory.replace(/[\\/]+$/, '')}/.mira/mcp.json` : '.mira/mcp.json'
})
let savedDraft = '', loadSequence = 0, pollAttempts = 0, disposed = false
let pollTimer: ReturnType<typeof setTimeout> | undefined

function api() {
  const value = getPlatformApi()
  if (!value) throw new Error('桌面服务不可用，请重启后重试')
  return value
}
function jsonValues(source: string): string[] {
  try { return Object.values(JSON.parse(source)).filter((value): value is string => typeof value === 'string' && !!value) } catch { return [] }
}
function safeError(error: unknown): string {
  let text = (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '')
  const secrets = [...servers.value.flatMap(server => [...Object.values(server.headers || {}), ...Object.values(server.env || {})]), ...jsonValues(form.value.headersText), ...jsonValues(form.value.envText)]
  for (const secret of secrets.sort((a, b) => b.length - a.length)) {
    if (secret) text = text.split(secret).join('[已隐藏]').split(encodeURIComponent(secret)).join('[已隐藏]')
  }
  return text.replace(/https?:\/\/[^\s"'<>]+/g, value => safeUrl(value))
}
function safeUrl(value: string): string {
  try { const url = new URL(value); return `${url.origin}${url.pathname}` } catch { return '服务地址无效' }
}
function endpointLabel(server: MiraMcpServerRecord): string {
  return safeError(server.type && server.type !== 'stdio' ? `${server.type === 'sse' ? 'SSE' : 'Streamable HTTP'} · ${safeUrl(server.url || '')}` : `stdio · ${server.command}${server.args.length ? ` ${server.args.join(' ')}` : ''}`)
}
function statusLabel(server: MiraMcpServerRecord): string {
  if (!server.enabled) return '已停用'
  if (isProjectServer(server) && (!server.connection || server.connection.state === 'disconnected')) return '任务启动时连接'
  return server.connection ? { connected: '已连接', connecting: '连接中', failed: '连接失败', disconnected: '未连接', 'authorization-required': '等待授权', authorized: '已授权 · 任务启动时连接' }[server.connection.state] : '状态未知'
}
function isProjectServer(server: MiraMcpServerRecord) { return server.scope === 'project' || workspace.value !== 'global' }
async function loadProjects() {
  projectsError.value = ''
  try {
    const platform = api()
    if (typeof platform.listHarnessProjects !== 'function') return
    const result = await platform.listHarnessProjects()
    if (!disposed) projects.value = result
  } catch (error) { if (!disposed) projectsError.value = `项目范围加载失败：${safeError(error)}。全局配置仍可使用。` }
}
async function selectWorkspace(value: string) {
  if (value === workspace.value || scopeChanging.value || operationsPending.value || value !== 'global' && !projects.value.some(project => project.id === value && project.directoryExists)) return
  scopeChanging.value = true
  try {
    if (!await canDiscard() || disposed || operationsPending.value) return
    invalidateLoad(); workspace.value = value; servers.value = []; rowErrors.value = {}; notice.value = ''; authorizingId = ''; visible.value = false; saveError.value = ''
    void load()
  } finally { scopeChanging.value = false }
}
function scheduleStatusRefresh() {
  clearTimeout(pollTimer)
  if (!disposed && !loadError.value && pollAttempts < 300 && servers.value.some(server => server.enabled && (server.connection?.state === 'connecting' || server.connection?.authorization))) {
    pollTimer = setTimeout(() => { pollAttempts++; void load(true) }, 1000)
  }
}
async function load(poll = false) {
  clearTimeout(pollTimer)
  if (!poll) pollAttempts = 0
  const sequence = ++loadSequence
  const owner = workspace.value
  if (!poll) loading.value = true
  loadError.value = ''
  try {
    const result = await (owner === 'global' ? api().listMcpServers() : api().listMcpServers({ projectId: owner }))
    if (!disposed && sequence === loadSequence && owner === workspace.value) {
      servers.value = result
      const authorized = result.find(server => server.id === authorizingId)
      if (authorized?.connection?.state === 'connected' || authorized?.connection?.state === 'authorized') {
        notice.value = 'MCP 已授权，可回到工作台选择服务'; delete rowErrors.value[authorizingId]; authorizingId = ''
      } else if (authorized?.connection?.state === 'failed' || authorizingId && !authorized) { notice.value = ''; authorizingId = '' }
    }
  }
  catch (error) { if (!disposed && sequence === loadSequence && owner === workspace.value) loadError.value = `加载失败：${safeError(error)}` }
  finally { if (!disposed && sequence === loadSequence && owner === workspace.value) { loading.value = false; scheduleStatusRefresh() } }
}
function invalidateLoad() { loadSequence++; loading.value = false; clearTimeout(pollTimer) }
async function canDiscard(): Promise<boolean> {
  if (saving.value) return false
  if (!visible.value || JSON.stringify(form.value) === savedDraft) return true
  try { await ElMessageBox.confirm('未保存的 MCP 配置将丢失，确定放弃吗？', '放弃编辑', { type: 'warning' }); return true } catch { return false }
}
async function openCreate() {
  if (scopeChanging.value) return
  if (!await canDiscard()) return
  form.value = emptyForm(); savedDraft = JSON.stringify(form.value); saveError.value = ''; notice.value = ''; visible.value = true
}
async function edit(server: MiraMcpServerRecord) {
  if (scopeChanging.value) return
  if (!await canDiscard()) return
  form.value = { id: server.id, name: server.name, type: server.type || 'stdio', command: server.command, argsText: server.args.join('\n'), envText: server.env ? JSON.stringify(server.env, null, 2) : '', url: server.url || '', headersText: server.headers ? JSON.stringify(server.headers, null, 2) : '', authentication: server.authentication || 'headers', enabled: server.enabled }
  savedDraft = JSON.stringify(form.value); saveError.value = ''; notice.value = ''; visible.value = true
}
async function cancelEdit() { if (await canDiscard()) { visible.value = false; saveError.value = '' } }
function parseMap(value: string, label: string): Record<string, string> {
  if (!value.trim()) return {}
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { throw new Error(`${label}必须是有效的 JSON 对象`) }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.values(parsed).some(item => typeof item !== 'string')) throw new Error(`${label}必须是键值均为字符串的 JSON 对象`)
  return parsed as Record<string, string>
}
async function save() {
  if (scopeChanging.value || saving.value || rowPending.value[form.value.id || '']) return
  saveError.value = ''; notice.value = ''
  try {
    const draft = form.value
    if (!draft.name.trim()) throw new Error('请填写服务器名称')
    if (draft.type === 'stdio' && !draft.command.trim()) throw new Error('请填写启动命令')
    if (draft.type !== 'stdio') {
      let url: URL
      try { url = new URL(draft.url.trim()) } catch { throw new Error('请填写有效的 HTTP 或 HTTPS 服务 URL') }
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('服务 URL 仅支持 HTTP 或 HTTPS')
      if (url.username || url.password) throw new Error('请通过请求头配置凭据，不要写入服务 URL')
    }
    const payload = {
      ...(draft.id ? { id: draft.id } : {}), name: draft.name.trim(), type: draft.type, enabled: draft.enabled,
      ...(draft.type === 'stdio'
        ? { command: draft.command.trim(), args: draft.argsText.split('\n').map(item => item.trim()).filter(Boolean), env: parseMap(draft.envText, '环境变量') }
        : { command: '', args: [], url: draft.url.trim(), headers: parseMap(draft.headersText, '请求头'), authentication: draft.authentication }),
    }
    saving.value = true
    const owner = workspace.value
    const result = await (owner === 'global' ? api().saveMcpServer(payload) : api().saveMcpServer(payload, { projectId: owner }))
    if (disposed) return
    invalidateLoad()
    const index = servers.value.findIndex(server => server.id === result.id)
    if (index < 0) servers.value.push(result); else servers.value[index] = result
    visible.value = false; notice.value = '服务器配置已保存'; pollAttempts = 0; scheduleStatusRefresh()
  } catch (error) { saveError.value = `未保存：${safeError(error)}。编辑内容已保留，可重试。` }
  finally { saving.value = false }
}
async function remove(server: MiraMcpServerRecord) {
  if (scopeChanging.value || rowPending.value[server.id] || saving.value) return
  const owner = workspace.value
  if (visible.value && form.value.id === server.id && !await canDiscard()) return
  if (disposed || owner !== workspace.value || rowPending.value[server.id] || saving.value) return
  rowPending.value[server.id] = 'delete'; delete rowErrors.value[server.id]
  try {
    try { await ElMessageBox.confirm(`确定删除“${server.name}”吗？`, '删除服务器', { type: 'warning' }) } catch { return }
    await (owner === 'global' ? api().deleteMcpServer(server.id) : api().deleteMcpServer(server.id, { projectId: owner }))
    if (disposed) return
    invalidateLoad()
    servers.value = servers.value.filter(item => item.id !== server.id)
    if (visible.value && form.value.id === server.id) visible.value = false
    notice.value = '服务器已删除'; scheduleStatusRefresh()
  } catch (error) { rowErrors.value[server.id] = `删除失败：${safeError(error)}。可再次删除重试。` }
  finally { delete rowPending.value[server.id] }
}
async function reconnect(server: MiraMcpServerRecord) {
  if (scopeChanging.value || isProjectServer(server) || !server.enabled || rowPending.value[server.id]) return
  rowPending.value[server.id] = 'reconnect'; delete rowErrors.value[server.id]
  try {
    const connection = await api().reconnectMcpServer(server.id)
    const current = servers.value.find(item => item.id === server.id)
    if (current) current.connection = connection
    invalidateLoad(); pollAttempts = 0; scheduleStatusRefresh()
  } catch (error) { rowErrors.value[server.id] = `重新连接失败：${safeError(error)}。可重试。` }
  finally { delete rowPending.value[server.id] }
}
async function authorize(server: MiraMcpServerRecord) {
  if (scopeChanging.value || !server.enabled || rowPending.value[server.id]) return
  rowPending.value[server.id] = 'authorize'; delete rowErrors.value[server.id]
  try {
    const connection = await api().authorizeMcpServer(server.id, workspace.value === 'global' ? undefined : { projectId: workspace.value })
    if (!disposed) {
      const current = servers.value.find(item => item.id === server.id)
      if (current && connection) current.connection = connection
      notice.value = connection?.state === 'connected' || connection?.state === 'authorized' ? 'MCP 已授权，可回到工作台选择服务' : '已打开浏览器，请完成授权后返回 Mira'
      authorizingId = connection?.authorization ? server.id : ''
      pollAttempts = 0; scheduleStatusRefresh()
    }
  } catch (error) { if (!disposed) rowErrors.value[server.id] = `打开授权失败：${safeError(error)}。可重试。` }
  finally { delete rowPending.value[server.id] }
}
onBeforeRouteLeave(canDiscard)
onMounted(() => { void load(); void loadProjects() })
onUnmounted(() => { disposed = true; invalidateLoad() })
</script>

<style scoped lang="scss">
.mcp-page__title { margin: 0 0 4px; font-size: $font-lg; }
.mcp-page__desc { margin: 0 0 $spacing-lg; color: var(--cp-text-secondary); font-size: $font-sm; }
.mcp-toolbar { display: flex; justify-content: flex-end; gap: $spacing-sm; margin-bottom: $spacing-md; }
.mcp-scope-label { display: flex; align-items: center; gap: $spacing-sm; margin-right: auto; color: var(--cp-text-secondary); font-size: $font-sm; }
.mcp-scope-label :deep(.el-select) { width: 240px; }
.mcp-scope-hint { margin: 0 0 $spacing-md; color: var(--cp-text-secondary); font-size: $font-sm; overflow-wrap: anywhere; }
.mcp-loading { min-height: 120px; padding: $spacing-md; }
.mcp-editor { padding: $spacing-lg; margin-bottom: $spacing-lg; border: 1px solid var(--cp-border-light); border-radius: $radius-md; }
.mcp-editor h3 { margin: 0 0 $spacing-md; font-size: $font-sm; }
.mcp-editor__actions { display: flex; gap: $spacing-sm; }
.mcp-editor :deep(.el-select) { width: 240px; }
.mcp-list { display: flex; flex-direction: column; gap: $spacing-sm; }
.mcp-row { display: flex; align-items: center; justify-content: space-between; gap: $spacing-md; padding: $spacing-md $spacing-lg; border: 1px solid var(--cp-border-light); border-radius: $radius-md; background: var(--cp-bg-elevated); }
.mcp-row__identity { display: flex; align-items: center; gap: $spacing-md; min-width: 0; }
.mcp-row__mark { position: relative; display: grid; width: 36px; height: 36px; flex: 0 0 auto; place-items: center; border-radius: $radius-sm; color: var(--cp-text-secondary); background: var(--cp-bg); }
.mcp-row__dot { position: absolute; right: -2px; bottom: -2px; width: 8px; height: 8px; border: 2px solid var(--cp-bg-elevated); border-radius: 50%; background: var(--cp-text-tertiary); }
.mcp-row__dot--connected { background: var(--el-color-success); }
.mcp-row__dot--connecting, .mcp-row__dot--authorization-required { background: var(--el-color-warning); }
.mcp-row__dot--authorized { background: var(--el-color-success); }
.mcp-row__dot--failed { background: var(--el-color-danger); }
.mcp-row__details { min-width: 0; }
.mcp-row__identity h3 { display: flex; align-items: center; flex-wrap: wrap; gap: $spacing-sm; margin: 0 0 2px; font-size: $font-sm; }
.mcp-row__identity p { margin: 0; overflow: hidden; color: var(--cp-text-tertiary); font-size: $font-xs; text-overflow: ellipsis; white-space: nowrap; }
.mcp-row__count { color: var(--cp-text-secondary); font-size: $font-xs; font-weight: normal; }
.mcp-row__actions { display: flex; flex: 0 0 auto; gap: 4px; }
.mcp-error { display: flex; align-items: center; gap: $spacing-sm; margin: $spacing-sm 0; color: var(--el-color-danger); font-size: $font-sm; overflow-wrap: anywhere; }
.mcp-row__identity .mcp-error { color: var(--el-color-danger); white-space: normal; }
.mcp-notice { color: var(--cp-text-secondary); font-size: $font-sm; }
.mcp-empty { padding: $spacing-2xl; text-align: center; border: 1px dashed var(--cp-border-light); border-radius: $radius-md; }
.mcp-empty strong { color: var(--cp-text); }
.mcp-empty p { margin: $spacing-sm 0 0; color: var(--cp-text-tertiary); font-size: $font-sm; }
</style>
