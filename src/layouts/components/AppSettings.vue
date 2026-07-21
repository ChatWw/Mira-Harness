<template>
  <el-drawer
    v-model="layoutStore.settingsVisible"
    direction="rtl"
    size="480px"
    class="settings-drawer"
    :destroy-on-close="false"
  >
    <template #header>
      <div class="drawer-header">
        <div class="drawer-title-group">
          <div class="drawer-title-icon"><el-icon><Setting /></el-icon></div>
          <div>
            <h2>全局配置</h2>
            <p>个性化你的工作空间</p>
          </div>
        </div>
      </div>
    </template>
    <div class="settings-content">
      <div class="settings-intro">
        <div>
          <span class="intro-eyebrow">WORKSPACE</span>
          <strong>即时预览，自动保存</strong>
          <p>所有更改会立即应用到当前工作台。</p>
        </div>
        <el-icon><MagicStick /></el-icon>
      </div>
      <el-collapse v-model="activeNames" class="settings-collapse">
        <!-- 1. 整体风格 -->
        <el-collapse-item name="general">
          <template #title><div class="section-title"><el-icon><Brush /></el-icon><span>整体风格</span><small>主题与视觉密度</small></div></template>
          <div class="settings-section">
            <!-- 主题模式 -->
            <div class="settings-item">
              <span class="item-label">主题模式</span>
              <el-segmented
                :model-value="themeStore.themeMode"
                :options="themeModeOptions"
                @change="themeStore.setThemeMode"
              />
            </div>

            <!-- 主题颜色 -->
            <div class="settings-item-block">
              <div class="item-label">主题颜色</div>
              <div class="color-grid">
                <button
                  v-for="color in themeStore.presetColors"
                  :key="color.value"
                  type="button"
                  class="color-item"
                  :class="{ active: themeStore.primaryColor === color.value }"
                  :aria-label="`选择${color.name}主题色`"
                  :aria-pressed="themeStore.primaryColor === color.value"
                  @click="themeStore.setPrimaryColor(color.value)"
                >
                  <span class="color-dot" :style="{ backgroundColor: color.value }"></span>
                </button>
              </div>
            </div>

            <!-- 圆角风格 -->
            <div class="settings-item">
              <span class="item-label">圆角风格</span>
              <el-select
                :model-value="layoutStore.config.cornerRadius"
                @change="layoutStore.setCornerRadius"
                size="small"
                style="width: 120px"
              >
                <el-option label="直角" value="sharp" />
                <el-option label="中等" value="medium" />
                <el-option label="圆润" value="rounded" />
              </el-select>
            </div>

            <!-- 组件大小 -->
            <div class="settings-item">
              <span class="item-label">组件大小</span>
              <el-select
                :model-value="layoutStore.config.componentSize"
                @change="layoutStore.setComponentSize"
                size="small"
                style="width: 120px"
              >
                <el-option label="大" value="large" />
                <el-option label="默认" value="default" />
                <el-option label="小" value="small" />
              </el-select>
            </div>
          </div>
        </el-collapse-item>

        <!-- 2. 布局设置 -->
        <el-collapse-item name="layout">
          <template #title><div class="section-title"><el-icon><Grid /></el-icon><span>布局设置</span><small>导航与内容结构</small></div></template>
          <div class="settings-section">
            <!-- 布局模式 -->
            <div class="settings-item-block">
              <div class="item-label">布局模式</div>
              <div class="layout-modes">
                <div
                  v-for="mode in layoutModes"
                  :key="mode.value"
                  class="layout-mode-card"
                  :class="{ active: layoutStore.config.mode === mode.value }"
                  @click="layoutStore.setLayoutMode(mode.value)"
                >
                  <div class="mode-preview">
                    <div class="preview-container">
                      <div v-if="mode.showRail" class="preview-rail"></div>
                      <div v-if="mode.showSidebar" class="preview-sidebar"></div>
                      <div class="preview-main">
                        <div v-if="mode.showHeader" class="preview-header"></div>
                        <div class="preview-content"></div>
                      </div>
                    </div>
                  </div>
                  <div class="mode-name">{{ mode.label }}</div>
                </div>
              </div>
            </div>

            <!-- 侧边栏宽度 -->
            <div class="settings-item">
              <span class="item-label">侧边栏宽度</span>
              <el-input-number
                :model-value="layoutStore.config.sidebarWidth"
                @change="layoutStore.setSidebarWidth"
                :min="200"
                :max="280"
                :step="10"
                size="small"
                style="width: 120px"
              />
            </div>

            <!-- 折叠宽度 -->
            <div class="settings-item">
              <span class="item-label">折叠宽度</span>
              <el-input-number
                :model-value="layoutStore.config.collapsedWidth"
                @change="layoutStore.setCollapsedWidth"
                :min="48"
                :max="80"
                :step="4"
                size="small"
                style="width: 120px"
              />
            </div>

            <!-- 唯一展开 -->
            <div class="settings-item">
              <span class="item-label">唯一展开</span>
              <el-switch
                :model-value="layoutStore.config.uniqueOpened"
                @change="layoutStore.setUniqueOpened"
              />
            </div>

            <!-- 显示 Logo -->
            <div class="settings-item">
              <span class="item-label">显示 Logo</span>
              <el-switch
                :model-value="layoutStore.config.showLogo"
                @change="layoutStore.setShowLogo"
              />
            </div>

            <!-- 显示底栏 -->
            <div class="settings-item">
              <span class="item-label">显示底栏</span>
              <el-switch
                :model-value="layoutStore.config.showFooter"
                @change="layoutStore.setShowFooter"
              />
            </div>
          </div>
        </el-collapse-item>

        <!-- 3. 顶栏设置 -->
        <el-collapse-item name="header">
          <template #title><div class="section-title"><el-icon><Monitor /></el-icon><span>顶栏设置</span><small>导航与工具栏</small></div></template>
          <div class="settings-section">
            <!-- 顶栏高度 -->
            <div class="settings-item">
              <span class="item-label">顶栏高度</span>
              <el-input-number
                :model-value="layoutStore.config.headerHeight"
                @change="layoutStore.setHeaderHeight"
                :min="48"
                :max="80"
                :step="4"
                size="small"
                style="width: 120px"
              />
            </div>

            <!-- 显示面包屑 -->
            <div class="settings-item">
              <span class="item-label">显示面包屑</span>
              <el-switch
                :model-value="layoutStore.config.showBreadcrumb"
                @change="layoutStore.setShowBreadcrumb"
              />
            </div>

            <!-- 面包屑图标 -->
            <div class="settings-item">
              <span class="item-label">面包屑图标</span>
              <el-switch
                :model-value="layoutStore.config.breadcrumbIcon"
                @change="layoutStore.setBreadcrumbIcon"
              />
            </div>

            <!-- 面包屑样式 -->
            <div class="settings-item">
              <span class="item-label">面包屑样式</span>
              <el-select
                :model-value="layoutStore.config.breadcrumbStyle || 'normal'"
                @change="layoutStore.setBreadcrumbStyle"
                size="small"
                style="width: 120px"
              >
                <el-option label="普通" value="normal" />
                <el-option label="卡片" value="card" />
              </el-select>
            </div>
          </div>
        </el-collapse-item>

        <!-- 4. 多标签页 -->
        <el-collapse-item name="tabs">
          <template #title><div class="section-title"><el-icon><CollectionTag /></el-icon><span>多标签页</span><small>工作上下文管理</small></div></template>
          <div class="settings-section">
            <!-- 启用多标签页 -->
            <div class="settings-item">
              <span class="item-label">启用多标签页</span>
              <el-switch
                :model-value="layoutStore.config.enableTabs"
                @change="layoutStore.setEnableTabs"
              />
            </div>

            <!-- 标签页样式 -->
            <div class="settings-item">
              <span class="item-label">标签页样式</span>
              <el-select
                :model-value="layoutStore.config.tabStyle"
                @change="layoutStore.setTabStyle"
                size="small"
                style="width: 120px"
              >
                <el-option label="卡片" value="card" />
                <el-option label="Chrome" value="chrome" />
                <el-option label="简约" value="plain" />
              </el-select>
            </div>

            <!-- 最大标签数 -->
            <div class="settings-item">
              <span class="item-label">最大标签数</span>
              <el-input-number
                :model-value="layoutStore.config.maxTabs"
                @change="layoutStore.setMaxTabs"
                :min="5"
                :max="20"
                size="small"
                style="width: 120px"
              />
            </div>

            <!-- 持久化 -->
            <div class="settings-item">
              <span class="item-label">持久化</span>
              <el-switch
                :model-value="layoutStore.config.tabPersist"
                @change="layoutStore.setTabPersist"
              />
            </div>
          </div>
        </el-collapse-item>

        <!-- 5. 动画效果 -->
        <el-collapse-item name="animation">
          <template #title><div class="section-title"><el-icon><MagicStick /></el-icon><span>动画效果</span><small>交互节奏与反馈</small></div></template>
          <div class="settings-section">
            <!-- 页面切换动画 -->
            <div class="settings-item-block">
              <div class="item-label">页面切换动画</div>
              <div class="transition-cards">
                <div
                  v-for="transition in pageTransitions"
                  :key="transition.value"
                  class="transition-card"
                  :class="{ active: layoutStore.config.pageTransition === transition.value }"
                  @click="layoutStore.setPageTransition(transition.value)"
                >
                  <div class="card-preview">
                    <div class="preview-box" :class="`preview-${transition.value}`">
                      <div class="preview-page"></div>
                    </div>
                  </div>
                  <div class="card-label">{{ transition.label }}</div>
                </div>
              </div>
            </div>

            <!-- 动画速度 -->
            <div class="settings-item">
              <span class="item-label">动画速度</span>
              <el-select
                :model-value="layoutStore.config.animationSpeed"
                @change="layoutStore.setAnimationSpeed"
                size="small"
                style="width: 120px"
              >
                <el-option label="快速" value="fast" />
                <el-option label="正常" value="normal" />
                <el-option label="缓慢" value="slow" />
              </el-select>
            </div>

            <!-- 侧边栏折叠动画 -->
            <div class="settings-item">
              <span class="item-label">侧边栏折叠动画</span>
              <el-switch
                :model-value="layoutStore.config.sidebarCollapseAnimation"
                @change="layoutStore.setSidebarCollapseAnimation"
              />
            </div>

            <!-- 主题切换动画 -->
            <div class="settings-item">
              <span class="item-label">主题切换动画</span>
              <el-switch
                :model-value="layoutStore.config.themeTransitionAnimation"
                @change="layoutStore.setThemeTransitionAnimation"
              />
            </div>
          </div>
        </el-collapse-item>

        <!-- 6. 底栏设置 -->
        <el-collapse-item name="footer">
          <template #title><div class="section-title"><el-icon><Bottom /></el-icon><span>底栏设置</span><small>版权与链接信息</small></div></template>
          <div class="settings-section">
            <!-- 显示底栏 -->
            <div class="settings-item">
              <span class="item-label">显示底栏</span>
              <el-switch
                :model-value="layoutStore.config.showFooter"
                @change="layoutStore.setShowFooter"
              />
            </div>

            <!-- 底栏样式 -->
            <div class="settings-item">
              <span class="item-label">底栏样式</span>
              <el-select
                :model-value="layoutStore.config.footerStyle"
                @change="layoutStore.setFooterStyle"
                size="small"
                style="width: 120px"
              >
                <el-option label="简约" value="simple" />
                <el-option label="分栏" value="split" />
                <el-option label="多列" value="multi" />
              </el-select>
            </div>

            <!-- 底栏高度 -->
            <div class="settings-item">
              <span class="item-label">底栏高度</span>
              <el-input-number
                :model-value="layoutStore.config.footerHeight"
                @change="layoutStore.setFooterHeight"
                :min="32"
                :max="64"
                :step="4"
                size="small"
                style="width: 120px"
              />
            </div>

            <!-- 版权文本 -->
            <div class="settings-item-block">
              <div class="item-label">版权文本</div>
              <el-input
                :model-value="layoutStore.config.footerCopyright"
                @input="layoutStore.setFooterCopyright"
                placeholder="请输入版权文本"
                size="small"
              />
            </div>

            <!-- 版权年份模式 -->
            <div class="settings-item">
              <span class="item-label">版权年份</span>
              <el-select
                :model-value="layoutStore.config.footerYearMode"
                @change="layoutStore.setFooterYearMode"
                size="small"
                style="width: 120px"
              >
                <el-option label="自动" value="auto" />
                <el-option label="自定义" value="custom" />
              </el-select>
            </div>

            <!-- 自定义年份范围 -->
            <template v-if="layoutStore.config.footerYearMode === 'custom'">
              <div class="settings-item">
                <span class="item-label">起始年份</span>
                <el-input-number
                  :model-value="layoutStore.config.footerYearStart"
                  @change="layoutStore.setFooterYearStart"
                  :min="2000"
                  :max="2100"
                  size="small"
                  style="width: 120px"
                />
              </div>
              <div class="settings-item">
                <span class="item-label">结束年份</span>
                <el-input-number
                  :model-value="layoutStore.config.footerYearEnd"
                  @change="layoutStore.setFooterYearEnd"
                  :min="2000"
                  :max="2100"
                  size="small"
                  style="width: 120px"
                />
              </div>
            </template>

            <!-- 备案号 -->
            <div class="settings-item-block">
              <div class="item-label">备案号</div>
              <el-input
                :model-value="layoutStore.config.footerIcp"
                @input="layoutStore.setFooterIcp"
                placeholder="请输入备案号"
                size="small"
              />
            </div>

            <!-- 备案号链接 -->
            <div class="settings-item-block">
              <div class="item-label">备案号链接</div>
              <el-input
                :model-value="layoutStore.config.footerIcpLink"
                @input="layoutStore.setFooterIcpLink"
                placeholder="请输入备案号链接"
                size="small"
              />
            </div>
          </div>
        </el-collapse-item>

        <!-- 7. 其他设置 -->
        <el-collapse-item name="other">
          <template #title><div class="section-title"><el-icon><MoreFilled /></el-icon><span>其他设置</span><small>内容与水印偏好</small></div></template>
          <div class="settings-section">
            <!-- 页面标题 -->
            <div class="settings-item-block">
              <div class="item-label">页面标题</div>
              <el-input
                :model-value="layoutStore.config.dynamicTitle"
                @input="layoutStore.setDynamicTitle"
                placeholder="请输入页面标题"
                size="small"
              />
            </div>

            <!-- 内容最大宽度 -->
            <div class="settings-item">
              <span class="item-label">内容最大宽度</span>
              <el-select
                :model-value="layoutStore.config.contentMaxWidth"
                @change="layoutStore.setContentMaxWidth"
                size="small"
                style="width: 120px"
              >
                <el-option label="全屏" value="full" />
                <el-option label="1200px" value="1200" />
                <el-option label="1400px" value="1400" />
                <el-option label="1600px" value="1600" />
              </el-select>
            </div>

            <!-- 内容内边距 -->
            <div class="settings-item">
              <span class="item-label">内容内边距</span>
              <el-select
                :model-value="layoutStore.config.contentPadding"
                @change="layoutStore.setContentPadding"
                size="small"
                style="width: 120px"
              >
                <el-option label="紧凑" value="compact" />
                <el-option label="正常" value="normal" />
                <el-option label="宽松" value="comfortable" />
              </el-select>
            </div>

            <!-- 水印 -->
            <div class="settings-item">
              <span class="item-label">启用水印</span>
              <el-switch
                :model-value="layoutStore.config.watermark"
                @change="layoutStore.setWatermark"
              />
            </div>

            <!-- 水印文字 -->
            <div v-if="layoutStore.config.watermark" class="settings-item-block">
              <div class="item-label">水印文字</div>
              <el-input
                :model-value="layoutStore.config.watermarkText"
                @input="layoutStore.setWatermarkText"
                placeholder="请输入水印文字"
                size="small"
              />
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>

      <!-- 底部操作 -->
      <div class="settings-footer">
        <div class="footer-note"><el-icon><InfoFilled /></el-icon> 配置会自动保存</div>
        <div class="footer-actions">
          <el-button @click="handleCopyConfig"><el-icon><CopyDocument /></el-icon>导出</el-button>
          <el-button @click="handleReset"><el-icon><RefreshLeft /></el-icon>恢复默认</el-button>
          <el-button class="clear-cache" text @click="handleClearCache"><el-icon><Delete /></el-icon></el-button>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Bottom,
  Brush,
  CollectionTag,
  CopyDocument,
  Delete,
  Grid,
  InfoFilled,
  MagicStick,
  Monitor,
  MoreFilled,
  RefreshLeft,
  Setting,
} from '@element-plus/icons-vue'
import { useLayoutStore } from '@/stores/layout'
import { useThemeStore } from '@/stores/theme'
import type { LayoutMode, PageTransition } from '@/types'

