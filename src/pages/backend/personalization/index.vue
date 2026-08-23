<template>
  <SettingsPageShell title="个性化">
    <section class="personalization-section" aria-labelledby="instructions-heading">
      <div class="section-heading">
        <div>
          <h2 id="instructions-heading">自定义指令</h2>
          <p>为所有 Mira 对话提供持续有效的行为和语气说明。当前用户消息可以针对单次任务提出明确例外。</p>
        </div>
        <el-button type="primary" :loading="instructionsSaving" @click="saveInstructions">保存</el-button>
      </div>
      <el-input v-model="instructions" type="textarea" :autosize="{ minRows: 10, maxRows: 20 }" resize="vertical" placeholder="输入适用于所有对话的自定义指令…" aria-label="自定义指令" />
      <p v-if="instructionsPath" class="file-hint">保存位置：{{ instructionsPath }}</p>
    </section>

    <section class="personalization-section" aria-labelledby="memory-heading">
      <div class="section-heading">
        <div>
          <h2 id="memory-heading">记忆</h2>
          <p>配置 Mira 如何收集、保留和整合你的全局偏好与长期上下文。</p>
        </div>
      </div>
      <div class="settings-list">
        <div class="settings-row">
          <div class="settings-row__copy">
            <span class="settings-row__label">启用记忆</span>
            <span class="settings-row__hint">自动提炼长期事实，并在每次对话时从本地记忆文件载入相关内容</span>
          </div>
          <el-switch v-model="memoryEnabled" :loading="memorySaving" aria-label="启用记忆" @change="setMemoryEnabled" />
        </div>
        <div class="settings-row">
          <div class="settings-row__copy">
            <span class="settings-row__label">重置记忆</span>
            <span class="settings-row__hint">删除所有 Mira 全局记忆</span>
          </div>
          <el-button type="danger" plain :loading="memoryResetting" @click="resetMemory">重置</el-button>
        </div>
      </div>
      <p v-if="memoryPath" class="file-hint">全局记忆文件：{{ memoryPath }}。关联项目后的会话会使用独立的项目记忆文件。</p>
    </section>

    <section class="personalization-section" aria-labelledby="identity-heading">
      <div class="section-heading">
        <div>
          <h2 id="identity-heading">身份设定</h2>
          <p>设置你与 Mira 的默认称呼；未填写时分别使用“你”和“Mira”。</p>
        </div>
      </div>
      <div class="identity-settings">
        <div class="identity-card">
          <span class="identity-card__label">Mira 对你的称呼</span>
          <el-input v-if="editingMiraUserName" id="mira-user-name" v-model="miraUserName" clearable maxlength="32" placeholder="默认：你" aria-label="Mira 对你的称呼" />
          <p v-else class="identity-card__value">{{ miraUserName || '默认：你' }}</p>
          <div class="identity-card__actions">
            <template v-if="editingMiraUserName">
              <el-button @click="cancelMiraUserName">取消</el-button>
              <el-button type="primary" :disabled="miraUserName === savedMiraUserName" @click="saveMiraUserName">保存</el-button>
            </template>
            <el-button v-else @click="editMiraUserName">编辑</el-button>
          </div>
        </div>
        <div class="identity-card">
          <span class="identity-card__label">你对 Mira 的称呼</span>
          <el-input v-if="editingMiraAssistantName" id="mira-assistant-name" v-model="miraAssistantName" clearable maxlength="32" placeholder="默认：Mira" aria-label="你对 Mira 的称呼" />
          <p v-else class="identity-card__value">{{ miraAssistantName || '默认：Mira' }}</p>
          <div class="identity-card__actions">
            <template v-if="editingMiraAssistantName">
              <el-button @click="cancelMiraAssistantName">取消</el-button>
              <el-button type="primary" :disabled="miraAssistantName === savedMiraAssistantName" @click="saveMiraAssistantName">保存</el-button>
            </template>
            <el-button v-else @click="editMiraAssistantName">编辑</el-button>
          </div>
        </div>
      </div>
    </section>

    <section class="personalization-section" aria-labelledby="tone-heading">
      <div class="section-heading">
        <div>
          <h2 id="tone-heading">回复语气</h2>
          <p>选择 Mira 回复的默认语气。</p>
        </div>
      </div>
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="并非所有模型都支持个性设置。可在自定义指令中调整 Mira 的行为和语气。"
        class="personalization-alert"
      />
      <div class="settings-list">
        <div class="settings-row">
          <div class="settings-row__copy">
            <span class="settings-row__label">Mira 回复语气</span>
            <span class="settings-row__hint">轻松模式更自然亲切；专业模式更清晰、克制、结构化。</span>
          </div>
          <el-radio-group class="assistant-tone-picker" :model-value="assistantTone" aria-label="Mira 回复语气" @change="setAssistantTone">
            <el-radio-button value="casual">轻松</el-radio-button>
            <el-radio-button value="professional">专业</el-radio-button>
          </el-radio-group>
        </div>
      </div>
    </section>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { DEFAULT_ASSISTANT_TONE, normalizeAssistantTone, normalizeMiraIdentityName, type AssistantTone } from '@/config/harness'
import { getPlatformApi, getPreference, savePreference } from '@/platform'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

