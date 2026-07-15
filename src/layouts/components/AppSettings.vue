<template>
  <el-drawer
    v-model="layoutStore.settingsVisible"
    title="全局配置"
    direction="rtl"
    size="420px"
    :destroy-on-close="false"
  >
    <div class="settings-content">
      <el-collapse v-model="activeNames" class="settings-collapse">
        <!-- 1. 整体风格 -->
        <el-collapse-item title="整体风格" name="general">
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
                <div
                  v-for="color in themeStore.presetColors"
                  :key="color.value"
                  class="color-item"
                  :class="{ active: themeStore.primaryColor === color.value }"
                  :style="{ background: color.value }"
                  @click="themeStore.setPrimaryColor(color.value)"
                >
                  <el-icon v-if="themeStore.primaryColor === color.value" class="check-icon">
                    <Check />
                  </el-icon>
                </div>
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
        <el-collapse-item title="布局设置" name="layout">
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

            <!-- 固定侧边栏 -->
            <div class="settings-item">
              <span class="item-label">固定侧边栏</span>
              <el-switch
                :model-value="layoutStore.config.fixedSidebar"
                @change="layoutStore.setFixedSidebar"
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
        <el-collapse-item title="顶栏设置" name="header">
          <div class="settings-section">
            <!-- 固定顶栏 -->
            <div class="settings-item">
              <span class="item-label">固定顶栏</span>
              <el-switch
                :model-value="layoutStore.config.fixedHeader"
                @change="layoutStore.setFixedHeader"
              />
            </div>

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
          </div>
        </el-collapse-item>

        <!-- 4. 多标签页 -->
        <el-collapse-item title="多标签页" name="tabs">
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
        <el-collapse-item title="动画效果" name="animation">
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
        <el-collapse-item title="底栏设置" name="footer">
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
        <el-collapse-item title="其他设置" name="other">
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
        <el-button type="primary" @click="handleCopyConfig" style="width: 100%">
          复制配置 JSON
        </el-button>
        <el-button @click="handleReset" style="width: 100%; margin-top: 12px">
          恢复默认配置
        </el-button>
        <el-button @click="handleClearCache" style="width: 100%; margin-top: 12px">
          清除缓存
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Check } from '@element-plus/icons-vue'
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
    value: 'header-only' as LayoutMode,
    label: '仅顶栏',
    showSidebar: false,
    showHeader: true,
  },
  {
    value: 'sidebar-only' as LayoutMode,
    label: '仅侧边栏',
    showSidebar: true,
    showHeader: false,
  },
  {
    value: 'mixed' as LayoutMode,
    label: '混合模式',
    showSidebar: true,
    showHeader: true,
  },
  {
    value: 'top-menu' as LayoutMode,
    label: '顶部菜单',
    showSidebar: false,
    showHeader: true,
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
  grid-template-columns: repeat(5, 1fr);
  gap: $spacing-md;
}

.color-item {
  width: 100%;
  aspect-ratio: 1;
  border-radius: $radius-md;
  cursor: pointer;
  position: relative;
  transition: all $transition-base;
  border: 2px solid transparent;
  @include flex-center;

  &:hover {
    transform: scale(1.1);
  }

  &.active {
    border-color: var(--cp-text);
  }

  .check-icon {
    color: white;
    font-size: $font-xl;
    font-weight: $font-bold;
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
</style>
