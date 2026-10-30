<template>
  <SettingsPageShell class="about-settings" title="关于Mira" :show-title="false">
    <section class="about-page" aria-labelledby="about-title">
      <section class="about-card">
        <header class="about-card-header">
          <h1 id="about-title">关于 Mira</h1>
          <a class="about-repository" :href="repositoryUrl" target="_blank" rel="noreferrer" aria-label="Mira 的 GitHub 仓库（在浏览器中打开）">
            <AppIcon name="lucide:github" size="20" />
          </a>
        </header>
        <div class="about-identity">
          <img class="about-logo" :src="miraLogo" alt="Mira 图标">
          <div class="about-name">
            <h2>Mira</h2>
            <p>你的 AI 创作伙伴</p>
            <span class="about-version" aria-label="当前版本">v{{ appVersion }}</span>
          </div>
          <a class="about-action about-update" :href="releasesUrl" target="_blank" rel="noreferrer" aria-label="检查更新：在浏览器中查看 Mira 最新发布">检查更新</a>
        </div>
        <div class="about-setting-row">
          <span>自动更新 <span class="about-unavailable">暂不可用</span></span>
          <el-switch :model-value="false" disabled aria-label="自动更新（暂不可用）" />
        </div>
      </section>

      <section class="about-card about-resources" aria-label="帮助与支持">
        <div class="about-resource-row">
          <AppIcon name="lucide:badge-help" size="18" /><span>帮助文档</span>
          <a class="about-action" :href="`${repositoryUrl}#readme`" target="_blank" rel="noreferrer" aria-label="查看 Mira 帮助文档（在浏览器中打开）">查看</a>
        </div>
        <div class="about-resource-row">
          <AppIcon name="lucide:rss" size="18" /><span>更新日志</span>
          <a class="about-action" :href="releasesUrl" target="_blank" rel="noreferrer" aria-label="查看 Mira 更新日志（在浏览器中打开）">查看</a>
        </div>
        <div class="about-resource-row">
          <AppIcon name="lucide:message-square" size="18" /><span>问题与建议</span>
          <a class="about-action" :href="issueUrl" target="_blank" rel="noreferrer" aria-label="在 GitHub 反馈问题（在浏览器中打开）">反馈</a>
        </div>
        <div class="about-resource-row">
          <AppIcon name="lucide:mail" size="18" /><span>邮件联系</span>
          <a class="about-action" href="mailto:tuyn53@163.com" target="_blank" rel="noreferrer" aria-label="使用默认邮件软件联系 Mira">邮件</a>
        </div>
        <div class="about-resource-row">
          <AppIcon name="lucide:heart" size="18" /><span>支持 Mira</span>
          <el-popover placement="top" :width="300" trigger="click" title="使用支付宝或微信扫码支持">
            <template #reference><el-button>支持开发</el-button></template>
            <div class="payment-code"><img :src="paymentCode" alt="支持 Mira 的支付宝与微信收款码"></div>
          </el-popover>
        </div>
      </section>
      <p class="about-credit">Made with care by Tuyn53</p>
    </section>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import miraLogo from '@/asset/mira-logo.png'
import paymentCode from '@/asset/paymentCode.jpg'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

const appVersion = __MIRA_VERSION__
const repositoryUrl = 'https://github.com/ChatWw/Mira-Harness'
const releasesUrl = `${repositoryUrl}/releases`
// GitHub Issue 模板选择页，与 .github/ISSUE_TEMPLATE/（bug_report / feature_request / install_problem）对应
const issueUrl = 'https://github.com/ChatWw/Mira-Harness/issues/new/choose'
</script>

<style scoped lang="scss">
.about-settings :deep(.settings-main__content) { width: min(864px, 100%); }
.about-settings :deep(.settings-main__scroll) { scrollbar-width: none; scrollbar-gutter: auto; }
.about-settings :deep(.settings-main__scroll::-webkit-scrollbar) { display: none; }
.about-page { display: flex; flex-direction: column; gap: 16px; font-size: var(--settings-text-base); }
.about-card { padding: 0 20px; border: 1px solid var(--cp-border); border-radius: 14px; }
.about-card-header { display: flex; align-items: center; justify-content: space-between; min-height: 56px; border-bottom: 1px solid var(--cp-border-light); }
.about-card-header h1 { margin: 0; font-size: var(--settings-text-section); font-weight: 550; }
.about-repository { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: var(--cp-radius-md); color: var(--cp-text-secondary); }
.about-repository:hover { background: var(--cp-bg-hover); color: var(--cp-text); }
.about-identity { display: flex; align-items: center; gap: 16px; padding: 20px 0 16px; }
.about-logo { flex-shrink: 0; width: 80px; height: 80px; border-radius: 18px; object-fit: cover; }
.about-name h2 { margin: 0; color: var(--cp-text); font-size: 24px; font-weight: 600; line-height: 1.25; letter-spacing: -0.02em; }
.about-name p { margin: 5px 0 8px; color: var(--cp-text-secondary); line-height: 1.5; }
.about-version { display: inline-block; padding: 2px 7px; border: 1px solid var(--cp-border); border-radius: 6px; background: var(--cp-bg-elevated); color: var(--cp-text-secondary); font-size: var(--settings-text-small); font-variant-numeric: tabular-nums; line-height: 1.3; }
.about-setting-row { display: flex; align-items: center; justify-content: space-between; min-height: 56px; border-top: 1px solid var(--cp-border-light); }
.about-unavailable { margin-left: 8px; color: var(--cp-text-secondary); font-size: var(--settings-text-small); }
.about-resource-row { display: flex; align-items: center; gap: 12px; min-height: 60px; border-bottom: 1px solid var(--cp-border-light); }
.about-resource-row:last-child { border-bottom: 0; }
.about-resource-row > .app-icon { flex-shrink: 0; color: var(--cp-text-secondary); }
.about-resource-row > .about-action, .about-resource-row > .el-button, .about-update { margin-left: auto; }
.about-action { box-sizing: border-box; display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; min-width: 56px; height: 32px; padding: 0 12px; border: 1px solid var(--cp-border); border-radius: var(--el-border-radius-base); color: var(--cp-text); font-size: var(--settings-text-base); line-height: 1; text-decoration: none; transition: color 150ms ease-out, border-color 150ms ease-out, background-color 150ms ease-out; }
.about-action:hover { border-color: var(--cp-primary-light); background: var(--cp-primary-lighter); color: var(--cp-primary); }
.about-action:focus-visible, .about-repository:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 2px; }
.about-credit { margin: 0; color: var(--cp-text-secondary); font-size: var(--settings-text-small); line-height: 1.6; text-align: center; }
.payment-code { display: flex; justify-content: center; }
.payment-code img { display: block; width: min(100%, 260px); border-radius: var(--cp-radius-md); }
</style>
