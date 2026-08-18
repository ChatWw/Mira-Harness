<template>
  <SettingsPageShell title="Git" :show-title="true">
    <section class="git-settings" aria-label="Git 设置">
      <div class="git-settings__list">
        <div class="git-settings__row">
          <div class="git-settings__copy">
            <span class="git-settings__label">分支前缀</span>
            <span class="git-settings__hint">创建新分支时自动填入的前缀。</span>
          </div>
          <div class="git-settings__control">
            <el-input v-model="config.branchPrefix" aria-label="分支前缀" placeholder="例如 mira/" />
            <span v-if="prefixError" class="git-settings__error">{{ prefixError }}</span>
          </div>
        </div>
        <div class="git-settings__row">
          <div class="git-settings__copy"><span class="git-settings__label">拉取请求合并方法</span><span class="git-settings__hint">创建拉取请求时建议使用的合并方式。</span></div>
          <el-radio-group v-model="config.pullRequestMergeMethod" aria-label="拉取请求合并方法"><el-radio-button value="merge">合并</el-radio-button><el-radio-button value="squash">压缩</el-radio-button></el-radio-group>
        </div>
        <div class="git-settings__row">
          <div class="git-settings__copy"><span class="git-settings__label">始终强制推送</span><span class="git-settings__hint">未来从 Mira 推送时使用强制推送参数。</span></div>
          <el-switch v-model="config.alwaysForcePush" aria-label="始终强制推送" />
        </div>
        <div class="git-settings__row">
          <div class="git-settings__copy"><span class="git-settings__label">创建草稿拉取请求</span><span class="git-settings__hint">未来创建 PR 时默认创建为草稿。</span></div>
          <el-switch v-model="config.createDraftPullRequest" aria-label="创建草稿拉取请求" />
        </div>
        <div class="git-settings__row">
          <div class="git-settings__copy"><span class="git-settings__label">代码评审交付</span><span class="git-settings__hint">未来代码评审结果的默认呈现方式。</span></div>
          <el-radio-group v-model="config.reviewDelivery" aria-label="代码评审交付"><el-radio-button value="inline">行内视图</el-radio-button><el-radio-button value="separate">分离视图</el-radio-button></el-radio-group>
        </div>
      </div>
    </section>

    <section class="git-instructions">
      <div class="git-instructions__heading"><div><h2>提交指令</h2><p>将供未来提交信息生成时使用。</p></div></div>
      <el-input v-model="config.commitInstructions" type="textarea" :autosize="{ minRows: 5, maxRows: 10 }" resize="vertical" placeholder="添加提交信息指引..." aria-label="提交指令" />
    </section>
    <section class="git-instructions">
      <div class="git-instructions__heading"><div><h2>拉取请求指令</h2><p>将供未来 PR 标题和描述生成时使用。</p></div></div>
      <el-input v-model="config.pullRequestInstructions" type="textarea" :autosize="{ minRows: 5, maxRows: 10 }" resize="vertical" placeholder="添加拉取请求指引..." aria-label="拉取请求指令" />
    </section>
    <div class="git-settings__actions"><el-button type="primary" :disabled="Boolean(prefixError)" :loading="saving" @click="save">保存 Git 设置</el-button></div>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { DEFAULT_HARNESS_GIT_CONFIG, type HarnessGitConfig } from '@/config/harness'
import { getPlatformApi } from '@/platform'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

const config = reactive<HarnessGitConfig>({ ...DEFAULT_HARNESS_GIT_CONFIG })
const saving = ref(false)
const prefixError = computed(() => {
  const value = config.branchPrefix.trim()
  if (!value || (value.endsWith('/') && !/[\s~^:?*[\\]/.test(value) && !value.includes('//') && !value.includes('..') && !value.includes('@{') && !/(?:^|\/)\.|\.lock(?:\/|$)/.test(value))) return ''
  return '前缀必须为空或以“/”结尾，且不能包含非法 Git 字符。'
})

async function load() {
  const value = await getPlatformApi()?.getHarnessGitConfig()
  if (value) Object.assign(config, value)
}
async function save() {
  if (saving.value || prefixError.value) return
  const api = getPlatformApi()
  if (!api) return
  saving.value = true
  try {
    Object.assign(config, await api.saveHarnessGitConfig({ ...config, branchPrefix: config.branchPrefix.trim() }))
    ElMessage.success('Git 设置已保存')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存 Git 设置失败')
  } finally { saving.value = false }
}

onMounted(() => { void load() })
</script>

<style scoped lang="scss">
.git-settings__list { overflow: hidden; border: 1px solid var(--cp-border-light); border-radius: var(--cp-radius-md); }
.git-settings__row { display: flex; min-height: 68px; align-items: center; justify-content: space-between; gap: 24px; padding: 12px 16px; border-bottom: 1px solid var(--cp-border-light); }
.git-settings__row:last-child { border-bottom: 0; }
.git-settings__copy { display: flex; min-width: 0; flex-direction: column; gap: 4px; }.git-settings__label { color: var(--cp-text); font-size: $font-sm; }.git-settings__hint { color: var(--cp-text-secondary); font-size: $font-xs; line-height: 1.5; }
.git-settings__control { width: min(280px, 42%); }.git-settings__error { display: block; margin-top: 5px; color: var(--cp-danger); font-size: $font-xs; line-height: 1.35; }
.git-settings :deep(.el-radio-button__inner) { box-shadow: none !important; }.git-settings :deep(.el-radio-button.is-active .el-radio-button__inner) { color: var(--cp-primary-contrast); background: var(--cp-primary); border-color: var(--cp-primary); }
.git-instructions { margin-top: 38px; }.git-instructions__heading { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 14px; }.git-instructions h2 { margin: 0; color: var(--cp-text); font-size: 18px; font-weight: $font-semibold; }.git-instructions p { margin: 6px 0 0; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.55; }
.git-settings__actions { display: flex; justify-content: flex-end; margin-top: 20px; }
@media (max-width: 640px) { .git-settings__row { align-items: flex-start; flex-direction: column; gap: 10px; }.git-settings__control { width: 100%; }.git-settings__row :deep(.el-switch), .git-settings__row :deep(.el-radio-group) { align-self: flex-end; } }
</style>
