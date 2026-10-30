<template>
  <component :is="embedded ? 'div' : SettingsPageShell" title="MCP 服务" :wide="!visible" :show-title="!visible">
    <template v-if="visible && !embedded" #titlebar><nav class="mcp-breadcrumb" aria-label="页面位置"><button type="button" :disabled="saving" @click="cancelEdit">MCP 服务器</button><AppIcon name="lucide:chevron-right" /><span>{{ editorBreadcrumb }}</span></nav></template>
    <div class="mcp-page" :class="{ 'mcp-page--embedded': embedded }">
      <template v-if="!visible">
      <h2 v-if="!embedded" class="mcp-page__title">MCP 服务器</h2>
      <p v-if="!embedded" class="mcp-page__desc">连接本地进程或远程 MCP 服务，为智能体提供工具。回到工作台，通过 /mcp 选择当前会话可用的服务。</p>
      <div ref="listHeading" class="mcp-toolbar" tabindex="-1"><h2 v-if="embedded" class="mcp-embedded-heading">MCP <small>{{ filteredServers.length }}</small></h2>
        <el-dropdown trigger="click" @command="openImport"><el-button class="mcp-refresh" aria-label="更多 MCP 操作" title="更多操作"><AppIcon name="lucide:ellipsis" /></el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="import"><AppIcon name="lucide:import" />导入</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
        <el-button class="mcp-refresh" :loading="loading" aria-label="刷新 MCP 服务器" title="刷新 MCP 服务器" @click="load()"><AppIcon name="lucide:refresh-cw" /></el-button>
        <el-button type="primary" :disabled="saving" aria-label="添加 MCP 服务器" @click="openCreate"><AppIcon name="lucide:plus" />新建</el-button>
      </div>
      </template>
      <div v-if="loadError" class="mcp-error" role="alert"><span>{{ loadError }}</span><el-button text :loading="loading" aria-label="重试加载 MCP 服务器" @click="load()">重试</el-button></div>

      <header v-if="visible" class="mcp-editor-heading"><div><h1 ref="editorHeading" tabindex="-1">{{ creating ? '新建 MCP 服务器' : '编辑 MCP 服务器' }}</h1><p>{{ creating ? '填写新的 MCP 配置，保存后返回列表。' : '修改 MCP 配置，保存后返回列表。' }}</p></div><div class="mcp-editor-modes" role="group" aria-label="MCP 编辑方式"><button v-for="mode in (['form', 'json'] as const)" :key="mode" type="button" :aria-pressed="editorMode === mode" :disabled="saving" @click="changeEditorMode(mode)">{{ mode === 'form' ? '表单' : 'JSON' }}</button></div></header>
      <section v-if="visible" class="mcp-editor mcp-editor--page" aria-label="MCP 服务器配置">
        <el-form label-position="top" :disabled="saving || !!rowPending[form.id || '']" @submit.prevent="save">
          <div v-if="editorMode === 'form'" class="mcp-editor__top">
            <el-form-item label="名称"><el-input v-model="form.name" aria-label="MCP 服务器名称" placeholder="my-mcp-server" /></el-form-item>
          </div>
          <template v-if="editorMode === 'json'">
            <el-form-item label="完整配置"><el-input v-model="jsonDraft" type="textarea" :rows="14" resize="vertical" spellcheck="false" aria-label="MCP 完整配置 JSON" :placeholder="jsonPlaceholder" @blur="validateJson" /></el-form-item>
            <p class="mcp-json-hint">支持粘贴单个服务器配置：<code>{"server-name": {...}}</code> 或 <code>{"mcpServers": {"server-name": {...}}}</code>。</p>
          </template>
          <template v-else>
          <el-form-item label="类型" class="mcp-editor__type">
            <el-select v-model="form.type" aria-label="MCP 传输协议">
              <el-option label="stdio（本地命令）" value="stdio" /><el-option label="Streamable HTTP" value="streamableHttp" /><el-option label="SSE" value="sse" />
            </el-select>
          </el-form-item>
          <template v-if="form.type === 'stdio'">
            <el-form-item label="命令"><el-input v-model="form.command" aria-label="MCP 启动命令" placeholder="npx" /></el-form-item>
            <el-form-item label="参数（每行一个）"><el-input v-model="form.argsText" aria-label="MCP 启动参数" type="textarea" :rows="2" resize="vertical" placeholder="-y&#10;@modelcontextprotocol/server-memory" /></el-form-item>
          </template>
          <template v-else>
            <el-form-item label="服务 URL"><el-input v-model="form.url" aria-label="MCP 服务 URL" placeholder="https://mcp.example.com/mcp" /></el-form-item>
            <el-form-item label="认证方式"><el-select v-model="form.authentication" aria-label="MCP 认证方式"><el-option label="请求头 / 无认证" value="headers" /><el-option label="浏览器登录（OAuth）" value="oauth" /></el-select></el-form-item>
            <p v-if="form.authentication === 'oauth'" class="mcp-scope-hint">保存后在服务行打开浏览器授权，登录完成后自动更新连接状态。</p>
          </template>
          <button type="button" class="mcp-editor__optional" :aria-expanded="showOptional" aria-controls="mcp-optional-fields" :disabled="saving" @click="showOptional = !showOptional"><AppIcon :name="showOptional ? 'lucide:chevron-up' : 'lucide:chevron-down'" />{{ form.type === 'stdio' ? '环境变量（可选）' : '请求头（可选）' }}</button>
          <div v-if="showOptional" id="mcp-optional-fields">
            <el-form-item v-if="form.type === 'stdio'"><el-input v-model="form.envText" aria-label="MCP 环境变量 JSON" type="textarea" :rows="3" resize="vertical" placeholder='{"MY_API_KEY": "your-key"}' /></el-form-item>
            <el-form-item v-else><el-input v-model="form.headersText" aria-label="MCP 请求头 JSON" type="textarea" :rows="3" resize="vertical" placeholder='{"Authorization": "Bearer your-token"}' /></el-form-item>
          </div>
          <el-form-item label="启用" class="mcp-editor__enabled"><el-switch v-model="form.enabled" aria-label="启用 MCP 服务器" /></el-form-item>
          </template>
        </el-form>
        <p v-if="saveError" class="mcp-error" role="alert">{{ saveError }}</p>
        <div class="mcp-editor__actions"><el-button type="primary" :loading="saving" :disabled="saving || !!rowPending[form.id || ''] || !canSave" aria-label="保存 MCP 服务器" @click="save">保存</el-button><el-button text :disabled="saving" aria-label="取消 MCP 编辑" @click="cancelEdit">取消</el-button></div>
      </section>

      <template v-if="!visible">
      <div v-if="loading && !servers.length && !loadError" class="mcp-loading" aria-label="正在加载 MCP 服务器"><el-skeleton :rows="3" animated /></div>
      <div v-else-if="servers.length" class="mcp-list">
        <article v-for="server in filteredServers" :key="server.id" class="mcp-row" :data-mcp-id="server.id" :data-mcp-scope="isProjectServer(server) ? 'project' : 'global'" :data-mcp-type="server.type || 'stdio'" :data-mcp-status="server.connection?.state || 'unknown'" :data-mcp-tool-count="server.connection?.toolCount">
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
      <div v-else-if="!loadError" class="mcp-empty"><strong>尚未安装 MCP 服务器</strong><p>手动新建服务器，或导入已有配置。</p><div class="mcp-empty__actions"><el-button type="primary" @click="openCreate"><AppIcon name="lucide:plus" />新建 MCP 服务器</el-button><el-button aria-label="导入外部 MCP 服务器" @click="openImport"><AppIcon name="lucide:import" />导入</el-button></div></div>
      <p v-if="!loading && servers.length && !filteredServers.length" class="mcp-empty">没有匹配的 MCP 服务器</p>
      </template>
      <p v-if="notice" class="mcp-notice" role="status">{{ notice }}</p>
      <ExternalMcpImportDialog v-model:open="importOpen" @imported="load()" />
    </div>
  </component>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { getPlatformApi } from '@/platform'
