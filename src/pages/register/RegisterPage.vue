<template>
  <div class="register-page">
    <div class="register-container">
      <div class="register-header">
        <h1>注册账号</h1>
        <p>创建您的中台基座账号</p>
      </div>

      <el-form
        ref="registerFormRef"
        :model="registerForm"
        :rules="registerRules"
        label-width="100px"
        class="register-form"
      >
        <el-form-item label="用户名" prop="username">
          <el-input
            v-model="registerForm.username"
            placeholder="4-20个字符，只能包含字母、数字、下划线"
            maxlength="20"
            show-word-limit
          >
            <template #prefix>
              <el-icon><User /></el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="手机号" prop="phone">
          <el-input
            v-model="registerForm.phone"
            placeholder="手机号和邮箱至少填写一个"
            maxlength="11"
          >
            <template #prefix>
              <el-icon><Iphone /></el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="邮箱" prop="email">
          <el-input
            v-model="registerForm.email"
            placeholder="手机号和邮箱至少填写一个"
          >
            <template #prefix>
              <el-icon><Message /></el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="登录密码" prop="password">
          <el-input
            v-model="registerForm.password"
            type="password"
            placeholder="8-20位，可包含字母、数字、特殊字符"
            maxlength="20"
            show-password
          >
            <template #prefix>
              <el-icon><Lock /></el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="registerForm.confirmPassword"
            type="password"
            placeholder="请再次输入密码"
            maxlength="20"
            show-password
          >
            <template #prefix>
              <el-icon><Lock /></el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="验证码" prop="captcha">
          <div class="captcha-row">
            <el-input
              v-model="registerForm.captcha"
              placeholder="请输入验证码"
              maxlength="4"
              style="flex: 1;"
            >
              <template #prefix>
                <el-icon><Picture /></el-icon>
              </template>
            </el-input>
            <Captcha ref="captchaRef" @change="handleCaptchaChange" />
          </div>
        </el-form-item>

        <el-form-item prop="agreement">
          <el-checkbox v-model="registerForm.agreement">
            我已阅读并同意
            <el-link type="primary" :underline="false" @click="showAgreementDialog = true">
              《用户协议》
            </el-link>
          </el-checkbox>
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            @click="onSubmit"
            class="submit-btn"
          >
            {{ loading ? '注册中...' : '立即注册' }}
          </el-button>
        </el-form-item>

        <div class="login-link">
          已有账号？
          <el-link type="primary" :underline="false" @click="$router.push('/login')">
            立即登录
          </el-link>
        </div>
      </el-form>
    </div>

    <!-- 用户协议弹窗 -->
    <el-dialog
      v-model="showAgreementDialog"
      title="用户协议"
      width="700px"
      :close-on-click-modal="false"
    >
      <div class="agreement-content" v-html="agreementHtml"></div>
      <template #footer>
        <el-button @click="showAgreementDialog = false">关闭</el-button>
        <el-button type="primary" @click="handleAgreeAgreement">同意并继续</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { User, Iphone, Message, Lock, Picture } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import Captcha from '@/components/common/Captcha.vue'
import { USER_AGREEMENT } from '@/config/agreement'
import { marked } from 'marked'

const router = useRouter()

const registerFormRef = ref<FormInstance>()
const captchaRef = ref<InstanceType<typeof Captcha>>()
const loading = ref(false)
const showAgreementDialog = ref(false)
const currentCaptchaCode = ref('')

const registerForm = reactive({
  username: '',
  phone: '',
  email: '',
  password: '',
  confirmPassword: '',
  captcha: '',
  agreement: false,
})

// 用户名验证
const validateUsername = (rule: any, value: string, callback: any) => {
  if (!value) {
    callback(new Error('请输入用户名'))
  } else if (value.length < 4 || value.length > 20) {
    callback(new Error('用户名长度为4-20个字符'))
  } else if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    callback(new Error('用户名只能包含字母、数字、下划线'))
  } else {
    callback()
  }
}

// 手机号验证（手机号和邮箱至少填一个）
const validatePhone = (rule: any, value: string, callback: any) => {
  // 如果两者都没填
  if (!value && !registerForm.email) {
    callback(new Error('手机号和邮箱至少填写一个'))
  } else if (value && !/^1[3-9]\d{9}$/.test(value)) {
    callback(new Error('请输入正确的手机号'))
  } else {
    // 如果手机号填写正确，需要清除邮箱的错误提示
    if (registerFormRef.value) {
      registerFormRef.value.clearValidate('email')
    }
    callback()
  }
}

// 邮箱验证（手机号和邮箱至少填一个）
const validateEmail = (rule: any, value: string, callback: any) => {
  // 如果两者都没填
  if (!value && !registerForm.phone) {
    callback(new Error('手机号和邮箱至少填写一个'))
  } else if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    callback(new Error('请输入正确的邮箱'))
  } else {
    // 如果邮箱填写正确，需要清除手机号的错误提示
    if (registerFormRef.value) {
      registerFormRef.value.clearValidate('phone')
    }
    callback()
  }
}

