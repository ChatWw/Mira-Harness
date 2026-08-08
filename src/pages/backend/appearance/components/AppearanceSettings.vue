<template>
  <div class="appearance-settings">
    <section class="settings-section" aria-labelledby="theme-heading">
      <div class="section-heading">
        <h2 id="theme-heading">主题</h2>
        <p>选择工作台的明暗模式和强调色。</p>
      </div>

      <div class="choice-grid choice-grid--theme" role="radiogroup" aria-label="主题模式">
        <button
          v-for="mode in themeModeOptions"
          :key="mode.value"
          type="button"
          class="choice-card theme-card"
          :class="[{ 'is-selected': themeStore.themePreference === mode.value }, `is-${mode.value}`]"
          role="radio"
          :aria-checked="themeStore.themePreference === mode.value"
          @click="handleThemeModeChange(mode.value)"
        >
          <span class="theme-preview" aria-hidden="true">
            <span class="theme-preview__bar"></span>
            <span class="theme-preview__content">
              <i></i><i></i><i></i>
            </span>
          </span>
          <span class="choice-card__label">{{ mode.label }}</span>
        </button>
      </div>

      <div class="settings-list">
        <div class="settings-row settings-row--stack">
          <div class="settings-row__copy">
            <span class="settings-row__label">主题颜色</span>
            <span class="settings-row__hint">用于按钮、选中状态和交互强调。</span>
          </div>
          <div class="color-presets" role="radiogroup" aria-label="主题颜色">
            <button
              v-for="color in themeStore.presetColors"
              :key="color.id"
              type="button"
              class="color-preset"
              :class="{ 'is-selected': themeStore.primaryPresetId === color.id }"
              role="radio"
              :aria-checked="themeStore.primaryPresetId === color.id"
              :aria-label="`选择${color.name}主题色`"
              @click="themeStore.setPrimaryPreset(color.id)"
            >
              <span class="color-preset__dot" :style="{ backgroundColor: color[themeStore.themeMode] }"></span>
              <span>{{ color.name }}</span>
            </button>
          </div>
        </div>
        <div class="settings-row">
          <span class="settings-row__label">圆角风格</span>
          <el-select :model-value="layoutStore.config.cornerRadius" size="small" @change="layoutStore.setCornerRadius">
            <el-option label="直角" value="sharp" />
            <el-option label="中等" value="medium" />
            <el-option label="圆润" value="rounded" />
          </el-select>
        </div>
        <div class="settings-row">
          <span class="settings-row__label">组件大小</span>
          <el-select :model-value="layoutStore.config.componentSize" size="small" @change="layoutStore.setComponentSize">
            <el-option label="大" value="large" />
            <el-option label="默认" value="default" />
            <el-option label="小" value="small" />
          </el-select>
        </div>
      </div>
    </section>

    <section class="settings-section" aria-labelledby="layout-heading">
      <div class="section-heading">
        <h2 id="layout-heading">布局</h2>
        <p>调整工作台的导航结构和侧边栏呈现方式。</p>
      </div>

      <div class="visual-setting">
        <span class="visual-setting__label">布局模式</span>
        <div class="choice-grid choice-grid--layout" role="radiogroup" aria-label="布局模式">
          <button
            v-for="mode in layoutModes"
            :key="mode.value"
            type="button"
            class="choice-card layout-card"
            :class="{ 'is-selected': layoutStore.config.mode === mode.value }"
            role="radio"
            :aria-checked="layoutStore.config.mode === mode.value"
            @click="layoutStore.setLayoutMode(mode.value)"
          >
            <span class="layout-preview" aria-hidden="true">
              <i v-if="mode.showRail" class="layout-preview__rail"></i>
              <i v-if="mode.showSidebar" class="layout-preview__sidebar"></i>
              <span class="layout-preview__main"><i v-if="mode.showHeader"></i><b></b></span>
            </span>
            <span class="choice-card__label">{{ mode.label }}</span>
          </button>
        </div>
      </div>

      <div class="visual-setting">
        <span class="visual-setting__label">侧边栏样式</span>
        <div class="choice-grid choice-grid--sidebar" role="radiogroup" aria-label="侧边栏样式">
          <button
            v-for="style in sidebarStyles"
            :key="style.value"
            type="button"
            class="choice-card sidebar-card"
            :class="[{ 'is-selected': layoutStore.config.sidebarStyle === style.value }, `is-${style.value}`]"
            role="radio"
            :aria-checked="layoutStore.config.sidebarStyle === style.value"
            @click="layoutStore.setSidebarStyle(style.value)"
          >
            <span class="sidebar-preview" aria-hidden="true"><i></i><b></b></span>
            <span class="choice-card__label">{{ style.label }}</span>
          </button>
        </div>
      </div>

      <div class="settings-list">
        <div class="settings-row">
          <span class="settings-row__label">侧边栏宽度</span>
          <el-input-number :model-value="layoutStore.config.sidebarWidth" :min="200" :max="280" :step="10" size="small" @change="layoutStore.setSidebarWidth" />
        </div>
        <div class="settings-row">
          <span class="settings-row__label">折叠宽度</span>
          <el-input-number :model-value="layoutStore.config.collapsedWidth" :min="48" :max="80" :step="4" size="small" @change="layoutStore.setCollapsedWidth" />
        </div>
        <div class="settings-row">
          <span class="settings-row__label">唯一展开</span>
          <el-switch :model-value="layoutStore.config.uniqueOpened" @change="layoutStore.setUniqueOpened" />
        </div>
        <div class="settings-row">
          <span class="settings-row__label">显示 Logo</span>
          <el-switch :model-value="layoutStore.config.showLogo" @change="layoutStore.setShowLogo" />
        </div>
      </div>
    </section>

    <section class="settings-section" aria-labelledby="header-heading">
      <div class="section-heading"><h2 id="header-heading">顶栏</h2><p>控制页面导航和工具栏信息。</p></div>
      <div class="settings-list">
        <div class="settings-row">
          <span class="settings-row__label">顶栏高度</span>
          <el-input-number :model-value="isMacOverlay ? 34 : layoutStore.config.headerHeight" :min="48" :max="80" :step="4" :disabled="isMacOverlay" size="small" @change="layoutStore.setHeaderHeight" />
        </div>
        <div class="settings-row"><span class="settings-row__label">显示面包屑</span><el-switch :model-value="layoutStore.config.showBreadcrumb" @change="layoutStore.setShowBreadcrumb" /></div>
        <div class="settings-row"><span class="settings-row__label">面包屑图标</span><el-switch :model-value="layoutStore.config.breadcrumbIcon" @change="layoutStore.setBreadcrumbIcon" /></div>
        <div class="settings-row">
          <span class="settings-row__label">面包屑样式</span>
          <el-select :model-value="layoutStore.config.breadcrumbStyle" size="small" @change="layoutStore.setBreadcrumbStyle"><el-option label="普通" value="normal" /><el-option label="卡片" value="card" /></el-select>
        </div>
      </div>
    </section>

    <section class="settings-section" aria-labelledby="tabs-heading">
      <div class="section-heading"><h2 id="tabs-heading">多标签页</h2><p>保留并管理当前工作上下文。</p></div>
      <div class="settings-list">
        <div class="settings-row"><span class="settings-row__label">启用多标签页</span><el-switch :model-value="layoutStore.config.enableTabs" @change="layoutStore.setEnableTabs" /></div>
        <div class="settings-row">
          <span class="settings-row__label">标签页样式</span>
          <el-select :model-value="layoutStore.config.tabStyle" size="small" @change="layoutStore.setTabStyle"><el-option label="默认" value="default" /><el-option label="个性" value="personalized" /><el-option label="方块" value="square" /><el-option label="卡片" value="card" /></el-select>
        </div>
        <div class="settings-row"><span class="settings-row__label">显示图标</span><el-switch :model-value="layoutStore.config.showTabIcon" @change="layoutStore.setShowTabIcon" /></div>
        <div class="settings-row"><span class="settings-row__label">持久化</span><el-switch :model-value="layoutStore.config.tabPersist" @change="layoutStore.setTabPersist" /></div>
      </div>
    </section>

    <section class="settings-section" aria-labelledby="animation-heading">
      <div class="section-heading"><h2 id="animation-heading">动画</h2><p>选择页面切换效果和交互节奏。</p></div>
      <div class="visual-setting">
        <span class="visual-setting__label">页面切换动画</span>
        <div class="choice-grid choice-grid--transition" role="radiogroup" aria-label="页面切换动画">
          <button
            v-for="transition in pageTransitions"
            :key="transition.value"
            type="button"
            class="choice-card transition-card"
            :class="{ 'is-selected': layoutStore.config.pageTransition === transition.value }"
            role="radio"
            :aria-checked="layoutStore.config.pageTransition === transition.value"
            @click="layoutStore.setPageTransition(transition.value)"
          >
            <span class="transition-preview" :class="`is-${transition.value}`" aria-hidden="true"><i></i></span>
            <span class="choice-card__label">{{ transition.label }}</span>
          </button>
        </div>
      </div>
      <div class="settings-list">
        <div class="settings-row">
          <span class="settings-row__label">动画速度</span>
          <el-select :model-value="layoutStore.config.animationSpeed" size="small" @change="layoutStore.setAnimationSpeed"><el-option label="快速" value="fast" /><el-option label="正常" value="normal" /><el-option label="缓慢" value="slow" /></el-select>
        </div>
        <div class="settings-row"><span class="settings-row__label">主题切换动画</span><el-switch :model-value="layoutStore.config.themeTransitionAnimation" @change="layoutStore.setThemeTransitionAnimation" /></div>
      </div>
    </section>

    <section class="settings-section" aria-labelledby="footer-heading">
      <div class="section-heading"><h2 id="footer-heading">底栏</h2><p>配置工作台底部的版权信息。</p></div>
      <div class="settings-list">
        <div class="settings-row"><span class="settings-row__label">显示底栏</span><el-switch :model-value="layoutStore.config.showFooter" @change="layoutStore.setShowFooter" /></div>
        <div class="settings-row">
          <span class="settings-row__label">底栏样式</span>
          <el-select :model-value="layoutStore.config.footerStyle" size="small" @change="layoutStore.setFooterStyle"><el-option label="简约" value="simple" /><el-option label="分栏" value="split" /><el-option label="多列" value="multi" /></el-select>
        </div>
        <div class="settings-row"><span class="settings-row__label">底栏高度</span><el-input-number :model-value="layoutStore.config.footerHeight" :min="32" :max="64" :step="4" size="small" @change="layoutStore.setFooterHeight" /></div>
        <div class="settings-row"><span class="settings-row__label">版权文本</span><el-input :model-value="layoutStore.config.footerCopyright" class="settings-control--wide" placeholder="请输入版权文本" size="small" @input="layoutStore.setFooterCopyright" /></div>
        <div class="settings-row">
          <span class="settings-row__label">版权年份</span>
          <el-select :model-value="layoutStore.config.footerYearMode" size="small" @change="layoutStore.setFooterYearMode"><el-option label="自动" value="auto" /><el-option label="自定义" value="custom" /></el-select>
        </div>
        <template v-if="layoutStore.config.footerYearMode === 'custom'">
          <div class="settings-row"><span class="settings-row__label">起始年份</span><el-input-number :model-value="layoutStore.config.footerYearStart" :min="2000" :max="2100" size="small" @change="layoutStore.setFooterYearStart" /></div>
          <div class="settings-row"><span class="settings-row__label">结束年份</span><el-input-number :model-value="layoutStore.config.footerYearEnd" :min="2000" :max="2100" size="small" @change="layoutStore.setFooterYearEnd" /></div>
        </template>
        <div class="settings-row"><span class="settings-row__label">备案号</span><el-input :model-value="layoutStore.config.footerIcp" class="settings-control--wide" placeholder="请输入备案号" size="small" @input="layoutStore.setFooterIcp" /></div>
        <div class="settings-row"><span class="settings-row__label">备案号链接</span><el-input :model-value="layoutStore.config.footerIcpLink" class="settings-control--wide" placeholder="请输入备案号链接" size="small" @input="layoutStore.setFooterIcpLink" /></div>
      </div>
    </section>

    <section class="settings-section" aria-labelledby="other-heading">
      <div class="section-heading"><h2 id="other-heading">其他</h2><p>管理内容区域和水印偏好。</p></div>
      <div class="settings-list">
        <div class="settings-row"><span class="settings-row__label">动态标题</span><el-switch :model-value="layoutStore.config.dynamicTitle" @change="handleDynamicTitleChange" /></div>
        <div class="settings-row"><span class="settings-row__label">启用内容布局设置</span><el-switch :model-value="layoutStore.config.enableContentLayoutSettings" @change="layoutStore.setEnableContentLayoutSettings" /></div>
        <div class="settings-row" :class="{ 'is-disabled': !layoutStore.config.enableContentLayoutSettings }">
          <span class="settings-row__label">内容最大宽度</span>
          <el-select :model-value="layoutStore.config.contentMaxWidth" :disabled="!layoutStore.config.enableContentLayoutSettings" size="small" @change="layoutStore.setContentMaxWidth"><el-option label="全屏" value="full" /><el-option label="1200px" value="1200" /><el-option label="1400px" value="1400" /><el-option label="1600px" value="1600" /></el-select>
        </div>
        <div class="settings-row" :class="{ 'is-disabled': !layoutStore.config.enableContentLayoutSettings }">
          <span class="settings-row__label">内容内边距</span>
          <el-select :model-value="layoutStore.config.contentPadding" :disabled="!layoutStore.config.enableContentLayoutSettings" size="small" @change="layoutStore.setContentPadding"><el-option label="紧凑" value="compact" /><el-option label="正常" value="normal" /><el-option label="宽松" value="comfortable" /></el-select>
        </div>
        <div class="settings-row"><span class="settings-row__label">启用水印</span><el-switch :model-value="layoutStore.config.watermark" @change="layoutStore.setWatermark" /></div>
        <div v-if="layoutStore.config.watermark" class="settings-row"><span class="settings-row__label">水印文字</span><el-input :model-value="layoutStore.config.watermarkText" class="settings-control--wide" placeholder="请输入水印文字" size="small" @input="layoutStore.setWatermarkText" /></div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useLayoutStore } from '@/stores/layout'
