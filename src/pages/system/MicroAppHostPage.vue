<template>
  <PageContainer :title="app?.name || '微应用'" :description="app?.description || '正在加载微应用配置'">
    <el-card shadow="never" v-loading="loading">
      <el-result icon="info" title="微应用容器待接入" sub-title="已按当前用户权限取得运行配置；接入 wujie-vue3 后，此位置将挂载子应用。">
        <template #extra><el-descriptions v-if="app" :column="1" border><el-descriptions-item label="应用编码">{{ app.code }}</el-descriptions-item><el-descriptions-item label="入口 URL">{{ app.url }}</el-descriptions-item><el-descriptions-item label="加载策略">{{ strategy }}</el-descriptions-item></el-descriptions></template>
      </el-result>
    </el-card>
  </PageContainer>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import PageContainer from '@/components/PageContainer/index.vue'
import { microAppApi } from '@/api/system'
import type { MicroApp, MicroAppRuntimeConfig } from '@/types'
const route = useRoute(); const app = ref<MicroApp>(); const runtime = ref<MicroAppRuntimeConfig>(); const loading = ref(true)
const strategy = computed(() => { const c = runtime.value; if (!c) return '-'; return [c.alive && '保活', c.sync && '同步路由', c.fiber && '协程模式', c.degrade && '降级 iframe'].filter(Boolean).join(' / ') || '默认' })
Promise.all([microAppApi.getByCode(String(route.params.code)), microAppApi.getRuntime(String(route.params.code))]).then(([microApp, config]) => { app.value = microApp; runtime.value = config }).finally(() => { loading.value = false })
</script>
