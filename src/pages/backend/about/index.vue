<template>
  <SettingsPageShell title="关于Mira" :show-title="false">
    <section class="about-page" aria-labelledby="about-product-name">
      <header class="about-identity">
        <img class="about-logo" :src="miraLogo" alt="Mira 图标">
        <div>
          <h1 id="about-product-name">Mira</h1>
          <p class="about-subtitle">你的 AI 工作伙伴</p>
        </div>
      </header>

      <div class="about-intro">
        <h2>从一个想法，到一份成果。</h2>
        <p>和 Mira（米拉）一起整理资料、研究问题、撰写内容，让日常工作在对话中展开。文件、任务与工具汇聚一处，让想法有条理地落地。</p>
      </div>

      <ul class="about-capabilities" aria-label="Mira 的能力">
        <li>
          <AppIcon name="lucide:messages-square" size="18" />
          <div><h3>用对话推进工作</h3><p>提出需求、补充想法，与 Mira 一起完成研究、写作和自动化任务。</p></div>
        </li>
        <li>
          <AppIcon name="lucide:folder-open" size="18" />
          <div><h3>围绕文件，专注成果</h3><p>浏览项目文件、预览内容、查看变更，让资料与工作过程相互衔接。</p></div>
        </li>
        <li>
          <AppIcon name="lucide:blocks" size="18" />
          <div><h3>按你的方式扩展</h3><p>连接模型与工具，搭配技能、插件和自定义智能体，适应不同的工作。</p></div>
        </li>
      </ul>

      <div class="about-local">
        <AppIcon name="lucide:hard-drive" size="16" />
        <p><strong>本地优先</strong> · 工作记录与配置主要保存在本机。使用在线模型或外部工具时，必要的请求内容会发送至你配置的服务。</p>
      </div>

      <dl class="about-details">
        <div>
          <dt>当前版本</dt>
          <dd class="about-version">v{{ appVersion }}</dd>
        </div>
        <div>
          <dt>交流与反馈</dt>
          <dd class="feedback-detail">
            <el-button link class="feedback-copy" aria-label="复制反馈邮箱 tuyn53@163.com" @click="copyFeedbackEmail">
              {{ feedbackEmail }}<AppIcon name="lucide:copy" size="14" />
            </el-button>
            <a class="about-link" :href="issueUrl" target="_blank" rel="noreferrer" aria-label="在 GitHub 反馈问题（在浏览器中打开）">反馈问题<AppIcon name="lucide:arrow-up-right" size="14" /></a>
          </dd>
        </div>
        <div>
          <dt>开发者首页</dt>
          <dd><a class="about-link" href="https://github.com/ChatWw" target="_blank" rel="noreferrer" aria-label="Tuyn53 的 GitHub 主页（在浏览器中打开）"><AppIcon name="lucide:github" size="16" />Tuyn53<AppIcon name="lucide:arrow-up-right" size="14" /></a></dd>
        </div>
      </dl>

      <section class="support-section" aria-labelledby="support-heading">
        <div>
          <h2 id="support-heading">喜欢和 Mira 一起工作？</h2>
          <p>欢迎分享使用感受，也可以用一份心意支持 Mira 持续改进。</p>
        </div>
        <el-popover placement="top" :width="300" trigger="click" title="使用支付宝或微信扫码支持">
          <template #reference>
            <el-button class="support-button"><AppIcon name="lucide:heart" size="16" />支持 Mira</el-button>
          </template>
          <div class="payment-code"><img :src="paymentCode" alt="支持 Mira 的支付宝与微信收款码"></div>
        </el-popover>
      </section>

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
.about-page { width: min(100%, 680px); margin: 16px auto 0; }
.about-identity { display: flex; align-items: center; gap: 18px; }
.about-logo { width: 64px; height: 64px; border-radius: 16px; box-shadow: $shadow-sm; object-fit: cover; }
.about-identity h1 { margin: 0; color: var(--cp-text); font-size: 30px; font-weight: 600; line-height: 1.2; letter-spacing: -0.03em; }
.about-subtitle { margin: 6px 0 0; color: var(--cp-text-secondary); font-size: var(--settings-text-base); }
.about-intro { margin-top: 32px; }
.about-intro h2 { margin: 0 0 10px; color: var(--cp-text); font-size: var(--settings-text-title); font-weight: 600; letter-spacing: -0.02em; }
.about-intro p { max-width: 44em; margin: 0; color: var(--cp-text-secondary); font-size: var(--settings-text-base); line-height: 1.8; }
.about-capabilities { display: flex; flex-direction: column; gap: 20px; margin: 28px 0; padding: 0; list-style: none; }
.about-capabilities li { display: flex; align-items: flex-start; gap: 14px; }
.about-capabilities .app-icon { flex-shrink: 0; margin-top: 3px; color: var(--cp-text-secondary); }
.about-capabilities h3 { margin: 0 0 4px; color: var(--cp-text); font-size: var(--settings-text-base); font-weight: 500; }
.about-capabilities p { margin: 0; color: var(--cp-text-secondary); font-size: var(--settings-text-caption); line-height: 1.7; }
.about-local { display: flex; align-items: flex-start; gap: 10px; padding: 14px 16px; border-radius: var(--cp-radius-md); background: var(--cp-bg-elevated); color: var(--cp-text-secondary); }
.about-local .app-icon { flex-shrink: 0; margin-top: 3px; }
.about-local p { margin: 0; font-size: var(--settings-text-small); line-height: 1.8; }
.about-local strong { color: var(--cp-text); font-weight: 500; }
.about-details { margin: 28px 0 0; border-top: 1px solid var(--cp-border); }
.about-details > div { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 52px; border-bottom: 1px solid var(--cp-border-light); }
.about-details dt { color: var(--cp-text-secondary); font-size: var(--settings-text-caption); }
.about-details dd { display: flex; align-items: center; margin: 0; color: var(--cp-text); font-size: var(--settings-text-caption); }
.about-version { font-variant-numeric: tabular-nums; }
.feedback-detail { flex-wrap: wrap; justify-content: flex-end; gap: 8px 24px; padding: 10px 0; }
.feedback-copy { height: auto; padding: 0; color: var(--cp-text-secondary); font: inherit; }
.feedback-copy :deep(> span) { gap: 6px; }
.about-link { display: inline-flex; align-items: center; gap: 6px; color: var(--cp-text); text-decoration: none; text-underline-offset: 4px; }
.about-link:hover { text-decoration: underline; }
.about-link:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 4px; border-radius: 2px; }
.support-section { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-top: 28px; }
.support-section h2 { margin: 0 0 6px; color: var(--cp-text); font-size: var(--settings-text-base); font-weight: 500; }
.support-section p { margin: 0; color: var(--cp-text-secondary); font-size: var(--settings-text-small); line-height: 1.7; }
.support-button { flex-shrink: 0; }
.support-button :deep(> span) { gap: 6px; }
.about-credit { margin: 32px 0 0; color: var(--cp-text-secondary); font-size: var(--settings-text-small); }
.payment-code { display: flex; justify-content: center; }
.payment-code img { display: block; width: min(100%, 260px); border-radius: var(--cp-radius-md); }
</style>
