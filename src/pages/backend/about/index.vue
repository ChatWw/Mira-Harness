<template>
  <SettingsPageShell class="about-settings" title="关于Mira" :show-title="false">
    <section class="about-page" aria-labelledby="about-product-name">
      <header class="about-identity">
        <img class="about-logo" :src="miraLogo" alt="Mira 图标">
        <div class="about-name">
          <h1 id="about-product-name">Mira</h1>
          <p>你的 AI 工作伙伴</p>
        </div>
        <div class="about-version"><span>当前版本</span><span>v{{ appVersion }}</span></div>
      </header>

      <div class="about-body">
        <section class="about-description" aria-labelledby="about-description-title">
          <h2 id="about-description-title">关于 Mira</h2>
          <p class="about-summary">Mira 是一款用于研究、写作和自动化任务的桌面 AI 工具。</p>
          <p>通过对话处理任务，在工作区浏览文件、预览内容和查看变更。</p>
          <p>支持接入模型、工具、技能、插件和自定义智能体。</p>
          <div class="about-local">
            <h3><AppIcon name="lucide:hard-drive" size="16" />本地优先</h3>
            <p>工作记录与配置主要保存在本机。调用在线服务时，会发送任务所需的内容。</p>
          </div>
        </section>

        <aside class="about-contact" aria-labelledby="about-contact-title">
          <h2 id="about-contact-title">联系与反馈</h2>
          <a class="about-contact-row" href="https://github.com/ChatWw" target="_blank" rel="noreferrer" aria-label="Tuyn53 的 GitHub 主页（在浏览器中打开）">
            <AppIcon name="lucide:github" size="18" />
            <span><span class="contact-label">开发者</span><span class="contact-value">Tuyn53</span></span>
            <AppIcon class="contact-arrow" name="lucide:arrow-up-right" size="16" />
          </a>
          <button class="about-contact-row" type="button" aria-label="复制反馈邮箱 tuyn53@163.com" @click="copyFeedbackEmail">
            <AppIcon name="lucide:mail" size="18" />
            <span><span class="contact-label">反馈邮箱</span><span class="contact-value">{{ feedbackEmail }}</span></span>
            <AppIcon class="contact-arrow" name="lucide:copy" size="16" />
          </button>
          <a class="about-contact-row" :href="issueUrl" target="_blank" rel="noreferrer" aria-label="在 GitHub 反馈问题（在浏览器中打开）">
            <AppIcon name="lucide:message-square" size="18" />
            <span><span class="contact-label">问题与建议</span><span class="contact-value">前往 GitHub 反馈</span></span>
            <AppIcon class="contact-arrow" name="lucide:arrow-up-right" size="16" />
          </a>
        </aside>
      </div>

      <footer class="about-footer">
        <div class="about-support-copy"><h2>支持 Mira</h2><p>欢迎反馈，也可以赞助开发。</p></div>
        <el-popover placement="top" :width="300" trigger="click" title="使用支付宝或微信扫码支持">
          <template #reference>
            <el-button class="support-button"><AppIcon name="lucide:heart" size="16" />支持开发</el-button>
          </template>
          <div class="payment-code"><img :src="paymentCode" alt="支持 Mira 的支付宝与微信收款码"></div>
        </el-popover>
      </footer>
      <p class="about-credit">Made with care by Tuyn53</p>
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
// GitHub Issue 模板选择页，与 .github/ISSUE_TEMPLATE/（bug_report / feature_request / install_problem）对应
const issueUrl = 'https://github.com/ChatWw/Mira-Harness/issues/new/choose'

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
.about-settings :deep(.settings-main__content) { display: flex; width: 100%; min-height: 100%; padding-bottom: 24px; }
.about-page { container-type: inline-size; display: flex; flex-direction: column; width: 100%; padding-top: 16px; }
.about-identity { display: flex; align-items: center; gap: 24px; padding: 8px 0 40px; border-bottom: 1px solid var(--cp-border); }
.about-logo { width: 104px; height: 104px; border-radius: 24px; object-fit: cover; }
.about-name h1 { margin: 0; color: var(--cp-text); font-size: 36px; font-weight: 600; line-height: 1.2; letter-spacing: -0.03em; }
.about-name p { margin: 8px 0 0; color: var(--cp-text-secondary); font-size: var(--settings-text-base); }
.about-version { display: flex; flex-direction: column; gap: 5px; margin-left: auto; text-align: right; font-size: var(--settings-text-caption); color: var(--cp-text-secondary); }
.about-version span:last-child { color: var(--cp-text); font-variant-numeric: tabular-nums; }
.about-body { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 64px; padding: 40px 0 48px; }
.about-body h2, .about-footer h2 { margin: 0 0 20px; color: var(--cp-text); font-size: var(--settings-text-subheading); font-weight: 600; }
.about-description > p { margin: 0 0 20px; color: var(--cp-text-secondary); font-size: 15px; line-height: 2; }
.about-description > .about-summary { color: var(--cp-text); }
.about-local { margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--cp-border-light); }
.about-local h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; color: var(--cp-text); font-size: var(--settings-text-caption); font-weight: 500; }
.about-local p { margin: 0; color: var(--cp-text-secondary); font-size: var(--settings-text-caption); line-height: 1.8; }
.about-contact-row { box-sizing: border-box; display: flex; align-items: center; gap: 12px; width: 100%; min-height: 88px; padding: 16px 12px; border: 0; border-bottom: 1px solid var(--cp-border-light); border-radius: 0; background: transparent; color: var(--cp-text-secondary); font: inherit; text-align: left; text-decoration: none; cursor: pointer; transition: background-color 150ms ease-out; }
.about-contact-row:hover { background: var(--cp-bg-elevated); }
.about-contact-row:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 2px; }
.about-contact-row > .app-icon { flex-shrink: 0; }
a.about-contact-row:first-of-type > .app-icon:first-child { color: #608f7c; }
button.about-contact-row > .app-icon:first-child { color: #8876ad; }
a.about-contact-row:last-of-type > .app-icon:first-child { color: #b18858; }
.about-contact-row > span { min-width: 0; }
.contact-label, .contact-value { display: block; }
.contact-label { margin-bottom: 4px; font-size: var(--settings-text-small); }
.contact-value { color: var(--cp-text); font-size: var(--settings-text-caption); overflow-wrap: anywhere; }
.contact-arrow { margin-left: auto; }
.about-footer { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-top: auto; padding: 28px 0; border-top: 1px solid var(--cp-border); }
.about-footer h2 { margin-bottom: 6px; font-size: var(--settings-text-base); font-weight: 500; }
.about-footer p { margin: 0; color: var(--cp-text-secondary); font-size: var(--settings-text-caption); line-height: 1.7; }
.support-button { flex-shrink: 0; }
.support-button :deep(> span) { gap: 8px; }
.about-credit { margin: 0; color: var(--cp-text-secondary); font-size: var(--settings-text-small); }
.payment-code { display: flex; justify-content: center; }
.payment-code img { display: block; width: min(100%, 260px); border-radius: var(--cp-radius-md); }
@container (max-width: 760px) {
  .about-body { grid-template-columns: minmax(0, 1fr); gap: 32px; }
  .about-contact-row { min-height: 68px; }
}
@container (max-width: 420px) {
  .about-identity { flex-wrap: wrap; gap: 16px; }
  .about-logo { width: 64px; height: 64px; border-radius: 16px; }
  .about-version { width: 100%; flex-direction: row; gap: 8px; text-align: left; }
  .about-footer { align-items: flex-start; flex-direction: column; gap: 16px; }
}
</style>
