<template>
  <div class="page">
    <div class="left">
      <div class="brand">
        <div class="brand-icon"><img :src="coreLogo" class="brand-logo" alt="" /></div>
        <span>{{ brandName }}</span>
      </div>
      <div class="characters-area">
        <AnimatedCharacters
          :is-typing="isTyping"
          :has-secret="!!loginForm.password"
          :secret-visible="showPassword"
        />
      </div>
      <div class="footer-links">
        <a href="#">隐私政策</a>
        <a href="#">服务条款</a>
        <a href="#">联系</a>
      </div>
      <div class="deco-grid" />
      <div class="deco-circle deco-circle-1" />
      <div class="deco-circle deco-circle-2" />
    </div>
    <div class="right">
      <div class="form-wrapper">
        <div class="mobile-brand">
          <div class="brand-icon"><img :src="coreLogo" class="brand-logo" alt="" /></div>
          <span>{{ brandName }}</span>
        </div>
        <div class="header">
          <h1>{{ title }}</h1>
          <p>{{ subtitle }}</p>
        </div>

        <el-form
          ref="loginFormRef"
          :model="loginForm"
          :rules="loginRules"
          class="login-form"
          @submit.prevent="onSubmit"
        >
          <el-form-item prop="account">
            <el-input
              v-model="loginForm.account"
              :placeholder="accountPlaceholder"
              size="large"
              @focus="isTyping = true"
              @blur="isTyping = false"
            >
              <template #prefix>
                <el-icon><User /></el-icon>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item prop="password">
            <el-input
              v-model="loginForm.password"
              :type="showPassword ? 'text' : 'password'"
              :placeholder="passwordPlaceholder"
              size="large"
            >
              <template #prefix>
                <el-icon><Lock /></el-icon>
              </template>
              <template #suffix>
                <el-icon class="eye-icon" @click="showPassword = !showPassword">
                  <View v-if="showPassword" />
                  <Hide v-else />
                </el-icon>
              </template>
            </el-input>
          </el-form-item>

          <div class="options">
            <el-checkbox v-model="loginForm.remember">30天内免登录</el-checkbox>
            <el-link type="primary" :underline="false" @click="$router.push('/forgot-password')">
              忘记密码？
            </el-link>
          </div>

          <el-form-item>
            <el-button
              type="primary"
              size="large"
              :loading="loading"
              native-type="submit"
              class="submit-btn"
            >
              {{ loading ? '登录中...' : '登录' }}
            </el-button>
          </el-form-item>
        </el-form>

        <p class="signup-link">
          还没有账号？
          <el-link type="primary" :underline="false" @click="$router.push('/register')">
            立即注册
          </el-link>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { User, Lock, View, Hide } from '@element-plus/icons-vue'
import coreLogo from '@/asset/core.svg'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import AnimatedCharacters from '@/components/login/AnimatedCharacters.vue'
import { useUserStore } from '@/stores/user'

const props = withDefaults(defineProps<{
  brandName?: string
  title?: string
  subtitle?: string
  accountPlaceholder?: string
  passwordPlaceholder?: string
}>(), {
  brandName: '中台基座',
  title: '欢迎登录',
  subtitle: '请输入账号和密码',
  accountPlaceholder: '请输入账号（用户名/手机号）',
  passwordPlaceholder: '请输入密码',
})

const router = useRouter()
const userStore = useUserStore()

const loginFormRef = ref<FormInstance>()
const showPassword = ref(false)
const loading = ref(false)
const isTyping = ref(false)

const loginForm = reactive({
  account: '',
  password: '',
  remember: false,
})

