<!--
  主题色切换测试页面

  用途：验证主题色动态切换是否正常工作

  功能：
  - 测试 Element Plus 组件是否跟随主题色变化
  - 测试自定义样式是否正确使用 CSS 变量
  - 提供完整的验证步骤和浏览器 DevTools 排查方法

  访问路径：/test/theme

  相关文档：wiki/reports/THEME_COLOR_SWITCH_FIX.md
-->
<template>
  <div class="theme-test-page">
    <div class="test-container">
      <h1>主题色切换测试页</h1>
      <p class="subtitle">验证 Element Plus 组件和自定义样式是否都能跟随主题色变化</p>

      <div class="test-section">
        <h2>1. Element Plus 按钮组件</h2>
        <div class="button-group">
          <el-button type="primary">Primary Button</el-button>
          <el-button type="primary" plain>Plain Button</el-button>
          <el-button type="primary" :icon="Check">With Icon</el-button>
          <el-button type="primary" loading>Loading</el-button>
        </div>
      </div>

      <div class="test-section">
        <h2>2. 自定义样式元素（使用 CSS 变量）</h2>
        <div class="custom-elements">
          <div class="custom-box">
            <div class="box-icon">✓</div>
            <p>使用 var(--cp-primary) 背景色</p>
          </div>
          <div class="custom-box-border">
            <div class="box-icon">✓</div>
            <p>使用 var(--cp-primary) 边框色</p>
          </div>
          <div class="custom-box-light">
            <div class="box-icon">✓</div>
            <p>使用 var(--cp-primary-light) 背景色</p>
          </div>
        </div>
      </div>

      <div class="test-section">
        <h2>3. Element Plus 表单组件</h2>
        <el-form style="max-width: 500px">
          <el-form-item label="输入框">
            <el-input v-model="testInput" placeholder="聚焦时边框应该是主题色">
              <template #prefix>
                <el-icon><User /></el-icon>
              </template>
            </el-input>
          </el-form-item>
          <el-form-item label="选择器">
            <el-select v-model="testSelect" placeholder="请选择">
              <el-option label="选项1" value="1" />
              <el-option label="选项2" value="2" />
            </el-select>
          </el-form-item>
          <el-form-item label="开关">
            <el-switch v-model="testSwitch" />
          </el-form-item>
          <el-form-item label="单选框">
            <el-radio-group v-model="testRadio">
              <el-radio value="1">选项1</el-radio>
              <el-radio value="2">选项2</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="复选框">
            <el-checkbox v-model="testCheckbox">同意用户协议</el-checkbox>
          </el-form-item>
        </el-form>
      </div>

      <div class="test-section">
        <h2>4. 验证步骤</h2>
        <div class="verification-steps">
          <el-alert type="info" :closable="false" show-icon>
            <template #title>
              <div class="alert-content">
                <p><strong>如何验证主题色是否正确切换：</strong></p>
                <ol>
                  <li>点击右上角的主题切换按钮，切换不同的主题色</li>
                  <li>观察上面所有 Element Plus 按钮是否立即变色</li>
                  <li>观察自定义样式元素（有背景色/边框的方块）是否立即变色</li>
                  <li>聚焦输入框，观察边框色是否为当前主题色</li>
                  <li>打开浏览器开发者工具（F12）→ Elements 面板</li>
                  <li>选中任意按钮，查看 Computed 样式</li>
                  <li>如果看到 <code>--el-color-primary</code> 和 <code>--cp-primary</code> 的值与你选择的主题色一致，说明成功</li>
                </ol>
              </div>
            </template>
          </el-alert>
        </div>
      </div>

      <div class="test-section">
        <h2>5. 浏览器 DevTools 排查方法</h2>
        <div class="devtools-guide">
          <el-card>
            <p><strong>步骤 1：检查 CSS 变量是否生效</strong></p>
            <ol>
              <li>按 F12 打开开发者工具</li>
              <li>切换到 Elements 标签</li>
              <li>在 DOM 树中选择 <code>&lt;html&gt;</code> 或 <code>:root</code></li>
              <li>在右侧 Styles 面板中，查看 <code>element.style</code> 区域</li>
              <li>应该能看到：
                <ul>
                  <li><code>--cp-primary: #06b6d4</code> (或你选择的颜色)</li>
                  <li><code>--el-color-primary: #06b6d4</code></li>
                  <li><code>--el-color-primary-light-3: ...</code></li>
                </ul>
              </li>
            </ol>

            <p><strong>步骤 2：检查按钮实际使用的颜色</strong></p>
            <ol>
              <li>在 DOM 树中选中一个 <code>&lt;button class="el-button el-button--primary"&gt;</code></li>
              <li>在 Styles 面板中查看其样式规则</li>
              <li>找到 <code>background-color</code> 属性</li>
              <li>应该看到：<code>background-color: var(--el-color-primary)</code></li>
              <li>点击颜色方块，可以看到计算后的实际颜色值</li>
            </ol>

            <p><strong>步骤 3：检查自定义元素</strong></p>
            <ol>
              <li>选中上面的自定义方块元素</li>
              <li>查看 Computed 面板（计算后的样式）</li>
              <li>找到 <code>background-color</code> 或 <code>border-color</code></li>
              <li>应该是当前主题色的值，而不是固定的 <code>#06b6d4</code></li>
            </ol>
          </el-card>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { User, Check } from '@element-plus/icons-vue'

