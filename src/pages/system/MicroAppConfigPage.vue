<template>
  <PageContainer :title="`微应用配置：${app?.code || ''}`" description="管理 wujie 子应用的运行策略和主子通信参数">
    <template #actions><el-button @click="router.push('/system/microapps')">返回列表</el-button></template>
    <el-skeleton :loading="loading" animated>
      <template #default>
        <el-card shadow="never" class="section">
          <template #header><span>加载策略</span></template>
          <el-form label-width="150px">
            <template v-if="app?.integrationMode === 'wujie'">
              <el-form-item label="保活模式 (alive)"><el-switch v-model="config.alive" /><span class="hint">切换应用时保留实例状态</span></el-form-item>
              <el-form-item label="路由同步 (sync)"><el-switch v-model="config.sync" /><span class="hint">子应用路由同步到主应用 URL</span></el-form-item>
              <el-form-item label="协程模式 (fiber)"><el-switch v-model="config.fiber" /><span class="hint">兼容性较默认模式低</span></el-form-item>
            </template>
            <template v-else>
              <el-form-item label="sandbox"><el-input v-model="config.iframe.sandbox" /><span class="hint">固定为受控 iframe 权限集</span></el-form-item>
              <el-form-item label="Referrer Policy"><el-select v-model="config.iframe.referrerPolicy"><el-option label="strict-origin-when-cross-origin" value="strict-origin-when-cross-origin" /><el-option label="same-origin" value="same-origin" /></el-select></el-form-item>
              <el-form-item label="加载超时（秒）"><el-input-number v-model="config.iframe.timeout" :min="3" :max="60" /></el-form-item>
            </template>
          </el-form>
          <div class="sub-title">路由前缀</div>
          <el-table :data="prefixRows" border size="small"><el-table-column label="匹配路径" prop="path"><template #default="{ row }"><el-input v-model="row.path" /></template></el-table-column><el-table-column label="替换值" prop="value"><template #default="{ row }"><el-input v-model="row.value" /></template></el-table-column><el-table-column label="操作" width="80"><template #default="{ $index }"><el-button link type="danger" @click="prefixRows.splice($index, 1)">删除</el-button></template></el-table-column></el-table>
          <el-button link type="primary" @click="prefixRows.push({ path: '', value: '' })">+ 添加前缀</el-button>
        </el-card>
        <el-card shadow="never" class="section">
          <template #header><span>主子通信</span></template>
          <el-form label-width="150px"><el-form-item label="上下文覆盖"><el-input v-model="propsText" type="textarea" :rows="5" /></el-form-item><template v-if="app?.integrationMode === 'wujie'"><el-form-item label="预加载 (preload)"><el-switch v-model="config.preload" /></el-form-item><el-form-item label="预加载时执行 JS (exec)"><el-switch v-model="config.exec" /></el-form-item></template></el-form>
          <p class="hint">仅允许 theme、language、tenantId；用户信息由平台运行时生成，令牌不会传给子应用。</p>
        </el-card>
        <el-alert title="生命周期钩子暂未开放" type="info" :closable="false" description="不保存或执行任意 JS 字符串，避免后台配置成为代码执行入口。" />
        <div class="actions"><el-button @click="load">重置</el-button><el-button type="primary" :loading="saving" @click="save">保存配置</el-button></div>
      </template>
    </el-skeleton>
  </PageContainer>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import PageContainer from '@/components/PageContainer/index.vue'
import { microAppApi } from '@/api/system'
import type { MicroApp, MicroAppContextOverrides, MicroAppRuntimeConfig } from '@/types'

const route = useRoute(); const router = useRouter(); const loading = ref(true); const saving = ref(false); const app = ref<MicroApp>()
const defaultIframeConfig = { sandbox: 'allow-scripts allow-forms allow-popups', referrerPolicy: 'strict-origin-when-cross-origin' as ReferrerPolicy, timeout: 15 }
const config = reactive<MicroAppRuntimeConfig>({ alive: false, sync: false, fiber: false, prefix: {}, props: {}, preload: false, exec: false, iframe: defaultIframeConfig })
const prefixRows = ref<{ path: string; value: string }[]>([]); const propsText = ref('{}')
async function load() { loading.value = true; try { const code = String(route.params.code); app.value = await microAppApi.getByCode(code); const data = await microAppApi.getRuntime(code); Object.assign(config, data); prefixRows.value = Object.entries(data.prefix || {}).map(([path, value]) => ({ path, value })); propsText.value = JSON.stringify(data.props || {}, null, 2) } finally { loading.value = false } }
async function save() { let props: MicroAppContextOverrides; try { props = JSON.parse(propsText.value); if (Array.isArray(props) || props === null || Object.keys(props).some(key => !['theme', 'language', 'tenantId'].includes(key))) throw new Error() } catch { ElMessage.error('上下文仅支持 theme、language、tenantId 组成的 JSON 对象'); return } saving.value = true; try { const prefix = Object.fromEntries(prefixRows.value.filter(row => row.path && row.value).map(row => [row.path, row.value])); await microAppApi.updateRuntime(String(route.params.code), { ...config, prefix, props }); ElMessage.success('配置已保存') } finally { saving.value = false } }
load()
</script>
<style scoped lang="scss">.section { margin-bottom: $spacing-md; }.hint { margin-left: $spacing-sm; color: var(--cp-text-secondary); font-size: $font-sm; }.sub-title { margin: $spacing-md 0 $spacing-sm; font-weight: 600; }.actions { display: flex; justify-content: flex-end; gap: $spacing-sm; margin-top: $spacing-lg; }</style>
