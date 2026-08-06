import type { Component } from 'vue'

export type IconPickerItem = {
  label: string
  value: string
  type: 'element' | 'iconify'
  component?: Component
}