const instructions = ref('')
const instructionsPath = ref('')
const instructionsSaving = ref(false)
const memoryEnabled = ref(false)
const memoryPath = ref('')
const memorySaving = ref(false)
const memoryResetting = ref(false)
const assistantTone = computed<AssistantTone>(() => normalizeAssistantTone(getPreference<unknown>('assistantTone', DEFAULT_ASSISTANT_TONE)))
const savedMiraUserName = ref(normalizeMiraIdentityName(getPreference<unknown>('miraUserName', '')))
const miraUserName = ref(savedMiraUserName.value)
const editingMiraUserName = ref(false)
const savedMiraAssistantName = ref(normalizeMiraIdentityName(getPreference<unknown>('miraAssistantName', '')))
const miraAssistantName = ref(savedMiraAssistantName.value)
const editingMiraAssistantName = ref(false)

async function load() {
  const api = getPlatformApi()
  if (!api) return
  const [content, path, enabled, savedMemoryPath] = await Promise.all([
    api.getGlobalInstructions(), api.getGlobalInstructionsPath(), api.getHarnessMemoryEnabled(), api.getHarnessMemoryPath(),
  ])
  instructions.value = content
  instructionsPath.value = path
  memoryEnabled.value = enabled
  memoryPath.value = savedMemoryPath
}

async function saveInstructions() {
  const api = getPlatformApi()
  if (!api || instructionsSaving.value) return
  instructionsSaving.value = true
  try {
    await api.saveGlobalInstructions(instructions.value)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '自定义指令保存失败')
  } finally {
    instructionsSaving.value = false
  }
}

async function setMemoryEnabled(value: boolean) {
  const api = getPlatformApi()
  if (!api || memorySaving.value) return
  memorySaving.value = true
  try {
    memoryEnabled.value = await api.setHarnessMemoryEnabled(value)
  } catch (error) {
    memoryEnabled.value = !value
    ElMessage.error(error instanceof Error ? error.message : '记忆设置保存失败')
  } finally {
    memorySaving.value = false
  }
}

async function resetMemory() {
  const api = getPlatformApi()
  if (!api || memoryResetting.value) return
  try {
    await ElMessageBox.confirm('将清空全局记忆文件中的所有内容，且无法恢复。', '重置记忆', { type: 'warning', confirmButtonText: '重置', cancelButtonText: '取消' })
  } catch {
    return
  }
  memoryResetting.value = true
  try {
    await api.resetHarnessMemory()
    ElMessage.success('记忆已重置')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '记忆重置失败')
  } finally {
    memoryResetting.value = false
  }
}

function setAssistantTone(value: string) {
  savePreference('assistantTone', normalizeAssistantTone(value))
}

function saveMiraUserName() {
  const value = normalizeMiraIdentityName(miraUserName.value)
  miraUserName.value = value
  savedMiraUserName.value = value
  savePreference('miraUserName', value)
  editingMiraUserName.value = false
}

function editMiraUserName() {
  miraUserName.value = savedMiraUserName.value
  editingMiraUserName.value = true
}

function cancelMiraUserName() {
  miraUserName.value = savedMiraUserName.value
  editingMiraUserName.value = false
}

function saveMiraAssistantName() {
  const value = normalizeMiraIdentityName(miraAssistantName.value)
  miraAssistantName.value = value
  savedMiraAssistantName.value = value
  savePreference('miraAssistantName', value)
  editingMiraAssistantName.value = false
}

function editMiraAssistantName() {
  miraAssistantName.value = savedMiraAssistantName.value
  editingMiraAssistantName.value = true
}

function cancelMiraAssistantName() {
  miraAssistantName.value = savedMiraAssistantName.value
  editingMiraAssistantName.value = false
}

onMounted(() => { void load() })
</script>

<style scoped lang="scss">
.personalization-section { min-width: 0; margin-bottom: 38px; }
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; margin-bottom: 14px; }
.section-heading h2 { margin: 0; color: var(--cp-text); font-size: 18px; font-weight: $font-semibold; }
.section-heading p { margin: 6px 0 0; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.55; }
.settings-list { overflow: hidden; border: 1px solid var(--cp-border-light); border-radius: var(--cp-radius-md); }
.settings-row { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 66px; padding: 12px 16px; }
.settings-row + .settings-row { border-top: 1px solid var(--cp-border-light); }
.settings-row__copy { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.settings-row__label { color: var(--cp-text); font-size: $font-sm; }
.settings-row__hint, .file-hint { color: var(--cp-text-secondary); font-size: $font-xs; line-height: 1.5; }
.file-hint { margin: 8px 0 0; word-break: break-all; }
.identity-settings { display: grid; gap: 16px; }
.identity-card { padding: 18px; border: 1px solid var(--cp-border-light); border-radius: var(--cp-radius-md); }
.identity-card__label { display: block; margin-bottom: 12px; color: var(--cp-text); font-size: $font-sm; font-weight: $font-semibold; }
.identity-card__value { min-height: 32px; margin: 0; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 32px; }
.identity-card__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.personalization-alert { margin: 0 0 14px; }
.assistant-tone-picker :deep(.el-radio-button) { --el-radio-button-checked-bg-color: var(--cp-primary); --el-radio-button-checked-text-color: var(--cp-primary-contrast); --el-radio-button-checked-border-color: var(--cp-primary); }
</style>