const layoutStore = useLayoutStore()
const themeStore = useThemeStore()

// 折叠面板默认展开项
const activeNames = ref(['general', 'layout'])

// 主题模式选项
const themeModeOptions = [
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
]

// 布局模式
const layoutModes = [
  {
    value: 'sidebar-header' as LayoutMode,
    label: '侧边栏+顶栏',
    showSidebar: true,
    showHeader: true,
  },
  {
    value: 'sidebar-only' as LayoutMode,
    label: '仅侧边栏',
    showSidebar: true,
    showHeader: false,
    showRail: true,
  },
]

// 页面切换动画
const pageTransitions = [
  { value: 'fade' as PageTransition, label: '淡入淡出' },
  { value: 'fade-slide' as PageTransition, label: '滑动淡入' },
  { value: 'slide-up' as PageTransition, label: '上滑进入' },
  { value: 'slide-right' as PageTransition, label: '右侧滑入' },
  { value: 'zoom' as PageTransition, label: '缩放' },
  { value: 'none' as PageTransition, label: '无动画' },
]

// 复制配置
function handleCopyConfig() {
  const json = layoutStore.copyConfig()
  navigator.clipboard.writeText(json).then(() => {
    ElMessage.success('配置已复制到剪贴板')
  }).catch(() => {
    ElMessage.error('复制失败，请手动复制')
    console.log(json)
  })
}