import type { MiraMcpServerRecord, MiraMcpTransport } from '@/config/miraMcp'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'
import ExternalMcpImportDialog from './ExternalMcpImportDialog.vue'

const props = defineProps<{ embedded?: boolean; searchQuery?: string }>()
const emit = defineEmits<{ 'count-change': [items: MiraMcpServerRecord[]]; 'editor-change': [breadcrumb: string] }>()
const filteredServers = computed(() => servers.value.filter(server => `${server.name} ${server.type}`.toLocaleLowerCase().includes((props.searchQuery || '').trim().toLocaleLowerCase())))

interface McpForm { id?: string, name: string, type: MiraMcpTransport, command: string, argsText: string, envText: string, url: string, headersText: string, authentication: 'headers' | 'oauth', enabled: boolean }
const emptyForm = (): McpForm => ({ name: '', type: 'stdio', command: '', argsText: '', envText: '', url: '', headersText: '', authentication: 'headers', enabled: true })
const servers = ref<MiraMcpServerRecord[]>([])
watch(servers, value => emit('count-change', value), { deep: true })
const loading = ref(false), visible = ref(false), saving = ref(false)
const importOpen = ref(false)
const loadError = ref(''), saveError = ref(''), notice = ref('')
const rowErrors = ref<Record<string, string>>({}), rowPending = ref<Record<string, 'delete' | 'reconnect' | 'authorize'>>({})
let authorizingId = ''
const form = ref<McpForm>(emptyForm())
const creating = computed(() => visible.value && !form.value.id)
const editorBreadcrumb = computed(() => !visible.value ? '' : form.value.id ? servers.value.find(server => server.id === form.value.id)?.name || '编辑 MCP 服务器' : '新建 MCP 服务器')
watch(editorBreadcrumb, value => emit('editor-change', value), { immediate: true })
const editorHeading = ref<HTMLHeadingElement>(), listHeading = ref<HTMLDivElement>()
const editorMode = ref<'form' | 'json'>('form'), jsonDraft = ref(''), showOptional = ref(false)
const jsonPlaceholder = '{\n  "my-mcp-server": {\n    "type": "stdio",\n    "command": "npx",\n    "args": ["-y", "@modelcontextprotocol/server-memory"]\n  }\n}'
const canSave = computed(() => { try { const draft = editorMode.value === 'json' ? readJsonDraft() : form.value; return Boolean(draft.name.trim() && (draft.type === 'stdio' ? draft.command.trim() : draft.url.trim())) } catch { return false } })
let savedDraft = '', savedJsonDraft = '', loadSequence = 0, pollAttempts = 0, disposed = false
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
function isProjectServer(server: MiraMcpServerRecord) { return server.scope === 'project' }
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
  if (!poll) loading.value = true
  loadError.value = ''
  try {
    const result = await api().listMcpServers()
    if (!disposed && sequence === loadSequence) {
      servers.value = result
      const authorized = result.find(server => server.id === authorizingId)
      if (authorized?.connection?.state === 'connected' || authorized?.connection?.state === 'authorized') {
        notice.value = 'MCP 已授权，可回到工作台选择服务'; delete rowErrors.value[authorizingId]; authorizingId = ''
      } else if (authorized?.connection?.state === 'failed' || authorizingId && !authorized) { notice.value = ''; authorizingId = '' }
    }
  }
  catch (error) { if (!disposed && sequence === loadSequence) loadError.value = `加载失败：${safeError(error)}` }
  finally { if (!disposed && sequence === loadSequence) { loading.value = false; scheduleStatusRefresh() } }
}
function invalidateLoad() { loadSequence++; loading.value = false; clearTimeout(pollTimer) }
async function canDiscard(): Promise<boolean> {
  if (saving.value) return false
  if (!visible.value || JSON.stringify(form.value) === savedDraft && (editorMode.value !== 'json' || jsonDraft.value === savedJsonDraft)) return true
  try { await ElMessageBox.confirm('未保存的 MCP 配置将丢失，确定放弃吗？', '放弃编辑', { type: 'warning' }); return true } catch { return false }
}
async function openCreate() {
  if (!await canDiscard()) return
  form.value = emptyForm(); savedDraft = JSON.stringify(form.value); editorMode.value = 'form'; jsonDraft.value = writeJsonDraft(); savedJsonDraft = jsonDraft.value; showOptional.value = false; saveError.value = ''; notice.value = ''; visible.value = true
  await nextTick(); editorHeading.value?.focus?.()
}
async function openImport() { if (await canDiscard()) { visible.value = false; importOpen.value = true } }
async function edit(server: MiraMcpServerRecord) {
  if (!await canDiscard()) return
  form.value = { id: server.id, name: server.name, type: server.type || 'stdio', command: server.command, argsText: server.args.join('\n'), envText: server.env ? JSON.stringify(server.env, null, 2) : '', url: server.url || '', headersText: server.headers ? JSON.stringify(server.headers, null, 2) : '', authentication: server.authentication || 'headers', enabled: server.enabled }
  savedDraft = JSON.stringify(form.value); editorMode.value = 'form'; jsonDraft.value = writeJsonDraft(); savedJsonDraft = jsonDraft.value; showOptional.value = Object.keys((form.value.type === 'stdio' ? server.env : server.headers) || {}).length > 0; saveError.value = ''; notice.value = ''; visible.value = true
  await nextTick(); editorHeading.value?.focus?.()
}
async function cancelEdit() { if (await canDiscard()) { visible.value = false; saveError.value = ''; await nextTick(); listHeading.value?.focus?.() } }
function parseMap(value: string, label: string): Record<string, string> {
  if (!value.trim()) return {}
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { throw new Error(`${label}必须是有效的 JSON 对象`) }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.values(parsed).some(item => typeof item !== 'string')) throw new Error(`${label}必须是键值均为字符串的 JSON 对象`)
  return parsed as Record<string, string>
}
function writeJsonDraft(): string {
  const draft = form.value
  return JSON.stringify({ [draft.name.trim() || 'my-mcp-server']: {
    type: draft.type, enabled: draft.enabled,
    ...(draft.type === 'stdio'
      ? { command: draft.command, args: draft.argsText.split('\n').map(item => item.trim()).filter(Boolean), env: parseMap(draft.envText, '环境变量') }
      : { url: draft.url, headers: parseMap(draft.headersText, '请求头'), authentication: draft.authentication }),
  } }, null, 2)
}
function readJsonDraft(): McpForm {
  let parsed: unknown
  try { parsed = JSON.parse(jsonDraft.value) } catch { throw new Error('请填写有效的 JSON 配置') }
  const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
  if (!record(parsed)) throw new Error('请提供单个 MCP 服务器配置对象')
  const configs = 'mcpServers' in parsed ? parsed.mcpServers : parsed
  if (!record(configs)) throw new Error('mcpServers 必须是服务器配置对象')
  const entries = Object.entries(configs)
  if (entries.length !== 1 || !record(entries[0]![1])) throw new Error('一次只能编辑一个 MCP 服务器')
  const [name, config] = entries[0]! as [string, Record<string, unknown>]
  const unsupported = Object.keys(config).filter(key => !['type', 'command', 'args', 'env', 'url', 'headers', 'authentication', 'enabled'].includes(key))
  if (unsupported.length) throw new Error(`Mira 尚不支持配置字段：${unsupported.join('、')}`)
  const type = config.type === 'http' ? 'streamableHttp' : config.type ?? (config.command ? 'stdio' : 'streamableHttp')
  if (!['stdio', 'streamableHttp', 'sse'].includes(type as string)) throw new Error('类型仅支持 stdio、Streamable HTTP 和 SSE')
  for (const key of ['command', 'url']) if (config[key] !== undefined && typeof config[key] !== 'string') throw new Error(`${key} 必须是字符串`)
  if (config.args !== undefined && (!Array.isArray(config.args) || config.args.some(value => typeof value !== 'string' || value.includes('\n')))) throw new Error('args 必须是字符串数组，每个参数不能包含换行')
  for (const key of ['env', 'headers']) if (config[key] !== undefined && (!record(config[key]) || Object.values(config[key]).some(value => typeof value !== 'string'))) throw new Error(`${key} 必须是键值均为字符串的 JSON 对象`)
  if (config.enabled !== undefined && typeof config.enabled !== 'boolean') throw new Error('enabled 必须是布尔值')
  if (config.authentication !== undefined && !['headers', 'oauth'].includes(config.authentication as string)) throw new Error('authentication 仅支持 headers 或 oauth')
  return { ...form.value, name, type: type as MiraMcpTransport, command: config.command as string || '', argsText: (config.args as string[] || []).join('\n'), envText: config.env ? JSON.stringify(config.env, null, 2) : '', url: config.url as string || '', headersText: config.headers ? JSON.stringify(config.headers, null, 2) : '', authentication: config.authentication as McpForm['authentication'] || 'headers', enabled: config.enabled as boolean ?? true }
}
function validateJson() { try { readJsonDraft(); saveError.value = '' } catch (error) { saveError.value = safeError(error) } }
function changeEditorMode(mode: 'form' | 'json') {
  if (saving.value || mode === editorMode.value) return
  try {
    if (mode === 'json') jsonDraft.value = writeJsonDraft()
    else form.value = readJsonDraft()
    editorMode.value = mode; saveError.value = ''
  } catch (error) { saveError.value = safeError(error) }
}
function makePayload(draft: McpForm) {
  if (!draft.name.trim()) throw new Error('请填写服务器名称')
  if (draft.type === 'stdio' && !draft.command.trim()) throw new Error('请填写启动命令')
  if (draft.type !== 'stdio') {
    let url: URL
    try { url = new URL(draft.url.trim()) } catch { throw new Error('请填写有效的 HTTP 或 HTTPS 服务 URL') }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('服务 URL 仅支持 HTTP 或 HTTPS')
    if (url.username || url.password) throw new Error('请通过请求头配置凭据，不要写入服务 URL')
  }
  return {
    ...(draft.id ? { id: draft.id } : {}), name: draft.name.trim(), type: draft.type, enabled: draft.enabled,
    ...(draft.type === 'stdio'
      ? { command: draft.command.trim(), args: draft.argsText.split('\n').map(item => item.trim()).filter(Boolean), env: parseMap(draft.envText, '环境变量') }
      : { command: '', args: [], url: draft.url.trim(), headers: parseMap(draft.headersText, '请求头'), authentication: draft.authentication }),
  }
}
async function save() {
  if (saving.value || rowPending.value[form.value.id || '']) return
  saveError.value = ''; notice.value = ''
  try {
    if (editorMode.value === 'json') form.value = readJsonDraft()
    const payload = makePayload(form.value)
    saving.value = true
    const result = await api().saveMcpServer(payload)
    if (disposed) return
    invalidateLoad()
    const index = servers.value.findIndex(server => server.id === result.id)
    if (index < 0) servers.value.push(result); else servers.value[index] = result
    visible.value = false; notice.value = '服务器配置已保存'; pollAttempts = 0; scheduleStatusRefresh(); await nextTick(); listHeading.value?.focus?.()
  } catch (error) { saveError.value = `未保存：${safeError(error)}。编辑内容已保留，可重试。` }
  finally { saving.value = false }
}
async function remove(server: MiraMcpServerRecord) {
  if (rowPending.value[server.id] || saving.value) return
  if (visible.value && form.value.id === server.id && !await canDiscard()) return
  if (disposed || rowPending.value[server.id] || saving.value) return
  rowPending.value[server.id] = 'delete'; delete rowErrors.value[server.id]
  try {
    try { await ElMessageBox.confirm(`确定删除“${server.name}”吗？`, '删除服务器', { type: 'warning' }) } catch { return }
    await api().deleteMcpServer(server.id)
    if (disposed) return
    invalidateLoad()
    servers.value = servers.value.filter(item => item.id !== server.id)
    if (visible.value && form.value.id === server.id) visible.value = false
    notice.value = '服务器已删除'; scheduleStatusRefresh()
  } catch (error) { rowErrors.value[server.id] = `删除失败：${safeError(error)}。可再次删除重试。` }
  finally { delete rowPending.value[server.id] }
}
async function reconnect(server: MiraMcpServerRecord) {
  if (isProjectServer(server) || !server.enabled || rowPending.value[server.id]) return
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
  if (!server.enabled || rowPending.value[server.id]) return
  rowPending.value[server.id] = 'authorize'; delete rowErrors.value[server.id]
  try {
    const connection = await api().authorizeMcpServer(server.id)
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
defineExpose({ canLeave: canDiscard, cancelEdit })
onBeforeRouteLeave(canDiscard)
onMounted(() => { void load() })
onUnmounted(() => { disposed = true; invalidateLoad() })
</script>

<style scoped lang="scss">
.mcp-page__title { margin: 0 0 4px; font-size: var(--settings-text-section); font-weight: 550; }
.mcp-page__desc { margin: 0 0 $spacing-lg; color: var(--cp-text-secondary); font-size: var(--settings-text-base); }
.mcp-refresh { width: 32px; padding: 0; }
.mcp-refresh :deep(.app-icon) { width: 14px; height: 14px; }
.mcp-toolbar { display: flex; justify-content: flex-end; gap: $spacing-sm; margin-bottom: $spacing-md; }
.mcp-scope-hint { margin: 0 0 $spacing-md; color: var(--cp-text-secondary); font-size: var(--settings-text-base); overflow-wrap: anywhere; }
.mcp-loading { min-height: 120px; padding: $spacing-md; }
.mcp-editor { padding: $spacing-lg; margin-bottom: $spacing-lg; border: 1px solid var(--cp-border-light); border-radius: $radius-md; }
.mcp-editor h3 { margin: 0 0 $spacing-md; font-size: var(--settings-text-base); font-weight: 450; }
.mcp-editor__actions { display: flex; gap: $spacing-sm; }
.mcp-editor :deep(.el-select) { width: 240px; }
.mcp-breadcrumb { display: flex; align-items: center; gap: 10px; color: var(--cp-text-secondary); font-size: var(--settings-text-base); }
.mcp-breadcrumb button { border: 0; padding: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
.mcp-breadcrumb :deep(.app-icon) { width: 12px; height: 12px; }
.mcp-editor-heading { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.mcp-editor-heading h1 { margin: 0; color: var(--cp-text); font-size: 20px; font-weight: 600; line-height: 1.4; }
.mcp-editor-heading p { margin: 4px 0 0; color: var(--cp-text-secondary); font-size: var(--settings-text-base); line-height: 1.5; }
.mcp-editor-modes { display: flex; padding: 2px; border-radius: 999px; background: var(--cp-bg-elevated); }
.mcp-editor-modes button { padding: 5px 12px; border: 0; border-radius: 999px; background: transparent; color: var(--cp-text-secondary); font: inherit; font-size: var(--settings-text-base); cursor: pointer; }
.mcp-editor-modes button[aria-pressed='true'] { background: var(--cp-bg); color: var(--cp-text); }
.mcp-editor--page { padding: 16px; border-radius: 12px; }
.mcp-editor__top { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; }
.mcp-editor__top > :deep(.el-form-item), .mcp-editor--page .mcp-editor__type { width: 192px; max-width: 100%; }
.mcp-editor--page :deep(.el-form-item) { margin-bottom: 12px; }
.mcp-editor--page :deep(.el-form-item__label) { margin-bottom: 6px; color: var(--cp-text-secondary); font-size: var(--settings-text-base); line-height: 20px; }
.mcp-editor--page :deep(.el-select) { width: 100%; }
.mcp-editor__optional { display: flex; align-items: center; gap: 4px; margin: 0 0 12px; padding: 0; border: 0; background: none; color: var(--cp-text-secondary); font: inherit; font-size: var(--settings-text-base); cursor: pointer; }
.mcp-editor__optional :deep(.app-icon) { width: 14px; height: 14px; }
.mcp-editor--page .mcp-editor__enabled { display: flex; align-items: center; gap: 12px; }
.mcp-editor__enabled :deep(.el-form-item__label) { margin: 0; }
.mcp-editor--page .mcp-editor__actions { justify-content: flex-end; margin-top: 16px; }
.mcp-editor__actions :deep(.el-button + .el-button) { margin-left: 0; }
.mcp-json-hint { margin: 0; color: var(--cp-text-secondary); font-size: var(--settings-text-base); overflow-wrap: anywhere; line-height: 1.6; }
.mcp-editor--page :deep(textarea[aria-label='MCP 完整配置 JSON']) { font-family: var(--cp-font-mono, monospace); }
@media (max-width: 640px) { .mcp-editor__top > :deep(.el-form-item) { width: 100%; } }
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
.mcp-row__identity h3 { display: flex; align-items: center; flex-wrap: wrap; gap: $spacing-sm; margin: 0 0 2px; font-size: var(--settings-text-base); font-weight: 450; }
.mcp-row__identity p { margin: 0; overflow: hidden; color: var(--cp-text-tertiary); font-size: var(--settings-text-small); text-overflow: ellipsis; white-space: nowrap; }
.mcp-row__count { color: var(--cp-text-secondary); font-size: var(--settings-text-small); font-weight: normal; }
.mcp-row__actions { display: flex; flex: 0 0 auto; gap: 4px; }
.mcp-error { display: flex; align-items: center; gap: $spacing-sm; margin: $spacing-sm 0; color: var(--el-color-danger); font-size: var(--settings-text-base); overflow-wrap: anywhere; }
.mcp-row__identity .mcp-error { color: var(--el-color-danger); white-space: normal; }
.mcp-notice { color: var(--cp-text-secondary); font-size: var(--settings-text-base); }
.mcp-empty { padding: $spacing-2xl; text-align: center; border: 1px dashed var(--cp-border-light); border-radius: $radius-md; }
.mcp-empty strong { color: var(--cp-text); font-weight: 500; }
.mcp-empty p { margin: 8px 0 14px; color: var(--cp-text-secondary); font-size: var(--settings-text-base); }
.mcp-empty__actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.mcp-empty__actions :deep(.el-button) { height: 30px; margin: 0; padding: 6px 10px; font-size: 12px; }
.mcp-empty__actions :deep(.app-icon) { width: 14px; height: 14px; margin-right: 4px; }

.mcp-page--embedded { font-size: var(--settings-text-base); }
.mcp-page--embedded .mcp-toolbar { gap: 8px; margin-bottom: 16px; }
.mcp-page--embedded .mcp-toolbar :deep(.el-button) { font-size: 12px; height: 28px; padding: 5px 10px; }
.mcp-page--embedded .mcp-toolbar :deep(.mcp-refresh) { width: 28px; padding: 0; }
.mcp-embedded-heading { margin: 0 auto 0 0; font-size: 14px; font-weight: 500; }
.mcp-embedded-heading small { font-size: 12px; color: var(--cp-text-secondary); font-weight: 400; }
.mcp-page--embedded .mcp-list { border: 0; border-radius: 12px; background: color-mix(in srgb, var(--cp-text) 4%, var(--cp-bg)); overflow: hidden; }
.mcp-page--embedded .mcp-row { padding: 14px 16px; border-radius: 0; background: transparent; }
.mcp-page--embedded .mcp-empty { border: 1px dashed var(--cp-border-light); border-radius: 12px; padding: 40px 20px; }
</style>
