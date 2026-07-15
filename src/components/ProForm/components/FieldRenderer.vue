<template>
  <component
    :is="componentType"
    v-bind="componentProps"
    :model-value="modelValue"
    @update:model-value="handleChange"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ProFormField } from '../types'

interface Props {
  field: ProFormField
  modelValue: any
  model: Record<string, any>
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: any]
  change: [value: any]
}>()

const isDisabled = computed(() => {
  if (typeof props.field.disabled === 'function') {
    return props.field.disabled(props.model)
  }
  return props.field.disabled || false
})

const fieldOptions = computed(() => {
  if (typeof props.field.options === 'function') {
    return props.field.options(props.model)
  }
  return props.field.options || []
})

const componentType = computed(() => {
  const typeMap: Record<string, string> = {
    input: 'el-input',
    textarea: 'el-input',
    number: 'el-input-number',
    select: 'el-select',
    radio: 'el-radio-group',
    checkbox: 'el-checkbox-group',
    switch: 'el-switch',
    date: 'el-date-picker',
    daterange: 'el-date-picker',
    datetime: 'el-date-picker',
    time: 'el-time-picker',
    cascader: 'el-cascader',
  }
  return typeMap[props.field.type] || 'el-input'
})

const componentProps = computed(() => {
  const base: Record<string, any> = {
    placeholder: props.field.placeholder || `请输入${props.field.label}`,
    disabled: isDisabled.value,
    clearable: true,
    ...props.field.props,
  }

  switch (props.field.type) {
    case 'textarea':
      return { ...base, type: 'textarea', rows: 3 }
    case 'number':
      return { ...base, controlsPosition: 'right' }
    case 'daterange':
      return { ...base, type: 'daterange', rangeSeparator: '至', startPlaceholder: '开始日期', endPlaceholder: '结束日期' }
    case 'datetime':
      return { ...base, type: 'datetime' }
    default:
      return base
  }
})

function handleChange(value: any) {
  emit('update:modelValue', value)
  emit('change', value)
  props.field.onChange?.(value, props.model)
}
</script>