// 恢复默认
function handleReset() {
  layoutStore.resetConfig()
  ElMessage.success('已恢复默认配置')
}

// 清除缓存
function handleClearCache() {
  localStorage.clear()
  sessionStorage.clear()
  ElMessage.success('缓存已清除，页面将刷新')
  setTimeout(() => {
    window.location.reload()
  }, 1000)
}
</script>

<style scoped lang="scss">
.settings-content {
  display: flex;
  flex-direction: column;
  gap: $spacing-lg;
  padding-bottom: $spacing-xl;
}

.settings-collapse {
  border: none;

  :deep(.el-collapse-item__header) {
    font-weight: $font-semibold;
    font-size: $font-base;
    color: var(--cp-text);
    background: transparent;
    border: none;
    padding: $spacing-md 0;
  }

  :deep(.el-collapse-item__wrap) {
    border: none;
    background: transparent;
  }

  :deep(.el-collapse-item__content) {
    padding: 0;
  }
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

.settings-item {
  @include flex-between;
  align-items: center;

  .item-label {
    font-size: $font-sm;
    color: var(--cp-text);
  }
}

.settings-item-block {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  .item-label {
    font-size: $font-sm;
    color: var(--cp-text);
    font-weight: $font-medium;
  }
}

// 布局模式卡片
.layout-modes {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: $spacing-md;
}

.layout-mode-card {
  cursor: pointer;
  border: 2px solid var(--cp-border);
  border-radius: $radius-md;
  padding: $spacing-sm;
  transition: all $transition-base;

  &:hover {
    border-color: var(--cp-primary);
  }

  &.active {
    border-color: var(--cp-primary);
    background: var(--cp-primary-light);
  }

  .mode-preview {
    margin-bottom: $spacing-xs;

    .preview-container {
      width: 100%;
      height: 60px;
      border: 1px solid var(--cp-border);
      border-radius: $radius-sm;
      overflow: hidden;
      display: flex;
      background: var(--cp-bg);

      .preview-rail {
        width: 14%;
        background: color-mix(in srgb, var(--cp-primary) 18%, var(--cp-bg-elevated));
        border-right: 1px solid var(--cp-border);
      }

      .preview-sidebar {
        width: 30%;
        background: var(--cp-bg-elevated);
        border-right: 1px solid var(--cp-border);
      }

      .preview-main {
        flex: 1;
        display: flex;
        flex-direction: column;

        .preview-header {
          height: 20%;
          background: var(--cp-bg-elevated);
          border-bottom: 1px solid var(--cp-border);
        }

        .preview-content {
          flex: 1;
          background: var(--cp-bg);
        }
      }
    }
  }

  .mode-name {
    text-align: center;
    font-size: $font-xs;
    color: var(--cp-text-secondary);
  }
}

// 颜色选择器
.color-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, 36px);
  gap: 8px;
}

