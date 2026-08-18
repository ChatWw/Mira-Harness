<template>
  <SettingsPageShell title="关于" :show-title="false" wide>
    <section class="about-page" aria-labelledby="about-product-name">
      <div class="about-identity">
        <img class="about-logo" :src="miraLogo" alt="Mira Harness 图标">
        <h2 id="about-product-name">Mira Harness</h2>
        <p class="about-description">Mira Harness 是一款本地优先的个人工具工作台：与 AI 助手 Mira（米拉）对话，即可完成小说创作、项目整理与自动化任务。</p>
        <ul class="about-features">
          <li><AppIcon name="lucide:book-open" size="16" color="var(--cp-primary)" /><span>小说创作 · 设定、大纲、章节与正文</span></li>
          <li><AppIcon name="lucide:bot" size="16" color="var(--cp-primary)" /><span>Agent 工作台 · 对话、MCP、Git 与模型管理</span></li>
          <li><AppIcon name="lucide:database" size="16" color="var(--cp-primary)" /><span>本地优先 · SQLite 项目库，数据与密钥不出本机</span></li>
          <li><AppIcon name="lucide:layout-grid" size="16" color="var(--cp-primary)" /><span>微应用宿主 · 支持 Wujie 与 iframe 工具</span></li>
        </ul>
      </div>

      <dl class="about-details">
        <div>
          <dt>版本信息</dt>
          <dd>v{{ appVersion }}</dd>
        </div>
        <div>
          <dt>问题反馈</dt>
          <dd class="feedback-detail">
            <el-button link class="feedback-copy" @click="copyFeedbackEmail">
              <span class="feed-email"><AppIcon name="material-symbols:stacked-email-outline-rounded" /> {{ feedbackEmail }}</span>
            </el-button>
          </dd>
        </div>
        <div>
          <dt>关于我</dt>
          <dd>
            <a class="github-link" href="https://github.com/ChatWw" target="_blank" rel="noreferrer">
              <AppIcon name="tabler:brand-github" />
              &nbsp;Github
              <AppIcon name="TopRight" />
            </a>
          </dd>
        </div>
      </dl>

      <section class="support-section" aria-labelledby="support-heading">
        <h3 id="support-heading">支持与鼓励</h3>
        <p>如果您喜欢 Mira Harness，欢迎支持我们——您的鼓励会推动它持续优化与成长。</p>
        <el-popover placement="top" :width="300" trigger="click" title="支持 支付宝/微信 扫一扫">
          <template #reference>
            <el-button type="primary"><AppIcon name="lucide:wallet" />&nbsp;打赏支持 </el-button>
          </template>
          <div class="payment-code">
            <img :src="paymentCode" alt="Mira Harness 打赏收款码">
          </div>
        </el-popover>
      </section>

      <p class="about-credit">Powered by Tuyn53</p>
    </section>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import miraLogo from '@/asset/mira-logo.png'
import paymentCode from '@/asset/paymentCode.jpg'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

const appVersion = __MIRA_VERSION__
const feedbackEmail = 'tuyn53@163.com'

async function copyFeedbackEmail() {
  let copied = false
  try {
    await navigator.clipboard.writeText(feedbackEmail)
    copied = true
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = feedbackEmail
    document.body.appendChild(textarea)
    textarea.select()
    copied = document.execCommand('copy')
    textarea.remove()
  }

  if (copied) ElMessage.success('反馈邮箱已复制')
  else ElMessage.error('复制失败，请检查剪贴板权限')
}
</script>

<style scoped lang="scss">
.about-page { width: min(100%, 760px); margin: 12px auto 0; text-align: center; }
.about-identity { display: flex; align-items: center; flex-direction: column; }
.about-logo { width: 76px; height: 76px; border-radius: 19px; box-shadow: $shadow-md; object-fit: cover; }
.about-identity h2 { margin: $spacing-lg 0 $spacing-sm; color: var(--cp-text); font-size: $font-2xl; line-height: 1.25; }
.about-identity p.about-description { max-width: 34em; margin: 0; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.8; }
.about-features { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: $spacing-sm; width: min(100%, 640px); margin: $spacing-lg 0 0; padding: 0; list-style: none; }
.about-features li { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border: 1px solid var(--cp-border-light); border-radius: var(--cp-radius-md); color: var(--cp-text); font-size: $font-sm; line-height: 1.5; text-align: left; }
.about-features .app-icon { flex-shrink: 0; }
.about-details { margin: $spacing-xl 0 $spacing-lg; border-top: 1px solid var(--cp-border-light); border-bottom: 1px solid var(--cp-border-light); }
.about-details div { display: flex; align-items: center; justify-content: space-between; gap: $spacing-lg; padding: $spacing-md 0; }
.about-details div + div { border-top: 1px solid var(--cp-border-light); }
.about-details dt { color: var(--cp-text-secondary); font-size: $font-sm; }
.about-details dd { display: flex; align-items: center; justify-content: flex-end; min-width: 0; margin: 0; color: var(--cp-text); font-size: $font-sm; font-weight: $font-medium; }
.feedback-detail { gap: 4px; white-space: nowrap; }
.feedback-copy { height: auto; padding: 0; font: inherit; }
.feedback-copy :deep(.app-icon), .github-link :deep(.app-icon) { margin-right: 4px; }
.github-link { display: inline-flex; align-items: center; color: var(--cp-primary); font: inherit; text-decoration: none; }
.github-link :deep(.app-icon) { width: 14px; height: 14px; margin: 0 0 0 4px; }
.support-section { padding: $spacing-xl 0 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.support-section h3 { margin: 0 0 $spacing-sm; color: var(--cp-text); font-size: $font-lg; line-height: 1.5; }
.support-section p { max-width: 34em; margin: 0 0 $spacing-lg; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.7; }
.about-credit { margin: $spacing-xl 0 0; color: var(--cp-text-tertiary); font-size: $font-xs; }
.payment-code { display: flex; justify-content: center; }
.payment-code img { display: block; width: min(100%, 260px); border-radius: var(--cp-radius-md); }
.feed-email {
  transition: all 0.3s ease-in-out;
  text-decoration: none;
  &:hover {
    color: var(--cp-primary);
    text-decoration: underline;
  }
}

@media (max-width: 768px) {
  .about-page { margin-top: 0; }
  .about-features { grid-template-columns: 1fr; }
  .about-details div { align-items: flex-start; flex-direction: column; gap: 6px; }
  .about-details dd { justify-content: flex-start; }
}
</style>