import { useThemeStore } from '@/stores/theme'
import router, { updateDocumentTitle } from '@/router'
import type { LayoutMode, PageTransition, SidebarStyle, ThemePreference } from '@/types'

const layoutStore = useLayoutStore()
const themeStore = useThemeStore()
const isMacOverlay = Boolean(window.platform) && navigator.userAgent.includes('Macintosh')

const themeModeOptions: Array<{ label: string; value: ThemePreference }> = [
  { label: '系统', value: 'system' },
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
]

const layoutModes = [
  { value: 'sidebar-header' as LayoutMode, label: '侧边栏 + 顶栏', showSidebar: true, showHeader: true, showRail: false },
  { value: 'sidebar-only' as LayoutMode, label: '仅侧边栏', showSidebar: true, showHeader: false, showRail: true },
]

const sidebarStyles = [
  { value: 'embedded' as SidebarStyle, label: '内嵌' },
  { value: 'floating' as SidebarStyle, label: '浮动' },
  { value: 'docked' as SidebarStyle, label: '侧边栏' },
]

const pageTransitions = [
  { value: 'fade' as PageTransition, label: '淡入淡出' },
  { value: 'fade-slide' as PageTransition, label: '滑动淡入' },
  { value: 'slide-up' as PageTransition, label: '上滑进入' },
  { value: 'slide-right' as PageTransition, label: '右侧滑入' },
  { value: 'zoom' as PageTransition, label: '缩放' },
  { value: 'none' as PageTransition, label: '无动画' },
]

