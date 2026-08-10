<template>
  <SettingsPageShell title="AI 小说">
    <p class="page-description">
      配置内置「AI 小说创作」微应用的模型接入。gen 用于大纲、章节和正文生成，gen2 用于批量迭代与拆书；保存后立即生效。
    </p>
    <el-alert
      v-if="!desktopAvailable"
      type="warning"
      :closable="false"
      show-icon
      title="AI 小说仅在桌面端中可用。"
      class="platform-alert"
    />

    <section class="novel-section" aria-labelledby="entry-heading">
      <div class="section-heading">
        <h2 id="entry-heading">接入信息</h2>
        <p>微应用由 Mira 本地服务提供，入口地址仅供查看。</p>
      </div>
      <div class="entry-row">
        <span class="entry-row__label">本地入口</span>
        <code class="entry-row__url">{{ entryUrl || (desktopAvailable ? '正在解析…' : '仅桌面端可用') }}</code>
      </div>
    </section>

    <section
      v-for="slot in slots"
      :key="slot.key"
      class="novel-section"
      :aria-labelledby="`${slot.key}-heading`"
    >
      <div class="section-heading">
        <h2 :id="`${slot.key}-heading`">{{ slot.title }}</h2>
        <p>{{ slot.hint }}</p>
      </div>
      <el-form label-position="top" :disabled="!desktopAvailable">
        <el-form-item label="API 地址（OpenAI 兼容）">
          <el-input
            v-model="form[slot.key].endpoint"
            placeholder="https://api.deepseek.com/v1 或完整 chat/completions 地址"
          />
        </el-form-item>
        <el-form-item label="API Key">
          <el-input
            v-model="form[slot.key].apiKey"
            type="password"
            show-password
            autocomplete="off"
            placeholder="sk-…"
          />
        </el-form-item>
        <el-form-item label="模型名">
          <el-input v-model="form[slot.key].model" placeholder="deepseek-chat" />
        </el-form-item>
      </el-form>
    </section>

    <div class="action-bar">
      <el-button type="primary" :loading="saving" :disabled="!desktopAvailable" @click="saveConfig">
        保存配置
      </el-button>
      <el-button :loading="testing" :disabled="!desktopAvailable" @click="testConnection">
        测试连接（gen）
      </el-button>
    </div>

    <div v-if="testResult" class="test-result" :class="{ 'is-error': testResult.ok === false }">
      <strong>{{ testResult.ok ? '连接成功' : '连接失败' }}</strong>
      <pre>{{ testResult.text }}</pre>
    </div>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { EMPTY_NOVEL_API_CONFIG, NOVEL_API_PREFERENCE_KEY, type NovelApiConfig } from '@/config/novelApi'
import { platformPreferences } from '@/config/runtime'
import { getPlatformApi, savePreference } from '@/platform'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

const desktopAvailable = Boolean(getPlatformApi())
const api = getPlatformApi()
const saving = ref(false)
const testing = ref(false)
const entryUrl = ref('')
const testResult = ref<{ ok: boolean; text: string }>()

const slots = [
  { key: 'gen' as const, title: 'gen 接口', hint: '好模型，用于大纲、章节、正文的生成。' },
  { key: 'gen2' as const, title: 'gen2 接口', hint: '低成本模型，用于 AI 批量自我迭代与拆书。' },
]

const form = reactive<NovelApiConfig>({
  gen: { ...EMPTY_NOVEL_API_CONFIG.gen },
  gen2: { ...EMPTY_NOVEL_API_CONFIG.gen2 },
})

function loadFromPreferences() {
  const stored = platformPreferences[NOVEL_API_PREFERENCE_KEY]
  if (!stored || typeof stored !== 'object') return
  const raw = stored as Partial<NovelApiConfig>
  for (const slot of slots) {
    const value = raw[slot.key]
    if (value && typeof value === 'object') {
      form[slot.key].endpoint = typeof value.endpoint === 'string' ? value.endpoint : ''
      form[slot.key].apiKey = typeof value.apiKey === 'string' ? value.apiKey : ''
      form[slot.key].model = typeof value.model === 'string' ? value.model : ''
    }
  }
}

async function saveConfig() {
  saving.value = true
  try {
    const payload = { gen: { ...form.gen }, gen2: { ...form.gen2 } }
    if (api) {
      await api.savePreference(NOVEL_API_PREFERENCE_KEY, payload)
      platformPreferences[NOVEL_API_PREFERENCE_KEY] = payload
    } else {
      savePreference(NOVEL_API_PREFERENCE_KEY, payload)
    }
    ElMessage.success('AI 小说配置已保存')
  } finally {
    saving.value = false
  }
}

async function testConnection() {
  if (!api) return
  testing.value = true
  testResult.value = undefined
  await saveConfig()
  try {
    const result = await api.testNovelConnection('gen')
    testResult.value = result
  } catch (error) {
    testResult.value = { ok: false, text: error instanceof Error ? error.message : String(error) }
  } finally {
    testing.value = false
  }
}

onMounted(async () => {
  loadFromPreferences()
  if (!api) return
  try {
    entryUrl.value = await api.resolveLocalMicroAppUrl('micro-ai-novel')
  } catch {
    entryUrl.value = ''
  }
})
</script>

<style scoped lang="scss">
.page-description { margin: 0 0 18px; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.6; }
.platform-alert { margin-bottom: 18px; }

.novel-section { margin-bottom: 28px; }
.section-heading { margin-bottom: 16px; }
.section-heading h2 { margin: 0; color: var(--cp-text); font-size: 16px; font-weight: $font-semibold; }
.section-heading p { margin: 6px 0 0; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.6; }

.entry-row {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid var(--cp-border-light);
  border-radius: 8px;
  background: var(--cp-bg-muted, rgba(127, 127, 127, 0.06));
}
.entry-row__label { color: var(--cp-text-secondary); font-size: $font-sm; white-space: nowrap; }
.entry-row__url { color: var(--cp-text); font-size: $font-xs; word-break: break-all; }

.action-bar { display: flex; gap: 12px; align-items: center; }

.test-result {
  margin-top: 18px;
  padding: 12px 16px;
  border: 1px solid var(--cp-border-light);
  border-radius: 8px;
  background: var(--cp-bg-muted, rgba(127, 127, 127, 0.06));
}
.test-result strong { display: block; margin-bottom: 6px; color: var(--cp-success, #67c23a); font-size: $font-sm; }
.test-result.is-error strong { color: var(--cp-danger, #f56c6c); }
.test-result pre { margin: 0; color: var(--cp-text-secondary); font-size: $font-xs; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
</style>
