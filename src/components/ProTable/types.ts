import type { VNode } from 'vue'

export interface ProTableColumn<T = any> {
  prop: keyof T & string
  label: string
  width?: string | number
  minWidth?: string | number
  fixed?: 'left' | 'right'
  align?: 'left' | 'center' | 'right'
  sortable?: boolean | 'custom'
  formatter?: (row: T, column: any, cellValue: any) => string
  slot?: string
  render?: (row: T) => VNode
  dict?: Record<string, string>
  searchable?: boolean
  searchType?: 'input' | 'select' | 'date' | 'daterange' | 'tree'
  searchOptions?: { label: string; value: any }[]
}

export interface SearchField {
  prop: string
  label: string
  type: 'input' | 'select' | 'date' | 'daterange' | 'tree' | 'cascader'
  options?: { label: string; value: any }[]
  placeholder?: string
  defaultValue?: any
  clearable?: boolean
}

export interface ProTableSearchConfig {
  fields?: SearchField[]
  colSpan?: number
  showExpand?: boolean
  defaultExpanded?: boolean
  searchText?: string
  resetText?: string
}

export interface ActionButton {
  text: string
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'default'
  icon?: string
  click?: (row?: any) => void
  confirmText?: string
  show?: (row?: any) => boolean
  disabled?: (row?: any) => boolean
}

export interface ProTableProps<T = any> {
  data?: T[]
  request?: (params: any) => Promise<any>
  columns: ProTableColumn<T>[]
  search?: ProTableSearchConfig
  pagination?: boolean | { pageSize?: number; layout?: string }
  selection?: boolean | 'single' | 'multiple'
  toolbar?: {
    title?: string
    actions?: ActionButton[]
    showRefresh?: boolean
    showDensity?: boolean
    showColumnToggle?: boolean
  }
  actions?: (row: any) => ActionButton[]
  actionsWidth?: number | string
  actionsFixed?: 'left' | 'right'
  rowKey?: string | ((row: any) => string)
  emptyText?: string
  loading?: boolean
}
