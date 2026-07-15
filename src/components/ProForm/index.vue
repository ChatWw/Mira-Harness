<template>
  <div class="pro-form">
    <el-steps v-if="steps && steps.length > 0" :active="currentStep" align-center class="form-steps">
      <el-step
        v-for="(step, index) in steps"
        :key="index"
        :title="step.title"
        :description="step.description"
      />
    </el-steps>

    <el-form
      ref="formRef"
      :model="model"
      :rules="mergedRules"
      :label-width="labelWidth"
      :label-position="labelPosition"
      :disabled="disabled"
      :inline="layout === 'inline'"
      class="pro-form-content"
    >
      <el-row :gutter="16">
        <el-col
          v-for="field in displayFields"
          :key="field.prop"
          :span="field.colSpan || colSpan"
        >
          <el-form-item :label="field.label" :prop="field.prop">
            <template v-if="field.type === 'slot'">
              <slot :name="field.prop" :model="model" :field="field" />
            </template>

            <template v-else-if="field.type === 'select'">
              <el-select
                v-model="model[field.prop]"
                :placeholder="field.placeholder || `请选择${field.label}`"
                :disabled="getDisabled(field)"
                clearable
                style="width: 100%"
                @change="val => field.onChange?.(val, model)"
              >
                <el-option
                  v-for="opt in getOptions(field)"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                  :disabled="opt.disabled"
                />
              </el-select>
            </template>

            <template v-else-if="field.type === 'radio'">
              <el-radio-group
                v-model="model[field.prop]"
                :disabled="getDisabled(field)"
                @change="val => field.onChange?.(val, model)"
              >
                <el-radio
                  v-for="opt in getOptions(field)"
                  :key="opt.value"
                  :label="opt.value"
                  :disabled="opt.disabled"
                >
                  {{ opt.label }}
                </el-radio>
              </el-radio-group>
            </template>

            <template v-else-if="field.type === 'checkbox'">
              <el-checkbox-group
                v-model="model[field.prop]"
                :disabled="getDisabled(field)"
                @change="val => field.onChange?.(val, model)"
              >
                <el-checkbox
                  v-for="opt in getOptions(field)"
                  :key="opt.value"
                  :label="opt.value"
                  :disabled="opt.disabled"
                >
                  {{ opt.label }}
                </el-checkbox>
              </el-checkbox-group>
            </template>

            <template v-else-if="field.type === 'switch'">
              <el-switch
                v-model="model[field.prop]"
                :disabled="getDisabled(field)"
                @change="val => field.onChange?.(val, model)"
              />
            </template>

            <FieldRenderer
              v-else
              v-model="model[field.prop]"
              :field="field"
              :model="model"
              @change="val => field.onChange?.(val, model)"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item v-if="!readonly && (submitText !== false || resetText !== false)" class="form-actions">
        <template v-if="steps && steps.length > 0">
          <el-button v-if="currentStep > 0" @click="prevStep">上一步</el-button>
          <el-button v-if="currentStep < steps.length - 1" type="primary" @click="nextStep">
            下一步
          </el-button>
          <el-button v-else type="primary" @click="handleSubmit">
            {{ submitText || '提交' }}
          </el-button>
        </template>
        <template v-else>
          <el-button v-if="submitText !== false" type="primary" @click="handleSubmit">
            {{ submitText || '提交' }}
          </el-button>
          <el-button v-if="resetText !== false" @click="handleReset">
            {{ resetText || '重置' }}
          </el-button>
        </template>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts" generic="T extends Record<string, any>">
import { ref, computed, watch, nextTick } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import FieldRenderer from './components/FieldRenderer.vue'
import type { ProFormField, ProFormStep } from './types'

interface Props {
  schema: ProFormField[]
  model: T
  layout?: 'horizontal' | 'vertical' | 'inline'
  labelWidth?: string | number
  labelPosition?: 'left' | 'right' | 'top'
  colSpan?: number
  disabled?: boolean
  readonly?: boolean
  submitText?: string | false
  resetText?: string | false
  rules?: FormRules
  steps?: ProFormStep[]
}

const props = withDefaults(defineProps<Props>(), {
  layout: 'horizontal',
  labelWidth: 'auto',
  labelPosition: 'right',
  colSpan: 24,
  disabled: false,
  readonly: false,
})

const emit = defineEmits<{
  submit: [data: T]
  reset: []
}>()

const formRef = ref<FormInstance>()
const currentStep = ref(0)

// 初始化默认值
watch(() => props.schema, (schema) => {
  schema.forEach(field => {
    if (field.defaultValue !== undefined && props.model[field.prop] === undefined) {
      props.model[field.prop] = field.defaultValue
    }
  })
}, { immediate: true })

// 当前显示的字段
const displayFields = computed(() => {
  let fields = props.schema

  // 分步表单
  if (props.steps && props.steps.length > 0) {
    const currentStepFields = props.steps[currentStep.value]?.fields || []
    fields = fields.filter(f => currentStepFields.includes(f.prop))
  }

  // 显隐联动
  return fields.filter(f => !f.show || f.show(props.model))
})

// 合并规则
const mergedRules = computed(() => {
  const rules: FormRules = { ...props.rules }

  props.schema.forEach(field => {
    if (field.required || field.rules) {
      const fieldRules = []

      if (field.required) {
        fieldRules.push({
          required: true,
          message: `请输入${field.label}`,
          trigger: ['blur', 'change'],
        })
      }

      if (field.rules) {
        fieldRules.push(...field.rules)
      }

      if (fieldRules.length > 0) {
        rules[field.prop] = fieldRules
      }
    }
  })

  return rules
})

// 获取禁用状态
function getDisabled(field: ProFormField): boolean {
  if (typeof field.disabled === 'function') {
    return field.disabled(props.model)
  }
  return field.disabled || false
}

// 获取选项
function getOptions(field: ProFormField) {
  if (typeof field.options === 'function') {
    return field.options(props.model)
  }
  return field.options || []
}

// 验证
async function validate(): Promise<boolean> {
  if (!formRef.value) return false
  try {
    await formRef.value.validate()
    return true
  } catch {
    return false
  }
}

// 重置
function resetFields() {
  formRef.value?.resetFields()
}

// 滚动到字段
function scrollToField(prop: string) {
  formRef.value?.scrollToField(prop)
}

// 获取表单数据
function getFormData() {
  return { ...props.model }
}

// 提交
async function handleSubmit() {
  const valid = await validate()
  if (valid) {
    emit('submit', getFormData())
  }
}

// 重置
function handleReset() {
  resetFields()
  emit('reset')
}

// 下一步
async function nextStep() {
  const valid = await validate()
  if (valid && currentStep.value < (props.steps?.length || 0) - 1) {
    currentStep.value++
    await nextTick()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

// 上一步
function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--
    nextTick(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }
}

defineExpose({
  validate,
  resetFields,
  scrollToField,
  getFormData,
})
</script>

<style scoped lang="scss">
.pro-form {
  background: var(--cp-bg);
  border-radius: $radius-md;
  padding: $spacing-lg;

  .form-steps {
    margin-bottom: $spacing-2xl;
  }

  .form-actions {
    margin-top: $spacing-xl;
    text-align: center;

    :deep(.el-form-item__content) {
      justify-content: center;
    }
  }
}
</style>