.color-item {
  display: grid;
  width: 36px;
  height: 30px;
  padding: 0;
  place-items: center;
  cursor: pointer;
  border: 1px solid var(--cp-border);
  border-radius: 4px;
  background: var(--cp-bg);
  transition: border-color $transition-base, box-shadow $transition-base, transform $transition-base;

  &:hover {
    border-color: color-mix(in srgb, var(--cp-primary) 60%, var(--cp-border));
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 2px solid var(--cp-primary);
    outline-offset: 2px;
  }

  &.active {
    border: 2px solid var(--cp-primary);
    box-shadow: 0 0 0 2px var(--cp-primary-lighter);
  }

  .color-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 8%);
  }
}

// 页面切换动画卡片
.transition-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: $spacing-sm;
}

.transition-card {
  cursor: pointer;
  border: 2px solid var(--cp-border);
  border-radius: $radius-md;
  padding: $spacing-xs;
  transition: all $transition-base;
  background: var(--cp-bg);

  &:hover {
    border-color: var(--cp-primary);
    transform: translateY(-2px);
  }

  &.active {
    border-color: var(--cp-primary);
    background: var(--cp-primary-light);
  }

  .card-preview {
    height: 50px;
    margin-bottom: $spacing-xs;
    @include flex-center;
    overflow: hidden;
    border-radius: $radius-sm;
    background: var(--cp-bg-elevated);
    position: relative;

    .preview-box {
      width: 100%;
      height: 100%;
      position: relative;
      @include flex-center;

      .preview-page {
        width: 30px;
        height: 24px;
        background: var(--cp-primary);
        border-radius: $radius-sm;
        opacity: 0.8;
      }
    }

    // 动画预览
    .preview-fade .preview-page {
      animation: preview-fade 2s ease-in-out infinite;
    }

    .preview-fade-slide .preview-page {
      animation: preview-fade-slide 2s ease-in-out infinite;
    }

    .preview-slide-up .preview-page {
      animation: preview-slide-up 2s ease-in-out infinite;
    }

    .preview-slide-right .preview-page {
      animation: preview-slide-right 2s ease-in-out infinite;
    }

    .preview-zoom .preview-page {
      animation: preview-zoom 2s ease-in-out infinite;
    }

    .preview-none .preview-page {
      opacity: 1;
    }
  }

  .card-label {
    text-align: center;
    font-size: 11px;
    color: var(--cp-text-secondary);
  }
}