// 密码验证（只要求长度，可以包含字母、数字、特殊字符）
const validatePassword = (rule: any, value: string, callback: any) => {
  if (!value) {
    callback(new Error('请输入密码'))
  } else if (value.length < 8 || value.length > 20) {
    callback(new Error('密码长度为8-20位'))
  } else {
    callback()
  }
}

// 确认密码验证
const validateConfirmPassword = (rule: any, value: string, callback: any) => {
  if (!value) {
    callback(new Error('请再次输入密码'))
  } else if (value !== registerForm.password) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

// 验证码验证
const validateCaptcha = (rule: any, value: string, callback: any) => {
  if (!value) {
    callback(new Error('请输入验证码'))
  } else if (!captchaRef.value?.validate(value)) {
    callback(new Error('验证码错误'))
  } else {
    callback()
  }
}

// 协议验证
const validateAgreement = (rule: any, value: boolean, callback: any) => {
  if (!value) {
    callback(new Error('请先阅读并同意用户协议'))
  } else {
    callback()
  }
}

// 表单验证规则
const registerRules: FormRules = {
  username: [{ validator: validateUsername, trigger: 'blur' }],
  phone: [{ validator: validatePhone, trigger: 'blur' }],
  email: [{ validator: validateEmail, trigger: 'blur' }],
  password: [{ validator: validatePassword, trigger: 'blur' }],
  confirmPassword: [{ validator: validateConfirmPassword, trigger: 'blur' }],
  captcha: [{ validator: validateCaptcha, trigger: 'blur' }],
  agreement: [{ validator: validateAgreement, trigger: 'change' }],
}

// 处理验证码变化
function handleCaptchaChange(code: string) {
  currentCaptchaCode.value = code
}

// 同意协议
function handleAgreeAgreement() {
  registerForm.agreement = true
  showAgreementDialog.value = false
}

// 提交注册
async function onSubmit() {
  if (!registerFormRef.value) return

  try {
    // 表单验证
    await registerFormRef.value.validate()

    loading.value = true

    // 模拟API请求
    await new Promise(resolve => setTimeout(resolve, 1000))

    // 输出表单数据
    console.log('注册数据：', {
      username: registerForm.username,
      phone: registerForm.phone,
      email: registerForm.email,
      password: registerForm.password,
    })

    ElMessage.success('注册成功！即将跳转到登录页...')

    // 延迟跳转
    setTimeout(() => {
      router.push('/login')
    }, 1500)
  } catch (error) {
    console.log('表单验证失败', error)
  } finally {
    loading.value = false
  }
}

// 转换协议文本为HTML
const agreementHtml = computed(() => {
  return marked(USER_AGREEMENT)
})
</script>

<style scoped lang="scss">
// ==================== 页面容器 ====================
.register-page {
  min-height: 100vh;
  @include flex-center;
  background: $bg;
  padding: 40px 20px;
}

.register-container {
  width: 100%;
  max-width: 600px;
  background: $bg-elevated;
  border-radius: $radius-lg;
  padding: 40px;
  box-shadow: $shadow-md;
}

// ==================== 头部 ====================
.register-header {
  text-align: center;
  margin-bottom: 40px;

  h1 {
    font-size: 28px;
    font-weight: $font-bold;
    color: $text;
    margin-bottom: $spacing-sm;
  }

  p {
    font-size: $font-sm;
    color: $text-secondary;
  }
}

// ==================== 表单样式 ====================
.register-form {
  :deep(.el-form-item__label) {
    color: $text;
  }

  :deep(.el-input__wrapper) {
    background: $bg;
  }
}

.captcha-row {
  @include flex-align-center;
  gap: 12px;
  width: 100%;
}

.submit-btn {
  width: 100%;
  height: 44px;
  font-size: $font-base;
}

.login-link {
  text-align: center;
  font-size: $font-sm;
  color: $text-secondary;
  margin-top: 20px;
}

// ==================== 协议弹窗 ====================
.agreement-content {
  max-height: 500px;
  overflow-y: auto;
  padding: 20px;
  background: $bg;
  border-radius: $radius-md;
  color: $text;
  line-height: $line-height-relaxed;
  @include scrollbar;

  :deep(h1) {
    font-size: $font-2xl;
    margin-bottom: 20px;
    color: $text;
  }

  :deep(h2) {
    font-size: $font-lg;
    margin: 20px 0 10px;
    color: $text;
  }

  :deep(p) {
    margin: 10px 0;
  }

  :deep(ul) {
    padding-left: 20px;
  }

  :deep(strong) {
    color: var(--cp-primary);
  }
}

// ==================== 响应式设计 ====================
@include media-max($breakpoint-md) {
  .register-container {
    padding: 30px 20px;
  }

  .register-form {
    :deep(.el-form-item__label) {
      width: 80px !important;
    }
  }
}
</style>