// 表单验证规则
const loginRules: FormRules = {
  account: [
    { required: true, message: '请输入账号', trigger: 'blur' },
    { min: 2, max: 50, message: '账号长度在 2 到 50 个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 8, max: 20, message: '密码长度在 8 到 20 个字符', trigger: 'blur' },
  ],
}

async function onSubmit() {
  if (!loginFormRef.value) return

  try {
    // 先验证表单
    await loginFormRef.value.validate()

    loading.value = true

    const result = await userStore.login({
      account: loginForm.account,
      password: loginForm.password,
      remember: loginForm.remember,
    })

    if (result.success) {
      router.push('/dashboard')
    } else {
      ElMessage.error(result.message || '登录失败，请稍后重试！')
    }
  } catch (error) {
    console.log('表单验证失败', error)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped lang="scss">
// ==================== 页面布局 ====================
.page {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 100vh;
}

// ==================== 左侧区域 ====================
.left {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: $spacing-2xl;
  color: white;
  overflow: hidden;
  @include gradient-bg(var(--cp-login-left-bg-start), var(--cp-login-left-bg-end));
}

.brand {
  position: relative;
  z-index: 20;
  @include flex-align-center;
  gap: $spacing-sm;
  font-size: $font-lg;
  font-weight: $font-semibold;
}

.brand-icon {
  width: 32px;
  height: 32px;
  border-radius: $radius-md;
  @include glass-effect(0.1);
  @include flex-center;

  .brand-logo {
    width: 16px;
    height: 16px;
  }
}

.characters-area {
  position: relative;
  z-index: 20;
  @include flex-center;
  align-items: flex-end;
  height: 500px;
}

.footer-links {
  position: relative;
  z-index: 20;
  display: flex;
  gap: $spacing-xl;
  font-size: $font-sm;

  a {
    color: rgba(255, 255, 255, 0.6);
    transition: color $transition-base;

    &:hover {
      color: white;
    }
  }
}

// 装饰元素
.deco-grid {
  @include absolute-full;
  background-image:
    linear-gradient(to right, rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: 20px 20px;
}

.deco-circle {
  position: absolute;
  border-radius: $radius-full;
  filter: blur(48px);
}

.deco-circle-1 {
  top: 25%;
  right: 25%;
  width: 256px;
  height: 256px;
  background: rgba(255, 255, 255, 0.1);
}

.deco-circle-2 {
  bottom: 25%;
  left: 25%;
  width: 384px;
  height: 384px;
  background: rgba(255, 255, 255, 0.05);
}

// ==================== 右侧区域 ====================
.right {
  @include flex-center;
  padding: $spacing-xl;
  background: $login-right-bg;
}

.form-wrapper {
  width: 100%;
  max-width: 420px;
}

.mobile-brand {
  display: none;
}

.header {
  text-align: center;
  margin-bottom: 40px;

  h1 {
    font-size: $font-3xl;
    font-weight: $font-bold;
    letter-spacing: -0.5px;
    margin-bottom: $spacing-sm;
    color: $login-text;
  }

  p {
    color: $text-secondary;
    font-size: $font-sm;
  }
}

// ==================== 表单样式 ====================
.login-form {
  margin-top: 0;

  :deep(.el-form-item) {
    margin-bottom: 20px;
  }

  :deep(.el-input__wrapper) {
    background: $login-input-bg;
    box-shadow: 0 0 0 1px $login-input-border inset;
    transition: box-shadow $transition-fast;

    &:hover {
      box-shadow: 0 0 0 1px var(--cp-primary) inset;
    }

    &.is-focus {
      box-shadow: 0 0 0 1px var(--cp-primary) inset !important;
    }
  }

  :deep(.el-input__inner) {
    color: $login-text;

    &::placeholder {
      color: $text-tertiary;
    }
  }
}

.eye-icon {
  cursor: pointer;
  font-size: $font-lg;
  transition: color $transition-fast;

  &:hover {
    color: var(--cp-primary);
  }
}

.options {
  @include flex-between;
  margin-bottom: $spacing-lg;

  :deep(.el-checkbox__label) {
    color: $login-text;
  }
}

.submit-btn {
  width: 100%;
  height: 48px;
  font-size: $font-base;
  font-weight: $font-medium;
}

.signup-link {
  text-align: center;
  font-size: $font-sm;
  color: $text-secondary;
  margin-top: $spacing-lg;
}

// ==================== 响应式设计 ====================
@include mobile {
  .page {
    grid-template-columns: 1fr;
  }

  .left {
    display: none;
  }

  .mobile-brand {
    @include flex-center;
    gap: $spacing-sm;
    font-size: $font-lg;
    font-weight: $font-semibold;
    margin-bottom: $spacing-2xl;
    color: var(--cp-primary);

    .brand-icon {
      background: var(--cp-primary-light);
    }
  }
}

// ==================== 暗色模式 ====================
@include dark-mode {
  .right {
    background: $dark-bg;
  }

  .header {
    h1 {
      color: $dark-text;
    }

    p {
      color: $dark-text-secondary;
    }
  }

  .login-form {
    :deep(.el-input__wrapper) {
      background: $dark-bg-elevated;
      box-shadow: 0 0 0 1px $dark-border inset;
    }

    :deep(.el-input__inner) {
      color: $dark-text;
    }
  }

  .options {
    :deep(.el-checkbox__label) {
      color: $dark-text;
    }
  }

  .signup-link {
    color: $dark-text-secondary;
  }
}
</style>