// 动画关键帧
@keyframes preview-fade {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}

@keyframes preview-fade-slide {
  0%, 100% {
    opacity: 0.3;
    transform: translateX(-8px);
  }
  50% {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes preview-slide-up {
  0%, 100% {
    opacity: 0.3;
    transform: translateY(8px);
  }
  50% {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes preview-slide-right {
  0%, 100% {
    opacity: 0.3;
    transform: translateX(12px);
  }
  50% {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes preview-zoom {
  0%, 100% {
    opacity: 0.3;
    transform: scale(0.7);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

// 底部操作
.settings-footer {
  padding-top: $spacing-lg;
  border-top: 1px solid var(--cp-border);
  margin-top: $spacing-lg;
}

// ==================== 设置中心视觉重构 ====================
:global(.settings-drawer) {
  --settings-surface: color-mix(in srgb, var(--cp-bg-elevated) 82%, var(--cp-primary) 18%);
  --settings-muted: var(--cp-text-secondary);

  .el-drawer__header {
    margin: 0;
    padding: 22px 24px 18px;
    border-bottom: 1px solid var(--cp-border-light);
  }

  .el-drawer__body {
    padding: 0 18px 18px;
    overflow: hidden;
    background: var(--cp-bg);
  }
}

.drawer-header,
.drawer-title-group,
.section-title,
.footer-note,
.footer-actions {
  display: flex;
  align-items: center;
}

.drawer-header {
  justify-content: space-between;
}

.drawer-title-group {
  gap: 12px;

  h2 {
    margin: 0;
    color: var(--cp-text);
    font-size: 18px;
    font-weight: 650;
    letter-spacing: -0.2px;
  }

  p {
    margin: 3px 0 0;
    color: var(--cp-text-secondary);
    font-size: 12px;
  }
}

.drawer-title-icon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  color: white;
  font-size: 19px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--cp-primary), color-mix(in srgb, var(--cp-primary) 62%, #6750e8));
  box-shadow: 0 7px 16px color-mix(in srgb, var(--cp-primary) 28%, transparent);
}

.settings-content {
  height: 100%;
  gap: 14px;
  padding: 18px 6px 0;
  overflow-y: auto;
  -ms-overflow-style: none;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.settings-intro {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  color: var(--cp-text);
  border: 1px solid color-mix(in srgb, var(--cp-primary) 16%, var(--cp-border));
  border-radius: 14px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--cp-primary) 11%, var(--cp-bg)), var(--cp-bg));

  strong,
  p,
  .intro-eyebrow {
    display: block;
  }

  strong {
    margin-top: 3px;
    font-size: 13px;
    font-weight: 600;
  }

  p {
    margin: 2px 0 0;
    color: var(--cp-text-secondary);
    font-size: 12px;
  }

  .intro-eyebrow {
    color: var(--cp-primary);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
  }

  > .el-icon {
    color: var(--cp-primary);
    font-size: 28px;
    opacity: 0.8;
  }
}

.settings-collapse {
  display: flex;
  flex-direction: column;
  gap: 10px;

  :deep(.el-collapse-item) {
    overflow: hidden;
    border: 1px solid var(--cp-border-light);
    border-radius: 12px;
    background: var(--cp-bg);
    transition: border-color $transition-base, box-shadow $transition-base;

    &.is-active {
      border-color: color-mix(in srgb, var(--cp-primary) 30%, var(--cp-border));
      box-shadow: 0 4px 16px color-mix(in srgb, var(--cp-primary) 7%, transparent);
    }
  }

  :deep(.el-collapse-item__header) {
    min-height: 58px;
    padding: 0 15px;
    font-weight: $font-semibold;

    .el-collapse-item__arrow {
      margin-left: 8px;
      color: var(--cp-text-tertiary);
    }
  }

  :deep(.el-collapse-item__content) {
    padding: 0 14px 15px;
  }
}

.section-title {
  width: 100%;
  gap: 9px;
  color: var(--cp-text);

  > .el-icon {
    display: grid;
    width: 26px;
    height: 26px;
    place-items: center;
    color: var(--cp-primary);
    border-radius: 8px;
    background: var(--cp-primary-lighter);
  }

  span {
    font-size: 14px;
    font-weight: 600;
  }

  small {
    margin-left: auto;
    padding-right: 5px;
    color: var(--cp-text-tertiary);
    font-size: 11px;
    font-weight: 400;
  }
}

.settings-section {
  gap: 6px;
}

.settings-item {
  min-height: 48px;
  padding: 7px 8px 7px 10px;
  border-radius: 9px;
  transition: background $transition-fast;

  &:hover {
    background: var(--cp-bg-elevated);
  }

  .item-label {
    color: var(--cp-text-secondary);
    font-size: 13px;
  }

  :deep(.el-select),
  :deep(.el-input-number) {
    width: 132px !important;
  }
}

.settings-item-block {
  gap: 8px;
  padding: 11px 10px;
  border-radius: 9px;
  background: var(--cp-bg-elevated);

  .item-label {
    color: var(--cp-text-secondary);
    font-size: 12px;
    font-weight: 500;
  }
}

.layout-modes {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.layout-mode-card {
  position: relative;
  padding: 8px;
  border: 1px solid var(--cp-border);
  border-radius: 10px;
  background: var(--cp-bg);

  &:hover {
    border-color: color-mix(in srgb, var(--cp-primary) 60%, var(--cp-border));
    box-shadow: $shadow-sm;
    transform: translateY(-1px);
  }

  &.active {
    border-color: var(--cp-primary);
    background: linear-gradient(180deg, var(--cp-primary-lighter), var(--cp-bg));
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--cp-primary) 11%, transparent);

    &::after {
      content: '✓';
      position: absolute;
      top: 7px;
      right: 7px;
      display: grid;
      width: 16px;
      height: 16px;
      place-items: center;
      color: white;
      font-size: 10px;
      font-weight: 700;
      border-radius: 50%;
      background: var(--cp-primary);
    }
  }

  .mode-preview {
    margin-bottom: 7px;

    .preview-container {
      height: 70px;
      border-color: var(--cp-border-light);
      border-radius: 6px;
      background: var(--cp-bg-elevated);

      .preview-rail,
      .preview-sidebar,
      .preview-header {
        background: color-mix(in srgb, var(--cp-primary) 7%, var(--cp-bg-elevated));
      }

      .preview-content {
        background: var(--cp-bg);
      }
    }
  }

  .mode-name {
    color: var(--cp-text-secondary);
    font-size: 12px;
    font-weight: 500;
  }
}

.transition-cards {
  gap: 8px;
}

.transition-card {
  padding: 6px;
  border-width: 1px;
  border-radius: 9px;

  &.active {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--cp-primary) 12%, transparent);
  }

  .card-preview {
    height: 44px;
    margin-bottom: 5px;
  }
}

.settings-footer {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 -6px;
  padding: 14px 6px 2px;
  border: 0;
  background: linear-gradient(180deg, transparent, var(--cp-bg) 24%);
}

.footer-note {
  gap: 5px;
  color: var(--cp-text-tertiary);
  font-size: 11px;

  .el-icon { color: var(--cp-success); }
}

.footer-actions {
  gap: 7px;

  :deep(.el-button) {
    height: 30px;
    margin: 0;
    padding: 0 9px;
    color: var(--cp-text-secondary);
    border-color: var(--cp-border);
    background: var(--cp-bg);

    .el-icon { margin-right: 4px; }

    &:hover {
      color: var(--cp-primary);
      border-color: var(--cp-primary);
      background: var(--cp-primary-lighter);
    }
  }

  :deep(.clear-cache) {
    width: 30px;
    padding: 0;
    color: var(--cp-text-tertiary);

    .el-icon { margin: 0; }
  }
}

@include media-max($breakpoint-sm) {
  :global(.settings-drawer) {
    width: min(100vw, 480px) !important;
  }

  .section-title small,
  .footer-note {
    display: none;
  }
}
</style>
