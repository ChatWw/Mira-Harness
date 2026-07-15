你是一个 Vue 3 + TypeScript 专家。请帮我实现两个核心业务组件：ProTable 和 ProForm。

## 项目背景

技术栈：Vue 3.5 (Composition API) + TypeScript 5.7 + Vite 6.0 + Element Plus 2.14 + Pinia 3.0 + SCSS
路径别名：@ → src/
SCSS 变量和 mixins 已全局注入（$spacing-* / $font-* / $radius-* / $shadow-* / $transition-* / $breakpoint-* / @include flex-center 等）
CSS 变量已定义（var(--cp-primary) / var(--cp-bg) / var(--cp-text) / var(--cp-border) / var(--cp-success) / var(--cp-danger) 等）

## 全局样式约束

**所有样式必须使用 CSS 变量 `var(--cp-*)` 或 SCSS 变量 `$*`，严禁写死颜色值（hex/rgb/颜色名）。**
新增语义色必须在 `:root` 和 `[data-theme='dark']` 中同时定义。

## 任务 1：ProTable 组件

创建 `src/components/ProTable/` 目录：

### 文件结构
```
src/components/ProTable/
├── index.vue          主组件
├── types.ts           类型定义
└── components/
    ├── SearchForm.vue  搜索表单
    └── Pagination.vue  分页
```

### types.ts

```typescript
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
```

### index.vue 功能要求

1. **数据加载**：支持 request 函数（异步加载 + 分页）和 data 数组（静态数据）
2. **搜索表单**：从 search.fields 或 columns 中 searchable 字段自动生成，支持展开/折叠
3. **表格**：基于 el-table，支持列配置、固定列、排序、自定义插槽
4. **分页**：基于 el-pagination，支持 pageSize 选择和跳转
5. **选择**：支持单选/多选，选中行通过 v-model 或 emit 传出
6. **工具栏**：标题 + 刷新按钮 + 密度切换(紧凑40px/默认52px/宽松64px) + 列设置(下拉面板勾选显隐) + 自定义按钮
7. **操作列**：根据 actions 函数生成按钮，支持 confirmText 确认框，支持 show/disabled 条件
8. **插槽**：`#{prop}` 单元格自定义渲染（参数 { row, column, value }）、`#toolbar-left`、`#toolbar-right`、`#empty`、`#expand`
9. **密度切换**：通过修改 el-table 的 row-style 或 row-class-name 改变行高
10. **列设置**：使用 el-popover，checkbox 控制列显隐，支持拖拽排序
11. **loading**：支持外部传入和内部自动管理
12. **导出方法**：refresh() 重新加载数据、getSelectedRows() 获取选中行

### SearchForm.vue
- 基于 el-form，响应式布局（colSpan 控制每行字段数）
- 自动生成对应类型的输入控件
- 搜索/重置按钮
- 超过 2 行时折叠/展开

### Pagination.vue
- 基于 el-pagination
- total / page / pageSize
- layout: "total, sizes, prev, pager, next, jumper"

## 任务 2：ProForm 组件

创建 `src/components/ProForm/` 目录：

### 文件结构
```
src/components/ProForm/
├── index.vue          主组件
├── types.ts           类型定义
└── components/
    └── FieldRenderer.vue  单个字段渲染器
```

### types.ts

```typescript
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
```

### index.vue 功能要求

1. **Schema 驱动**：根据 schema 数组自动渲染表单字段
2. **16 种字段类型**：input/textarea/number/select/radio/checkbox/switch/date/daterange/datetime/time/tree-select/cascader/upload/icon-picker/slot
3. **布局**：horizontal/vertical/inline 三种布局，colSpan 控制每行字段数
4. **显隐联动**：show(model) 函数控制字段显示/隐藏
5. **选项联动**：options 支持函数形式，参数为 model，可实现联动
6. **禁用联动**：disabled 支持函数形式
7. **表单校验**：required 自动生成必填规则，rules 传入自定义规则
8. **分步表单**：steps 配置时显示 el-steps，底部上一步/下一步/提交按钮，每步独立校验
9. **暴露方法**：validate() / resetFields() / scrollToField() / getFormData()
10. **插槽**：type='slot' 的字段通过 `#{prop}` 插槽自定义渲染
11. **事件**：@submit(表单数据) / @reset

### FieldRenderer.vue
- 接收 field 配置和 model
- 根据 type 渲染对应的 Element Plus 组件
- 处理 disabled 函数
- 处理 options 函数联动
- 处理 onChange 事件

## 任务 3：组合式函数

### `src/hooks/useTable.ts`

```typescript
export function useTable<T>(apiFn: (params: any) => Promise<any>) {
  const loading = ref(false)
  const dataList = ref<T[]>([])
  const total = ref(0)
  const queryParams = reactive({ page: 1, pageSize: 10 })

  async function loadData() {
    loading.value = true
    try {
      const result = await apiFn(queryParams)
      dataList.value = result.list
      total.value = result.total
    } finally {
      loading.value = false
    }
  }

  function handleSearch() {
    queryParams.page = 1
    loadData()
  }

  function handleReset() {
    Object.keys(queryParams).forEach(key => {
      if (key !== 'page' && key !== 'pageSize') {
        queryParams[key] = undefined
      }
    })
    queryParams.page = 1
    loadData()
  }

  return { loading, dataList, total, queryParams, loadData, handleSearch, handleReset }
}
```

### `src/hooks/useDialog.ts`

```typescript
export function useDialog<T = any>() {
  const visible = ref(false)
  const title = ref('')
  const mode = ref<'create' | 'edit'>('create')
  const editData = ref<T | null>(null)

  function openCreate(titleText = '新增') {
    mode.value = 'create'
    title.value = titleText
    editData.value = null
    visible.value = true
  }

  function openEdit(data: T, titleText = '编辑') {
    mode.value = 'edit'
    title.value = titleText
    editData.value = data
    visible.value = true
  }

  function close() {
    visible.value = false
  }

  return { visible, title, mode, editData, openCreate, openEdit, close }
}
```

## 不要修改的文件

- `src/pages/login/` 和 `src/pages/register/` 下所有文件
- `src/stores/theme.ts` 和 `src/config/theme.ts`
- `src/styles/variables.scss` 和 `src/styles/mixins.scss`

## 验收标准

- [ ] ProTable 组件完整可用：搜索/分页/选择/工具栏/操作列/插槽
- [ ] ProForm 组件完整可用：16 种字段类型/联动/校验/分步
- [ ] useTable 和 useDialog hooks 可用
- [ ] 所有样式使用 CSS 变量
- [ ] TypeScript 类型安全
- [ ] npm run dev 正常启动
