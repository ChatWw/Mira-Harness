import type { FormRules, FormItemRule } from 'element-plus'

export type FieldType =
  | 'input' | 'textarea' | 'number' | 'select' | 'radio' | 'checkbox'
  | 'switch' | 'date' | 'daterange' | 'datetime' | 'time'
  | 'tree-select' | 'cascader' | 'upload' | 'icon-picker' | 'slot'

export interface ProFormField {
  type: FieldType
  prop: string
  label: string
  placeholder?: string
  defaultValue?: any
  required?: boolean
  rules?: FormItemRule[]
  disabled?: boolean | ((model: any) => boolean)
  colSpan?: number
  show?: (model: any) => boolean
  options?: { label: string; value: any; disabled?: boolean }[] | ((model: any) => any[])
  dict?: string
  onChange?: (value: any, model: any) => void
  slot?: string
  props?: Record<string, any>
}

export interface ProFormStep {
  title: string
  description?: string
  fields: string[]
}

export interface ProFormProps<T = any> {
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

export interface ProFormExpose {
  validate: () => Promise<boolean>
  resetFields: () => void
  scrollToField: (prop: string) => void
  getFormData: () => any
}