const testInput = ref('')
const testSelect = ref('')
const testSwitch = ref(false)
const testRadio = ref('1')
const testCheckbox = ref(false)
</script>

<style scoped lang="scss">
.theme-test-page {
  min-height: 100vh;
  padding: $spacing-2xl;
  background: $bg;
}

.test-container {
  max-width: 1200px;
  margin: 0 auto;

  h1 {
    font-size: $font-3xl;
    font-weight: $font-bold;
    color: $text;
    margin-bottom: $spacing-sm;
  }

  .subtitle {
    font-size: $font-base;
    color: $text-secondary;
    margin-bottom: $spacing-2xl;
  }
}

.test-section {
  background: $bg-elevated;
  border-radius: $radius-lg;
  padding: $spacing-xl;
  margin-bottom: $spacing-xl;
  box-shadow: $shadow-sm;

  h2 {
    font-size: $font-xl;
    font-weight: $font-semibold;
    color: $text;
    margin-bottom: $spacing-lg;
  }
}

.button-group {
  display: flex;
  gap: $spacing-md;
  flex-wrap: wrap;
}

.custom-elements {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: $spacing-lg;
}

.custom-box {
  padding: $spacing-xl;
  border-radius: $radius-md;
  text-align: center;
  background: var(--cp-primary);
  color: white;
  transition: transform $transition-base;

  &:hover {
    transform: translateY(-4px);
  }

  .box-icon {
    font-size: $font-3xl;
    font-weight: $font-bold;
    margin-bottom: $spacing-sm;
  }

  p {
    font-size: $font-sm;
  }
}

.custom-box-border {
  padding: $spacing-xl;
  border-radius: $radius-md;
  text-align: center;
  background: $bg;
  border: 3px solid var(--cp-primary);
  color: var(--cp-primary);
  transition: all $transition-base;

  &:hover {
    background: var(--cp-primary-lighter);
    transform: translateY(-4px);
  }

  .box-icon {
    font-size: $font-3xl;
    font-weight: $font-bold;
    margin-bottom: $spacing-sm;
  }

  p {
    font-size: $font-sm;
  }
}

.custom-box-light {
  padding: $spacing-xl;
  border-radius: $radius-md;
  text-align: center;
  background: var(--cp-primary-light);
  color: var(--cp-primary);
  transition: all $transition-base;

  &:hover {
    background: var(--cp-primary);
    color: white;
    transform: translateY(-4px);
  }

  .box-icon {
    font-size: $font-3xl;
    font-weight: $font-bold;
    margin-bottom: $spacing-sm;
  }

  p {
    font-size: $font-sm;
  }
}

.verification-steps {
  .alert-content {
    p {
      margin-bottom: $spacing-sm;
    }

    ol {
      margin: 0;
      padding-left: $spacing-lg;

      li {
        margin-bottom: $spacing-xs;
        line-height: $line-height-relaxed;
      }
    }

    code {
      background: rgba(0, 0, 0, 0.05);
      padding: 2px 6px;
      border-radius: $radius-sm;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: $font-sm;
    }
  }
}

.devtools-guide {
  :deep(.el-card__body) {
    p {
      margin-top: $spacing-lg;
      margin-bottom: $spacing-sm;
      font-weight: $font-semibold;
      color: $text;

      &:first-child {
        margin-top: 0;
      }
    }

    ol {
      margin: 0;
      padding-left: $spacing-lg;

      li {
        margin-bottom: $spacing-sm;
        line-height: $line-height-relaxed;
        color: $text-secondary;
      }
    }

    ul {
      margin: $spacing-sm 0;
      padding-left: $spacing-lg;

      li {
        margin-bottom: $spacing-xs;
        color: $text-secondary;
      }
    }

    code {
      background: rgba(0, 0, 0, 0.05);
      padding: 2px 6px;
      border-radius: $radius-sm;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: $font-sm;
      color: var(--cp-primary);
    }
  }
}

@include dark-mode {
  .theme-test-page {
    background: $dark-bg;
  }

  .test-container {
    h1 {
      color: $dark-text;
    }

    .subtitle {
      color: $dark-text-secondary;
    }
  }

  .test-section {
    background: $dark-bg-elevated;

    h2 {
      color: $dark-text;
    }
  }

  .custom-box-border {
    background: $dark-bg;
  }

  .devtools-guide {
    :deep(.el-card__body) {
      p {
        color: $dark-text;
      }

      li {
        color: $dark-text-secondary;
      }

      code {
        background: rgba(255, 255, 255, 0.1);
      }
    }
  }
}
</style>