function handleThemeModeChange(mode: ThemePreference) {
  themeStore.setThemeModeWithTransition(mode, undefined, layoutStore.config.themeTransitionAnimation)
}

function handleDynamicTitleChange(value: boolean) {
  layoutStore.setDynamicTitle(value)
  updateDocumentTitle(router.currentRoute.value.meta.title)
}
</script>

<style scoped lang="scss">
.appearance-settings { display: flex; flex-direction: column; gap: 48px; padding-bottom: 24px; }

.settings-section { min-width: 0; }

.section-heading { margin-bottom: 18px; }
.section-heading h2 { margin: 0; color: var(--cp-text); font-size: 18px; font-weight: $font-semibold; letter-spacing: -0.01em; }
.section-heading p { margin: 6px 0 0; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.6; }

.choice-grid { display: grid; justify-content: start; gap: 12px; }
.choice-grid--theme { grid-template-columns: repeat(3, minmax(0, 176px)); }
.choice-grid--layout { grid-template-columns: repeat(2, minmax(0, 176px)); }
.choice-grid--sidebar { grid-template-columns: repeat(3, minmax(0, 144px)); }
.choice-grid--transition { grid-template-columns: repeat(6, minmax(0, 128px)); }

.choice-card {
  display: flex;
  flex-direction: column;
  gap: 9px;
  width: 100%;
  padding: 10px;
  border: 1px solid var(--cp-border-light);
  border-radius: 10px;
  color: var(--cp-text);
  background: var(--cp-bg);
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: border-color $transition-fast, background-color $transition-fast, box-shadow $transition-fast;

  &:hover { border-color: color-mix(in srgb, var(--cp-primary) 36%, var(--cp-border)); background: color-mix(in srgb, var(--cp-primary) 3%, var(--cp-bg)); }
  &:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 2px; }
  &.is-selected { border-color: color-mix(in srgb, var(--cp-primary) 60%, var(--cp-border)); background: color-mix(in srgb, var(--cp-primary) 7%, var(--cp-bg)); box-shadow: 0 6px 16px rgb(24 24 27 / 7%); }
}
.choice-card__label { font-size: $font-sm; font-weight: $font-medium; text-align: center; }

