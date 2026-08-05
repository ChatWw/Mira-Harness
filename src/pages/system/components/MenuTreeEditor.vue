<template>
  <div class="menu-tree-editor">
    <div class="editor-toolbar">
      <div>
        <strong>{{ title }}</strong>
        <span>{{ menuCount }} 个节点</span>
      </div>
      <el-button type="primary" :disabled="disabled" @click="openCreate()">
        <el-icon><Plus /></el-icon>
        新增根菜单
      </el-button>
    </div>

    <el-table
      :data="displayMenus"
      row-key="id"
      default-expand-all
      :indent="20"
      :tree-props="{ children: 'children' }"
      empty-text="暂无菜单，可新增第一个菜单"
      class="menu-table"
    >
      <el-table-column label="菜单名称" min-width="220">
        <template #default="{ row }">
          <div class="menu-name-cell">
            <el-icon v-if="row.icon"><component :is="row.icon" /></el-icon>
            <span class="menu-title">{{ row.title }}</span>
            <el-tag v-if="isProtected(row.id)" size="small" effect="plain">内置</el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="118">
        <template #default="{ row }">{{ kindLabel(row) }}</template>
      </el-table-column>
      <el-table-column label="路径 / 目标" min-width="250" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="technical-value">{{ targetSummary(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column v-if="context === 'main'" prop="sort" label="排序" width="76" align="center" />
      <el-table-column v-if="context === 'main'" label="状态" width="138">
        <template #default="{ row }">
          <div class="status-tags">
            <el-tag :type="row.status === 0 ? 'info' : 'success'" size="small" effect="plain">
              {{ row.status === 0 ? '停用' : '启用' }}
            </el-tag>
            <el-tag v-if="row.visible === false" type="info" size="small" effect="plain">隐藏</el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="操作" :width="context === 'microapp' ? 140 : 180">
        <template #default="{ row }">
          <el-space v-if="!isProtected(row.id)">
            <el-button v-if="row.type === 'dir'" link type="primary" :disabled="disabled" @click="openCreate(row.id)">新增子项</el-button>
            <el-button link type="primary" :disabled="disabled" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" :disabled="disabled" @click="removeMenu(row)">删除</el-button>
          </el-space>
          <span v-else class="locked-copy">不可修改</span>
        </template>
      </el-table-column>
    </el-table>

    <el-drawer
      v-model="drawerVisible"
      :title="editingId ? '编辑菜单' : '新增菜单'"
      size="min(560px, 100%)"
      destroy-on-close
      append-to-body
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
        <div class="form-grid">
          <el-form-item label="菜单 ID" prop="id">
            <el-input v-model.trim="form.id" placeholder="例如 reports-center" :disabled="Boolean(editingId)" />
          </el-form-item>
          <el-form-item label="菜单名称" prop="title">
            <el-input v-model.trim="form.title" placeholder="显示在导航中的名称" maxlength="60" show-word-limit />
          </el-form-item>
          <el-form-item label="菜单类型" prop="kind">
            <el-select v-model="form.kind" class="field-control" @change="handleKindChange">
              <el-option v-for="option in kindOptions" :key="option.value" :label="option.label" :value="option.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="父级目录">
            <el-select v-model="form.parentId" clearable placeholder="作为根菜单" class="field-control">
              <el-option v-for="option in parentOptions" :key="option.id" :label="option.label" :value="option.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="图标名称">
            <el-input v-model.trim="form.icon" placeholder="Element Plus 图标，如 Setting" />
          </el-form-item>
          <el-form-item label="排序">
            <el-input-number v-model="form.sort" :min="0" :max="9999" controls-position="right" class="field-control" />
          </el-form-item>
        </div>

        <template v-if="form.kind !== 'dir'">
          <el-form-item label="平台路径" prop="path">
            <el-input v-model.trim="form.path" :placeholder="pathPlaceholder" />
          </el-form-item>

          <el-form-item v-if="form.kind === 'component'" label="内置页面" prop="componentKey">
            <el-select v-model="form.componentKey" class="field-control" placeholder="选择随应用发布的页面">
              <el-option v-for="option in componentOptions" :key="option.value" :label="option.label" :value="option.value" />
            </el-select>
          </el-form-item>

          <template v-if="form.kind === 'iframe'">
            <el-form-item label="网页地址" prop="url">
              <el-input v-model.trim="form.url" placeholder="https://example.com 或 /local/path" />
            </el-form-item>
            <div class="form-grid">
              <el-form-item label="打开方式">
                <el-select v-model="form.iframeProfile" class="field-control">
                  <el-option label="兼容嵌入" value="compatible" />
                  <el-option label="严格嵌入" value="strict" />
                  <el-option label="外部窗口" value="external" />
                </el-select>
              </el-form-item>
              <el-form-item label="加载超时（秒）">
                <el-input-number v-model="form.timeout" :min="1" :max="300" controls-position="right" class="field-control" />
              </el-form-item>
              <el-form-item label="Referrer Policy">
                <el-select v-model="form.referrerPolicy" class="field-control">
                  <el-option v-for="policy in referrerPolicies" :key="policy" :label="policy" :value="policy" />
                </el-select>
              </el-form-item>
            </div>
          </template>

          <el-form-item v-if="form.kind === 'microapp'" label="子应用路径" prop="childPath">
            <el-input v-model.trim="form.childPath" placeholder="例如 #/reports；首页可留空" />
          </el-form-item>
        </template>

        <div class="switch-row">
          <div><strong>启用菜单</strong><span>停用后不参与导航</span></div>
          <el-switch v-model="form.enabled" />
        </div>
        <div class="switch-row">
          <div><strong>显示菜单</strong><span>隐藏时保留配置但不展示</span></div>
          <el-switch v-model="form.visible" />
        </div>
      </el-form>

      <template #footer>
        <el-button @click="drawerVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitMenu">保存</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { validateMenus, flattenMenus } from '@/config/platformValidation'
import type { IframeProfile, MenuItem } from '@/types'
import { cloneValue } from '../management'

type MenuKind = 'dir' | 'component' | 'iframe' | 'microapp'

interface MenuDraft {
  id: string
  title: string
  kind: MenuKind
  parentId: string
  icon: string
  sort: number
  path: string
  componentKey: string
  url: string
  iframeProfile: IframeProfile
  referrerPolicy: ReferrerPolicy
  timeout: number
  childPath: string
  enabled: boolean
  visible: boolean
}

interface ComponentOption {
  value: string
  label: string
}

const props = withDefaults(defineProps<{
  menus: MenuItem[]
  title?: string
  context?: 'main' | 'microapp'
  appCode?: string
  componentOptions?: readonly ComponentOption[]
  protectedIds?: readonly string[]
  disabled?: boolean
}>(), {
  title: '菜单结构',
  context: 'main',
  appCode: '',
  componentOptions: () => [],
  protectedIds: () => [],
  disabled: false,
})

const emit = defineEmits<{ change: [menus: MenuItem[]] }>()
const drawerVisible = ref(false)
const submitting = ref(false)
const editingId = ref('')
const formRef = ref<FormInstance>()

function emptyForm(): MenuDraft {
  return {
    id: '', title: '', kind: 'dir', parentId: '', icon: '', sort: 0, path: '', componentKey: '',
    url: '', iframeProfile: 'compatible', referrerPolicy: 'strict-origin-when-cross-origin', timeout: 15,
    childPath: '', enabled: true, visible: true,
  }
}

const form = reactive<MenuDraft>(emptyForm())
const menuCount = computed(() => flattenMenus(props.menus).length)
const displayMenus = computed(() => sortMenus(props.menus))
const protectedSet = computed(() => new Set(props.protectedIds))
const referrerPolicies: ReferrerPolicy[] = [
  'no-referrer', 'origin', 'same-origin', 'strict-origin', 'strict-origin-when-cross-origin', 'unsafe-url',
]
const kindOptions = computed(() => props.context === 'microapp'
  ? [{ value: 'dir', label: '目录' }, { value: 'microapp', label: '微应用页面' }]
  : [{ value: 'dir', label: '目录' }, { value: 'component', label: '内置页面' }, { value: 'iframe', label: 'Iframe / 外链' }]
)
const pathPlaceholder = computed(() => props.context === 'microapp' && props.appCode
  ? `/micro/${props.appCode}/页面路径`
  : '/页面路径'
)

function sortMenus(menus: MenuItem[]): MenuItem[] {
  return [...menus]
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .map(menu => menu.children ? { ...menu, children: sortMenus(menu.children) } : menu)
}

const rules: FormRules<MenuDraft> = {
  id: [{ required: true, message: '请输入菜单 ID', trigger: 'blur' }],
  title: [{ required: true, message: '请输入菜单名称', trigger: 'blur' }],
  kind: [{ required: true, message: '请选择菜单类型', trigger: 'change' }],
  path: [{ required: true, message: '请输入平台路径', trigger: 'blur' }],
  componentKey: [{ required: true, message: '请选择内置页面', trigger: 'change' }],
  url: [{ required: true, message: '请输入网页地址', trigger: 'blur' }],
}

function isProtected(id: string) {
  return protectedSet.value.has(id)
}

function menuKind(menu: MenuItem): MenuKind {
  if (menu.type === 'dir') return 'dir'
  return menu.target?.type || 'component'
}

function kindLabel(menu: MenuItem) {
  return ({ dir: '目录', component: '内置页面', iframe: 'Iframe / 外链', microapp: '微应用页面' } as const)[menuKind(menu)]
}

function targetSummary(menu: MenuItem) {
  if (menu.type === 'dir') return '—'
  if (menu.target?.type === 'iframe') return `${menu.path || ''} → ${menu.target.url}`
  if (menu.target?.type === 'component') return `${menu.path || ''} → ${menu.target.componentKey}`
  if (menu.target?.type === 'microapp') return `${menu.path || ''} → ${menu.target.childPath || '应用首页'}`
  return menu.path || '—'
}

function findParentId(menus: MenuItem[], id: string, parentId = ''): string {
  for (const menu of menus) {
    if (menu.id === id) return parentId
    if (menu.children) {
      const found = findParentId(menu.children, id, menu.id)
      if (found) return found
    }
  }
  return ''
}

function findMenu(menus: MenuItem[], id: string): MenuItem | undefined {
  for (const menu of menus) {
    if (menu.id === id) return menu
    const child = menu.children && findMenu(menu.children, id)
    if (child) return child
  }
}

function getDescendantIds(menu?: MenuItem): Set<string> {
  return new Set(menu?.children ? flattenMenus(menu.children).map(item => item.id) : [])
}

const parentOptions = computed(() => {
  const descendants = getDescendantIds(findMenu(props.menus, editingId.value))
  return flattenMenus(props.menus)
    .filter(menu => menu.type === 'dir' && menu.id !== editingId.value && !descendants.has(menu.id) && !isProtected(menu.id))
    .map(menu => ({ id: menu.id, label: menu.title }))
})

function resetForm(values?: Partial<MenuDraft>) {
  Object.assign(form, emptyForm(), values || {})
}

function openCreate(parentId = '') {
  editingId.value = ''
  resetForm({ parentId, kind: props.context === 'microapp' ? 'microapp' : 'dir' })
  drawerVisible.value = true
}

function openEdit(menu: MenuItem) {
  editingId.value = menu.id
  resetForm({
    id: menu.id,
    title: menu.title,
    kind: menuKind(menu),
    parentId: findParentId(props.menus, menu.id),
    icon: menu.icon || '',
    sort: menu.sort ?? 0,
    path: menu.path || '',
    componentKey: menu.target?.type === 'component' ? menu.target.componentKey : '',
    url: menu.target?.type === 'iframe' ? menu.target.url : '',
    iframeProfile: menu.target?.type === 'iframe' ? menu.target.iframePolicy?.profile || 'compatible' : 'compatible',
    referrerPolicy: menu.target?.type === 'iframe' ? menu.target.iframePolicy?.referrerPolicy || 'strict-origin-when-cross-origin' : 'strict-origin-when-cross-origin',
    timeout: menu.target?.type === 'iframe' ? menu.target.iframePolicy?.timeout || 15 : 15,
    childPath: menu.target?.type === 'microapp' ? menu.target.childPath : '',
    enabled: menu.status !== 0,
    visible: menu.visible !== false,
  })
  drawerVisible.value = true
}

function handleKindChange() {
  if (form.kind === 'dir') form.path = ''
  if (form.kind === 'component' && !form.componentKey) form.componentKey = props.componentOptions[0]?.value || ''
  if (form.kind === 'microapp' && !form.path && props.appCode) form.path = `/micro/${props.appCode}`
}

function buildMenu(existing?: MenuItem): MenuItem {
  const base: MenuItem = {
    id: form.id.trim(),
    title: form.title.trim(),
    icon: form.icon.trim() || undefined,
    type: form.kind === 'dir' ? 'dir' : form.kind === 'microapp' ? 'microapp' : 'menu',
    appCode: props.context === 'microapp' ? props.appCode : null,
    sort: form.sort,
    status: form.enabled ? 1 : 0,
    visible: form.visible,
  }
  if (form.kind === 'dir') return { ...base, children: existing?.children || [] }
  if (form.kind === 'component') return { ...base, path: form.path.trim(), target: { type: 'component', componentKey: form.componentKey } }
  if (form.kind === 'iframe') {
    return {
      ...base,
      path: form.path.trim(),
      target: {
        type: 'iframe',
        url: form.url.trim(),
        iframePolicy: { profile: form.iframeProfile, referrerPolicy: form.referrerPolicy, timeout: form.timeout },
      },
    }
  }
  return { ...base, path: form.path.trim(), target: { type: 'microapp', childPath: form.childPath.trim() } }
}

function removeNode(menus: MenuItem[], id: string): MenuItem[] {
  return menus
    .filter(menu => menu.id !== id)
    .map(menu => menu.children ? { ...menu, children: removeNode(menu.children, id) } : menu)
}

function insertNode(menus: MenuItem[], parentId: string, node: MenuItem): MenuItem[] {
  if (!parentId) return [...menus, node]
  return menus.map(menu => menu.id === parentId
    ? { ...menu, children: [...(menu.children || []), node] }
    : menu.children ? { ...menu, children: insertNode(menu.children, parentId, node) } : menu
  )
}

async function submitMenu() {
  if (!formRef.value || !(await formRef.value.validate().catch(() => false))) return
  const existing = editingId.value ? findMenu(props.menus, editingId.value) : undefined
  if (existing?.children?.length && form.kind !== 'dir') {
    ElMessage.warning('包含子菜单的目录不能改为页面，请先处理其子菜单')
    return
  }
  submitting.value = true
  try {
    const withoutCurrent = editingId.value ? removeNode(cloneValue(props.menus), editingId.value) : cloneValue(props.menus)
    const next = insertNode(withoutCurrent, form.parentId, buildMenu(existing))
    validateMenus(next, props.context === 'microapp' ? props.appCode : null)
    emit('change', next)
    drawerVisible.value = false
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '菜单配置无效')
  } finally {
    submitting.value = false
  }
}

async function removeMenu(menu: MenuItem) {
  const childCopy = menu.children?.length ? `，并同时删除其 ${flattenMenus(menu.children).length} 个子菜单` : ''
  try {
    await ElMessageBox.confirm(`确定删除“${menu.title}”${childCopy}吗？`, '删除菜单', { type: 'warning' })
    const next = removeNode(cloneValue(props.menus), menu.id)
    validateMenus(next, props.context === 'microapp' ? props.appCode : null)
    emit('change', next)
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error instanceof Error ? error.message : '删除失败')
  }
}
</script>

<style scoped lang="scss">
.menu-tree-editor { min-width: 0; }
.editor-toolbar {
  @include flex-between;
  gap: $spacing-md;
  padding: $spacing-md;
  border: 1px solid var(--cp-border);
  border-bottom: 0;
  border-radius: $radius-lg $radius-lg 0 0;
  background: var(--cp-bg-elevated);

  > div { min-width: 0; display: flex; align-items: baseline; gap: $spacing-sm; }
  strong { color: var(--cp-text); font-size: $font-base; }
  span { color: var(--cp-text-secondary); font-size: $font-xs; }
}
.menu-table {
  width: 100%;
  border: 1px solid var(--cp-border);
  border-top: 0;
  border-radius: 0 0 $radius-lg $radius-lg;
  overflow: hidden;

  :deep(.el-table__header th) {
    color: var(--cp-text-secondary);
    background: var(--cp-bg-elevated);
  }

  :deep(.el-table__body tr:hover > td) {
    background: color-mix(in srgb, var(--cp-primary) 4%, var(--cp-bg)) !important;
  }

  :deep(.el-table__cell:first-child .cell) {
    display: flex;
    align-items: center;
    min-width: 0;
    white-space: nowrap;
  }

  :deep(.el-table__indent),
  :deep(.el-table__expand-icon) { flex: 0 0 auto; }
}
.menu-name-cell, .status-tags, .row-actions { display: flex; align-items: center; gap: $spacing-sm; min-width: 0; }
.menu-name-cell { flex: 1 1 auto; overflow: hidden; }
.menu-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.technical-value { color: var(--cp-text-secondary); font-size: $font-xs; }
.locked-copy { color: var(--cp-text-tertiary); font-size: $font-xs; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 $spacing-md; }
.field-control { width: 100%; }
.switch-row {
  @include flex-between;
  gap: $spacing-lg;
  padding: $spacing-md 0;
  border-top: 1px solid var(--cp-border-light);

  div { display: flex; flex-direction: column; gap: 2px; }
  strong { color: var(--cp-text); font-size: $font-sm; }
  span { color: var(--cp-text-secondary); font-size: $font-xs; }
}

@include media-max($breakpoint-sm) {
  .editor-toolbar { align-items: flex-start; flex-direction: column; }
  .form-grid { grid-template-columns: 1fr; }
}
</style>
