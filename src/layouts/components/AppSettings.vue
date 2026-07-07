<template>
  <el-drawer
    v-model="layoutStore.settingsVisible"
    title="全局配置"
    direction="rtl"
    size="400px"
    :destroy-on-close="false"
  >
    <div class="settings-content">
      <!-- 布局模式 -->
      <div class="settings-section">
        <div class="section-title">布局模式</div>
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
                <div v-if="mode.value !== 'header-only'" class="preview-sidebar"></div>
                <div class="preview-main">
                  <div v-if="mode.value !== 'sidebar-only'" class="preview-header"></div>
                  <div class="preview-content"></div>
                </div>
              </div>
            </div>
            <div class="mode-name">{{ mode.label }}</div>
          </div>
        </div>
      </div>

      <!-- 主题颜色 -->
      <div class="settings-section">
        <div class="section-title">主题颜色</div>
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

      <!-- 显示配置 -->
      <div class="settings-section">
        <div class="section-title">显示配置</div>
        <div class="settings-item">
          <span class="item-label">显示 Logo</span>
          <el-switch
            :model-value="layoutStore.config.showLogo"
            @change="layoutStore.toggleLogo()"
          />
        </div>
        <div class="settings-item">
          <span class="item-label">固定顶栏</span>
          <el-switch
            :model-value="layoutStore.config.fixedHeader"
            @change="layoutStore.toggleFixedHeader()"
          />
        </div>
      </div>

      <!-- 动态标题 -->
      <div class="settings-section">
        <div class="section-title">页面标题</div>
        <el-input
          :model-value="layoutStore.config.dynamicTitle"
          placeholder="请输入页面标题"
          @input="handleTitleInput"
        />
      </div>

      <!-- 页面切换动画 -->
      <div class="settings-section">
        <div class="section-title">页面切换动画</div>
        <div class="transition-cards">
          <div
            v-for="transition in pageTransitions"
            :key="transition.value"
            class="transition-card"
            :class="{ active: layoutStore.config.pageTransition === transition.value }"
            @click="handleTransitionChange(transition.value)"
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

      <!-- 底部按钮 -->
      <div class="settings-footer">
        <el-button type="primary" @click="handleReset" style="width: 100%">
          恢复默认配置
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { Check } from '@element-plus/icons-vue'
import { useLayoutStore } from '@/stores/layout'
import { useThemeStore } from '@/stores/theme'
import type { LayoutMode, PageTransition } from '@/types'

const layoutStore = useLayoutStore()
const themeStore = useThemeStore()

const layoutModes = [
  { value: 'sidebar-header' as LayoutMode, label: '侧边栏+顶栏' },
  { value: 'header-only' as LayoutMode, label: '仅顶栏' },
  { value: 'sidebar-only' as LayoutMode, label: '仅侧边栏' },
]

const pageTransitions = [
  { value: 'fade' as PageTransition, label: '淡入淡出' },
  { value: 'fade-slide' as PageTransition, label: '滑动淡入' },
  { value: 'slide-up' as PageTransition, label: '上滑进入' },
  { value: 'slide-right' as PageTransition, label: '右侧滑入' },
  { value: 'zoom' as PageTransition, label: '缩放' },
  { value: 'none' as PageTransition, label: '无动画' },
]

function handleTitleInput(value: string) {
  layoutStore.setDynamicTitle(value)
}

function handleTransitionChange(value: PageTransition) {
  layoutStore.setPageTransition(value)
}

function handleReset() {
  layoutStore.resetConfig()
  ElMessage.success('已恢复默认配置')
}
</script>

<style scoped lang="scss">
.settings-content {
  display: flex;
  flex-direction: column;
  gap: $spacing-xl;
  padding-bottom: $spacing-xl;
}

.settings-section {
  .section-title {
    font-size: $font-base;
    font-weight: $font-semibold;
    color: var(--cp-text);
    margin-bottom: $spacing-md;
  }
}

.layout-modes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
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

.settings-item {
  @include flex-between;
  padding: $spacing-md 0;

  .item-label {
    font-size: $font-sm;
    color: var(--cp-text);
  }
}

.settings-footer {
  padding-top: $spacing-lg;
  border-top: 1px solid var(--cp-border);
}

.transition-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: $spacing-md;
}

.transition-card {
  cursor: pointer;
  border: 2px solid var(--cp-border);
  border-radius: $radius-md;
  padding: $spacing-sm;
  transition: all $transition-base;
  background: var(--cp-bg);

  &:hover {
    border-color: var(--cp-primary);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  &.active {
    border-color: var(--cp-primary);
    background: var(--cp-primary-light);
    box-shadow: 0 4px 12px rgba(6, 182, 212, 0.2);
  }

  .card-preview {
    height: 60px;
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
        width: 40px;
        height: 32px;
        background: var(--cp-primary);
        border-radius: $radius-sm;
        opacity: 0.8;
      }
    }

    // 淡入淡出动画预览
    .preview-fade .preview-page {
      animation: preview-fade 2s ease-in-out infinite;
    }

    // 滑动淡入动画预览
    .preview-fade-slide .preview-page {
      animation: preview-fade-slide 2s ease-in-out infinite;
    }

    // 上滑进入动画预览
    .preview-slide-up .preview-page {
      animation: preview-slide-up 2s ease-in-out infinite;
    }

    // 右侧滑入动画预览
    .preview-slide-right .preview-page {
      animation: preview-slide-right 2s ease-in-out infinite;
    }

    // 缩放动画预览
    .preview-zoom .preview-page {
      animation: preview-zoom 2s ease-in-out infinite;
    }

    // 无动画预览（静态）
    .preview-none .preview-page {
      opacity: 1;
    }
  }

  .card-label {
    text-align: center;
    font-size: $font-xs;
    color: var(--cp-text-secondary);
    font-weight: $font-medium;
  }
}

// 动画关键帧定义
@keyframes preview-fade {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}

@keyframes preview-fade-slide {
  0%, 100% {
    opacity: 0.3;
    transform: translateX(-10px);
  }
  50% {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes preview-slide-up {
  0%, 100% {
    opacity: 0.3;
    transform: translateY(10px);
  }
  50% {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes preview-slide-right {
  0%, 100% {
    opacity: 0.3;
    transform: translateX(20px);
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
</style>
