<template>
  <SettingsPageShell title="AI 小说">
    <p class="page-description">为原生小说工作台配置 OpenAI 兼容模型。创作模型负责大纲、章节和正文；自动处理模型负责批量优化与拆书。</p>
    <el-alert v-if="!desktopAvailable" type="warning" :closable="false" show-icon title="AI 小说完整功能仅在 Mira 桌面端中可用。" class="platform-alert" />

    <section v-for="role in roles" :key="role.key" class="model-section" :aria-labelledby="`${role.key}-heading`">
      <div class="section-heading">
        <div><h2 :id="`${role.key}-heading`">{{ role.title }}</h2><p>{{ role.description }}</p></div>
        <el-button text :loading="testing === role.key" :disabled="!desktopAvailable" @click="testModel(role.key)">测试连接</el-button>
      </div>
      <el-form label-position="top" :disabled="!desktopAvailable">
        <el-form-item label="API 地址（OpenAI 兼容）"><el-input v-model="form[role.key].endpoint" placeholder="https://api.example.com/v1 或完整 chat/completions 地址" /></el-form-item>
        <el-form-item label="API Key"><el-input v-model="form[role.key].apiKey" type="password" show-password autocomplete="off" placeholder="sk-…" /></el-form-item>
        <el-form-item label="模型 ID"><el-input v-model="form[role.key].modelId" placeholder="例如 deepseek-chat" /></el-form-item>
      </el-form>
      <div v-if="testResult[role.key]" class="test-result" :class="{ 'is-error': !testResult[role.key]?.ok }">
        <strong>{{ testResult[role.key]?.ok ? '连接成功' : '连接失败' }}</strong><span>{{ testResult[role.key]?.text }}</span>
      </div>
    </section>

    <div class="action-bar"><el-button type="primary" :loading="saving" :disabled="!desktopAvailable" @click="saveProfiles">保存模型配置</el-button></div>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { EMPTY_NOVEL_MODEL_PROFILES, NOVEL_MODEL_PROFILES_PREFERENCE_KEY, type NovelModelProfiles, type NovelModelRole } from '@/config/novel'
import { platformPreferences } from '@/config/runtime'
import { getPlatformApi, savePreference } from '@/platform'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

const api = getPlatformApi()
const desktopAvailable = Boolean(api)
const saving = ref(false)
const testing = ref<NovelModelRole>()
const testResult = reactive<Partial<Record<NovelModelRole, { ok: boolean; text: string }>>>({})
const roles = [
  { key: 'authoring' as const, title: '创作模型', description: '用于总纲、章节、正文、书名简介和自由创作助手。' },
  { key: 'automation' as const, title: '自动处理模型', description: '用于批量迭代优化、内容拆分等高频处理任务。' },
]
const form = reactive<NovelModelProfiles>({
  authoring: { ...EMPTY_NOVEL_MODEL_PROFILES.authoring },
  automation: { ...EMPTY_NOVEL_MODEL_PROFILES.automation },
})

function loadProfiles() {
  const stored = platformPreferences[NOVEL_MODEL_PROFILES_PREFERENCE_KEY]
  if (!stored || typeof stored !== 'object') return
  const profiles = stored as Partial<NovelModelProfiles>
  roles.forEach(({ key }) => {
    const source = profiles[key]
    if (!source || typeof source !== 'object') return
    form[key].endpoint = typeof source.endpoint === 'string' ? source.endpoint : ''
    form[key].apiKey = typeof source.apiKey === 'string' ? source.apiKey : ''
    form[key].modelId = typeof source.modelId === 'string' ? source.modelId : ''
  })
}

function snapshotProfiles(): NovelModelProfiles {
  return { authoring: { ...form.authoring }, automation: { ...form.automation } }
}

async function saveProfiles() {
  saving.value = true
  try {
    const profiles = snapshotProfiles()
    if (api) {
      await api.savePreference(NOVEL_MODEL_PROFILES_PREFERENCE_KEY, profiles)
      platformPreferences[NOVEL_MODEL_PROFILES_PREFERENCE_KEY] = profiles
    } else {
      savePreference(NOVEL_MODEL_PROFILES_PREFERENCE_KEY, profiles)
    }
    ElMessage.success('模型配置已保存')
  } finally {
    saving.value = false
  }
}

async function testModel(role: NovelModelRole) {
  if (!api) return
  testing.value = role
  testResult[role] = undefined
  try {
    await saveProfiles()
    testResult[role] = await api.testNovelModelConnection(role)
  } catch (error) {
    testResult[role] = { ok: false, text: error instanceof Error ? error.message : String(error) }
  } finally {
    testing.value = undefined
  }
}

onMounted(loadProfiles)
</script>

<style scoped lang="scss">
.page-description { margin: 0 0 $spacing-xl; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.6; }
.platform-alert { margin-bottom: $spacing-md; }
.model-section { padding: 0 0 $spacing-xl; margin-bottom: $spacing-xl; border-bottom: 1px solid var(--cp-border-light); }
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: $spacing-md; margin-bottom: $spacing-md; }
.section-heading h2 { margin: 0; color: var(--cp-text); font-size: $font-base; font-weight: $font-semibold; }
.section-heading p { margin: 5px 0 0; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.6; }
.test-result { display: flex; gap: $spacing-sm; padding: $spacing-sm $spacing-md; color: var(--cp-text-secondary); background: var(--cp-bg-hover); border: 1px solid var(--cp-border-light); border-radius: $radius-md; font-size: $font-sm; line-height: 1.55; }
.test-result strong { color: var(--cp-success); white-space: nowrap; }.test-result.is-error strong { color: var(--cp-danger); }
.action-bar { display: flex; justify-content: flex-end; }
</style>
