<template>
  <SettingsPageShell title="Python 环境">
    <p class="page-description">Mira 安装包携带 Python 运行时，用于 Agent 的文档和数据处理任务。</p>
    <section class="python-status">
      <AppIcon name="lucide:terminal-square" />
      <div><h2>{{ status.ready ? 'Python 已就绪' : 'Python 尚未就绪' }}</h2><p>{{ status.ready ? `${status.version} · ${status.path}` : '开发环境可通过 MIRA_PYTHON_PATH 指定运行时，正式安装包会从 resources/python 加载。' }}</p></div>
      <el-tag :type="status.ready ? 'success' : 'warning'" effect="plain">{{ status.ready ? (status.bundled ? '内置运行时' : '系统运行时') : '未检测到' }}</el-tag>
    </section>
    <section class="package-section"><div><h2>安装 Python 包</h2><p>仅支持单个包名，安装到 Mira 使用的运行时中。</p></div><div class="package-form"><el-input v-model="packageName" placeholder="例如 openpyxl" @keydown.enter="install"/><el-button type="primary" :loading="installing" :disabled="!packageName.trim()" @click="install">安装</el-button></div><pre v-if="output">{{ output }}</pre></section>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getPlatformApi } from '@/platform'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'
const status = reactive({ ready: false, path: '', version: '', bundled: false }); const packageName = ref(''); const installing = ref(false); const output = ref('')
async function load() { const value = await getPlatformApi()?.getPythonStatus(); if (value) Object.assign(status, value) }
async function install() { const api = getPlatformApi(); if (!api || !packageName.value.trim()) return; installing.value = true; output.value = ''; try { const result = await api.pythonInstallPackage(packageName.value.trim()); output.value = `${result.stdout}${result.stderr}`; ElMessage.success('Python 包安装完成'); await load() } catch (error) { output.value = error instanceof Error ? error.message : String(error); ElMessage.error('Python 包安装失败') } finally { installing.value = false } }
onMounted(load)
</script>

<style scoped lang="scss">
.page-description { margin: 0 0 $spacing-xl; color: var(--cp-text-secondary); font-size: $font-sm; }
.python-status, .package-section { padding: $spacing-lg; border: 1px solid var(--cp-border-light); border-radius: $radius-md; background: var(--cp-bg-elevated); }.python-status { display: flex; align-items: center; gap: $spacing-md; }.python-status > .app-icon { color: var(--cp-primary); font-size: 28px; }.python-status div { flex: 1; min-width: 0; }.python-status h2, .package-section h2 { margin: 0; font-size: $font-lg; }.python-status p, .package-section p { margin: 5px 0 0; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.55; overflow-wrap: anywhere; }.package-section { margin-top: $spacing-lg; }.package-form { display: flex; max-width: 520px; gap: $spacing-sm; margin-top: $spacing-lg; }.package-form .el-input { flex: 1; }.package-section pre { max-height: 220px; overflow: auto; margin: $spacing-md 0 0; padding: $spacing-md; color: var(--cp-text-secondary); background: var(--cp-bg); white-space: pre-wrap; }
</style>