.theme-preview { display: flex; height: 92px; overflow: hidden; border: 1px solid rgb(0 0 0 / 7%); border-radius: 6px; background: #f7f7f7; }
.theme-preview__bar { display: block; width: 26px; background: #efefef; }
.theme-preview__content { display: flex; flex: 1; flex-direction: column; gap: 7px; justify-content: center; padding: 16px; }
.theme-preview__content i { display: block; height: 8px; border-radius: 999px; background: #d9d9d9; }
.theme-preview__content i:nth-child(2) { width: 76%; }
.theme-preview__content i:nth-child(3) { width: 54%; }
.theme-card.is-dark .theme-preview { border-color: rgb(255 255 255 / 10%); background: #292929; }
.theme-card.is-dark .theme-preview__bar { background: #202020; }
.theme-card.is-dark .theme-preview__content i { background: #575757; }
.theme-card.is-system .theme-preview { background: linear-gradient(90deg, #f7f7f7 0 50%, #292929 50%); }
.theme-card.is-system .theme-preview__bar { background: linear-gradient(90deg, #efefef 0 50%, #202020 50%); }
.theme-card.is-system .theme-preview__content i { background: linear-gradient(90deg, #d9d9d9 0 50%, #575757 50%); }

.settings-list { overflow: hidden; margin-top: 20px; border-top: 1px solid var(--cp-border-light); }
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 54px;
  padding: 10px 0;
  border-bottom: 1px solid var(--cp-border-light);

  :deep(.el-select) { width: 144px; }
  :deep(.el-input-number) { width: 144px; }
  &.is-disabled { color: var(--cp-text-tertiary); }
}
.settings-row--stack { align-items: flex-start; flex-direction: column; gap: 12px; padding: 14px 0; }
.settings-row__copy { display: flex; flex-direction: column; gap: 4px; }
.settings-row__label { color: var(--cp-text); font-size: $font-sm; }
.settings-row__hint { color: var(--cp-text-secondary); font-size: $font-xs; line-height: 1.5; }
.settings-control--wide { width: min(320px, 52%); }

.color-presets { display: flex; flex-wrap: wrap; gap: 8px; }
.color-preset {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 72px;
  height: 32px;
  padding: 0 9px;
  border: 1px solid var(--cp-border-light);
  border-radius: 7px;
  color: var(--cp-text-secondary);
  background: var(--cp-bg);
  cursor: pointer;
  font: inherit;
  font-size: $font-xs;
  transition: border-color $transition-fast, background-color $transition-fast, color $transition-fast;

  &:hover { color: var(--cp-text); border-color: color-mix(in srgb, var(--cp-primary) 38%, var(--cp-border)); }
  &:focus-visible { outline: 2px solid var(--cp-primary); outline-offset: 2px; }
  &.is-selected { border-color: color-mix(in srgb, var(--cp-primary) 60%, var(--cp-border)); color: var(--cp-text); background: color-mix(in srgb, var(--cp-primary) 7%, var(--cp-bg)); }
}
.color-preset__dot { width: 12px; height: 12px; border: 1px solid rgb(0 0 0 / 10%); border-radius: 50%; }

.visual-setting { margin-top: 24px; }
.visual-setting__label { display: block; margin-bottom: 10px; color: var(--cp-text); font-size: $font-sm; }
.layout-preview, .sidebar-preview, .transition-preview { display: flex; height: 72px; overflow: hidden; border: 1px solid var(--cp-border-light); border-radius: 6px; background: var(--cp-bg-elevated); }
.layout-preview__rail { display: block; width: 12px; background: color-mix(in srgb, var(--cp-primary) 12%, var(--cp-bg-elevated)); }
.layout-preview__sidebar { display: block; width: 34px; background: var(--cp-bg-hover); border-right: 1px solid var(--cp-border-light); }
.layout-preview__main { display: flex; flex: 1; flex-direction: column; gap: 9px; padding: 10px; }
.layout-preview__main i { display: block; height: 10px; background: var(--cp-bg-hover); border-bottom: 1px solid var(--cp-border-light); }
.layout-preview__main b { display: block; flex: 1; border-radius: 3px; background: var(--cp-bg); }

.sidebar-preview { position: relative; padding: 10px; }
.sidebar-preview i { display: block; width: 34px; border-radius: 3px; background: var(--cp-bg-hover); }
.sidebar-preview b { display: block; flex: 1; margin-left: 9px; border-radius: 3px; background: var(--cp-bg); }
.sidebar-card.is-floating .sidebar-preview i { z-index: 1; margin: 5px -7px 5px 3px; box-shadow: 0 5px 10px rgb(24 24 27 / 12%); }
.sidebar-card.is-docked .sidebar-preview { background: var(--cp-sidebar-bg); }
.sidebar-card.is-docked .sidebar-preview i { background: color-mix(in srgb, var(--cp-primary) 12%, var(--cp-sidebar-bg)); }

.transition-preview { position: relative; align-items: center; justify-content: center; }
.transition-preview i { display: block; width: 54px; height: 38px; border-radius: 4px; background: color-mix(in srgb, var(--cp-primary) 15%, var(--cp-bg)); border: 1px solid color-mix(in srgb, var(--cp-primary) 26%, var(--cp-border)); }
.transition-preview.is-fade i { animation: transition-preview-fade 2.4s ease-in-out infinite; }
.transition-preview.is-fade-slide i { animation: transition-preview-fade-slide 2.4s ease-in-out infinite; }
.transition-preview.is-slide-up i { animation: transition-preview-slide-up 2.4s ease-in-out infinite; }
.transition-preview.is-slide-right i { animation: transition-preview-slide-right 2.4s ease-in-out infinite; }
.transition-preview.is-zoom i { animation: transition-preview-zoom 2.4s ease-in-out infinite; }
.transition-preview.is-none i { background: var(--cp-bg); border-color: var(--cp-border-light); }

@keyframes transition-preview-fade {
  0%, 100% { opacity: .28; }
  50% { opacity: 1; }
}

@keyframes transition-preview-fade-slide {
  0%, 100% { opacity: .28; transform: translateX(-18px); }
  50% { opacity: 1; transform: translateX(0); }
}

@keyframes transition-preview-slide-up {
  0%, 100% { opacity: .28; transform: translateY(18px); }
  50% { opacity: 1; transform: translateY(0); }
}

@keyframes transition-preview-slide-right {
  0%, 100% { opacity: .28; transform: translateX(22px); }
  50% { opacity: 1; transform: translateX(0); }
}

@keyframes transition-preview-zoom {
  0%, 100% { opacity: .28; transform: scale(.68); }
  50% { opacity: 1; transform: scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .transition-preview i { animation: none !important; transform: none !important; }
}

@media (max-width: 1024px) {
  .choice-grid--transition { grid-template-columns: repeat(4, minmax(0, 128px)); }
}

@media (max-width: 768px) {
  .appearance-settings { gap: 38px; }
  .choice-grid--theme { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .choice-grid--layout, .choice-grid--sidebar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .choice-grid--transition { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .choice-card { min-width: 0; }
  .settings-row { gap: 16px; }
}

@media (max-width: 520px) {
  .choice-grid--theme, .choice-grid--layout, .choice-grid--sidebar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .choice-grid--transition { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .settings-row { align-items: flex-start; flex-direction: column; gap: 10px; padding: 13px 0; }
  .settings-row--stack { gap: 12px; }
  .settings-control--wide { width: 100%; }
}
</style>
