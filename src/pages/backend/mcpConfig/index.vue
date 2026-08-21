<template>
  <SettingsPageShell title="MCP 服务" wide>
    <div class="mcp-page">
      <h2 class="mcp-page__title">MCP 服务器</h2>
      <p class="mcp-page__desc">配置 MCP（Model Context Protocol）服务器后，它们提供的工具会自动接入 Agent 工作台。</p>

      <div class="mcp-toolbar">
        <el-button type="primary" @click="openCreate"><AppIcon name="Plus" />添加服务器</el-button>
      </div>

      <div v-if="loading" v-loading="loading" class="mcp-loading" />
      <div v-else-if="servers.length" class="mcp-list">
        <article v-for="server in servers" :key="server.id" class="mcp-row">
          <div class="mcp-row__identity">
            <span class="mcp-row__mark"><AppIcon name="Connection" /></span>
            <div>
              <h3>{{ server.name }} <el-tag v-if="!server.enabled" size="small" effect="plain">已停用</el-tag></h3>
              <p>{{ server.command }}{{ server.args.length ? ` ${server.args.join(' ')}` : '' }}</p>
            </div>
          </div>
          <div class="mcp-row__actions">
            <el-button text circle aria-label="编辑服务器" @click="edit(server)"><AppIcon name="EditPen" /></el-button>
            <el-button text circle type="danger" aria-label="删除服务器" @click="remove(server.id)"><AppIcon name="Delete" /></el-button>
          </div>
        </article>
      </div>
      <div v-else class="mcp-empty">
        <strong>还没有配置 MCP 服务器</strong>
        <p>支持 stdio 协议（本地进程）。添加后，MCP 服务器提供的工具会自动出现在 Agent 工作台。</p>
      </div>
    </div>

    <el-dialog v-model="visible" :title="form.id ? '编辑服务器' : '添加服务器'" width="min(560px, calc(100vw - 32px))" destroy-on-close align-center>
      <el-form label-position="top">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="例如 filesystem" />
        </el-form-item>
        <el-form-item label="启动命令">
          <el-input v-model="form.command" placeholder="例如 npx 或 /usr/bin/node" />
        </el-form-item>
        <el-form-item label="参数（每行一个）">
          <el-input v-model="argsText" type="textarea" :rows="4" placeholder="例如：-y&#10;@modelcontextprotocol/server-filesystem&#10;/Users/me" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getPlatformApi } from '@/platform'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

interface McpServer { id: string, name: string, command: string, args: string[], enabled: boolean }

const servers = ref<McpServer[]>([])
const loading = ref(false)
const visible = ref(false)
const form = ref<{ id?: string, name: string, command: string, enabled: boolean }>({ name: '', command: '', enabled: true })
const argsText = ref('')

async function load() {
  loading.value = true
  try {
    servers.value = await getPlatformApi()?.listMcpServers() || []
  } finally {
    loading.value = false
  }
}

function openCreate() {
  form.value = { name: '', command: '', enabled: true }
  argsText.value = ''
  visible.value = true
}

function edit(server: McpServer) {
  form.value = { id: server.id, name: server.name, command: server.command, enabled: server.enabled }
  argsText.value = server.args.join('\n')
  visible.value = true
}

async function save() {
  const args = argsText.value.split('\n').map(item => item.trim()).filter(Boolean)
  await getPlatformApi()?.saveMcpServer({ ...form.value, args })
  visible.value = false
  await load()
}

async function remove(id: string) {
  await ElMessageBox.confirm('确定删除这个 MCP 服务器吗？', '删除服务器', { type: 'warning' })
  await getPlatformApi()?.deleteMcpServer(id)
  ElMessage.success('已删除')
  await load()
}

onMounted(load)
</script>

<style scoped lang="scss">
.mcp-page__title { margin: 0 0 4px; font-size: $font-lg; }
.mcp-page__desc { margin: 0 0 $spacing-lg; color: var(--cp-text-secondary); font-size: $font-sm; }
.mcp-toolbar { display: flex; justify-content: flex-end; margin-bottom: $spacing-md; }
.mcp-loading { min-height: 120px; }
.mcp-list { display: flex; flex-direction: column; gap: $spacing-sm; }
.mcp-row { display: flex; align-items: center; justify-content: space-between; gap: $spacing-md; padding: $spacing-md $spacing-lg; border: 1px solid var(--cp-border-light); border-radius: $radius-md; background: var(--cp-bg-elevated); }
.mcp-row__identity { display: flex; align-items: center; gap: $spacing-md; min-width: 0; }
.mcp-row__mark { display: grid; width: 36px; height: 36px; flex: 0 0 auto; place-items: center; border-radius: $radius-sm; color: var(--cp-primary); background: var(--cp-primary-lighter); }
.mcp-row__identity h3 { margin: 0 0 2px; font-size: $font-sm; }
.mcp-row__identity p { margin: 0; overflow: hidden; color: var(--cp-text-tertiary); font-size: $font-xs; text-overflow: ellipsis; white-space: nowrap; }
.mcp-row__actions { display: flex; gap: 4px; }
.mcp-empty { padding: $spacing-2xl; text-align: center; border: 1px dashed var(--cp-border-light); border-radius: $radius-md; }
.mcp-empty strong { color: var(--cp-text); }
.mcp-empty p { margin: $spacing-sm 0 0; color: var(--cp-text-tertiary); font-size: $font-sm; }
</style>
