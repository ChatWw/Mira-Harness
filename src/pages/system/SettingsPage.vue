<template>
  <PageContainer title="系统设置">
    <el-card shadow="never">
      <el-tabs v-model="activeTab" @tab-change="handleTabChange">
        <!-- Tab 1: 系统参数 -->
        <el-tab-pane label="系统参数" name="system">
          <el-form :model="formData" label-width="120px">
            <el-form-item label="系统名称">
              <el-input v-model="formData.system.name" placeholder="请输入系统名称" />
            </el-form-item>
            <el-form-item label="Logo 地址">
              <el-input v-model="formData.system.logo" placeholder="请输入 Logo 地址">
                <template #append>
                  <el-button :icon="Upload">上传</el-button>
                </template>
              </el-input>
            </el-form-item>
            <el-form-item label="版权信息">
              <el-input v-model="formData.system.copyright" placeholder="请输入版权信息" />
            </el-form-item>
            <el-form-item label="备案号">
              <el-input v-model="formData.system.icp" placeholder="请输入备案号" />
            </el-form-item>
            <el-form-item label="默认首页">
              <el-select v-model="formData.system.defaultHome" placeholder="请选择默认首页">
                <el-option label="工作台" value="/dashboard" />
                <el-option label="用户管理" value="/system/users" />
                <el-option label="角色管理" value="/system/roles" />
              </el-select>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- Tab 2: 通用配置 -->
        <el-tab-pane label="通用配置" name="general">
          <el-form :model="formData" label-width="140px">
            <el-form-item label="默认分页大小">
              <el-select v-model="formData.general.pageSize" placeholder="请选择分页大小">
                <el-option :label="10" :value="10" />
                <el-option :label="20" :value="20" />
                <el-option :label="50" :value="50" />
                <el-option :label="100" :value="100" />
              </el-select>
            </el-form-item>
            <el-form-item label="Token 过期时间">
              <el-input-number
                v-model="formData.general.tokenExpire"
                :min="1"
                :max="720"
                controls-position="right"
              />
              <span style="margin-left: 8px; color: var(--cp-text-secondary)">小时</span>
            </el-form-item>
            <el-form-item label="验证码开关">
              <el-switch v-model="formData.general.captchaEnabled" />
            </el-form-item>
            <el-form-item label="记住我默认">
              <el-switch v-model="formData.general.rememberMe" />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- Tab 3: 安全策略 -->
        <el-tab-pane label="安全策略" name="security">
          <el-form :model="formData" label-width="140px">
            <el-form-item label="密码最小长度">
              <el-input-number
                v-model="formData.security.passwordMinLength"
                :min="6"
                :max="20"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item label="密码复杂度">
              <el-checkbox-group v-model="formData.security.passwordComplexity">
                <el-checkbox label="uppercase">包含大写字母</el-checkbox>
                <el-checkbox label="lowercase">包含小写字母</el-checkbox>
                <el-checkbox label="number">包含数字</el-checkbox>
                <el-checkbox label="special">包含特殊字符</el-checkbox>
              </el-checkbox-group>
            </el-form-item>
            <el-form-item label="登录失败锁定次数">
              <el-input-number
                v-model="formData.security.loginFailLimit"
                :min="3"
                :max="10"
                controls-position="right"
              />
              <span style="margin-left: 8px; color: var(--cp-text-secondary)">次</span>
            </el-form-item>
            <el-form-item label="锁定时长">
              <el-input-number
                v-model="formData.security.lockDuration"
                :min="5"
                :max="120"
                controls-position="right"
              />
              <span style="margin-left: 8px; color: var(--cp-text-secondary)">分钟</span>
            </el-form-item>
            <el-form-item label="账号有效期">
              <el-input-number
                v-model="formData.security.accountExpireDays"
                :min="0"
                :max="3650"
                controls-position="right"
              />
              <span style="margin-left: 8px; color: var(--cp-text-secondary)">天（0表示永久）</span>
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>

      <!-- 底部保存按钮 -->
      <div class="footer-actions">
        <el-button type="primary" :loading="saving" @click="handleSave">
          保存设置
        </el-button>
        <el-button @click="handleReset">重置</el-button>
      </div>
    </el-card>
  </PageContainer>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { Upload } from '@element-plus/icons-vue'
import PageContainer from '@/components/PageContainer/index.vue'

const activeTab = ref('system')
const saving = ref(false)

// 表单数据（使用 reactive 统一管理所有 Tab 的数据）
const formData = reactive({
  system: {
    name: '中台基座',
    logo: '/logo.png',
    copyright: '中台基座',
    icp: '',
    defaultHome: '/dashboard',
  },
  general: {
    pageSize: 20,
    tokenExpire: 24,
    captchaEnabled: true,
    rememberMe: true,
  },
  security: {
    passwordMinLength: 8,
    passwordComplexity: ['uppercase', 'lowercase', 'number'],
    loginFailLimit: 5,
    lockDuration: 30,
    accountExpireDays: 0,
  },
})

// 备份原始数据用于重置
const originalData = JSON.parse(JSON.stringify(formData))

// Tab 切换
function handleTabChange(tabName: string) {
  console.log('切换到：', tabName)
}

// 保存设置
async function handleSave() {
  saving.value = true
  try {
    // TODO: 调用保存 API
    await new Promise(resolve => setTimeout(resolve, 1000))

    ElMessage.success('保存成功')

    // 更新备份数据
    Object.assign(originalData, JSON.parse(JSON.stringify(formData)))
  } catch (error: any) {
    ElMessage.error(error.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// 重置
function handleReset() {
  Object.assign(formData, JSON.parse(JSON.stringify(originalData)))
  ElMessage.info('已重置为上次保存的配置')
}
</script>

<style scoped lang="scss">
:deep(.el-tabs) {
  .el-tabs__header {
    margin-bottom: $spacing-xl;
  }

  .el-tabs__item {
    font-size: $font-base;
    color: var(--cp-text-secondary);

    &.is-active {
      color: var(--cp-primary);
      font-weight: $font-semibold;
    }

    &:hover {
      color: var(--cp-primary);
    }
  }

  .el-tabs__active-bar {
    background-color: var(--cp-primary);
  }
}

:deep(.el-form) {
  max-width: 600px;

  .el-form-item__label {
    color: var(--cp-text);
  }

  .el-input,
  .el-select {
    width: 100%;
  }

  .el-checkbox-group {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;

    .el-checkbox {
      margin-right: 0;
    }
  }
}

.footer-actions {
  margin-top: $spacing-2xl;
  padding-top: $spacing-lg;
  border-top: 1px solid var(--cp-border);
  display: flex;
  gap: $spacing-sm;
}
</style>
