<template>
  <PageContainer title="微应用管理" description="管理通过 wujie 接入的微前端子应用">
    <ProTable ref="tableRef" :columns="columns" :request="loadData" :search="search" :selection="true" :toolbar="toolbar" row-key="id" @selection-change="handleSelection">
      <template #icon="{ row }"><el-icon :size="20"><component :is="row.icon || 'Grid'" /></el-icon></template>
      <template #strategy="{ row }"><el-tag v-for="tag in strategyTags(row)" :key="tag" size="small" class="tag">{{ tag }}</el-tag></template>
      <template #status="{ row }"><el-tag :type="statusType(row.status)">{{ statusText(row.status) }}</el-tag></template>
      <template #action="{ row }">
        <el-button link type="primary" @click="edit(row)">编辑</el-button>
        <el-button link type="primary" @click="router.push(`/system/microapps/${row.code}/config`)">配置</el-button>
        <el-button link :type="row.status === 'published' ? 'warning' : 'success'" @click="toggleStatus(row)">{{ row.status === 'published' ? '下架' : '上架' }}</el-button>
      </template>
    </ProTable>
    <el-dialog v-model="visible" :title="editing ? '编辑微应用' : '新增微应用'" width="620px" :close-on-click-modal="false">
      <ProForm ref="formRef" :schema="formSchema" :model="form" label-width="100px" />
      <template #footer><el-button @click="visible = false">取消</el-button><el-button type="primary" :loading="saving" @click="save">确定</el-button></template>
    </el-dialog>
  </PageContainer>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import PageContainer from '@/components/PageContainer/index.vue'
import ProTable from '@/components/ProTable/index.vue'
import ProForm from '@/components/ProForm/index.vue'
import { microAppApi } from '@/api/system'
import type { MicroApp } from '@/types'
import type { ProTableColumn, ProTableSearchConfig } from '@/components/ProTable/types'
import type { ProFormField } from '@/components/ProForm/types'

const router = useRouter(); const tableRef = ref(); const formRef = ref(); const visible = ref(false); const saving = ref(false); const editing = ref(false); const selected = ref<MicroApp[]>([])
const form = reactive<any>({})
const columns: ProTableColumn[] = [
  { label: '应用名称', prop: 'name', minWidth: 150 }, { label: '编码', prop: 'code', width: 130 }, { label: '入口 URL', prop: 'url', minWidth: 180 },
  { label: '加载策略', prop: 'strategy', width: 180, slot: 'strategy' }, { label: '版本', prop: 'version', width: 100 }, { label: '状态', prop: 'status', width: 100, slot: 'status' }, { label: '操作', prop: 'action', width: 190, fixed: 'right', slot: 'action' },
]
const search: ProTableSearchConfig = { fields: [
  { label: '应用名称', prop: 'name', type: 'input' }, { label: '应用编码', prop: 'code', type: 'input' },
  { label: '加载模式', prop: 'mode', type: 'select', options: [{ label: '保活', value: 'alive' }, { label: '同步路由', value: 'sync' }, { label: '协程模式', value: 'fiber' }, { label: '降级 iframe', value: 'degrade' }] },
  { label: '状态', prop: 'status', type: 'select', options: [{ label: '开发中', value: 'developing' }, { label: '已上架', value: 'published' }, { label: '已下架', value: 'offline' }] },
] }
const toolbar = computed(() => ({ actions: [{ text: '新增微应用', type: 'primary' as const, click: add }, { text: '批量上架', click: () => batchStatus('published') }, { text: '批量下架', type: 'warning' as const, click: () => batchStatus('offline') }] }))
const formSchema = computed<ProFormField[]>(() => [
  { label: '应用名称', prop: 'name', type: 'input', required: true, rules: [{ required: true, message: '请输入应用名称' }] },
  { label: '应用编码', prop: 'code', type: 'input', required: true, disabled: editing.value, placeholder: '对应 wujie name', rules: [{ required: true, message: '请输入应用编码' }, { pattern: /^[a-z][a-z0-9-]*$/, message: '仅支持小写字母、数字和连字符' }] },
  { label: '入口 URL', prop: 'url', type: 'input', required: true, rules: [{ required: true, message: '请输入入口 URL' }] },
  { label: '图标', prop: 'icon', type: 'input', placeholder: 'Element Plus 图标名' }, { label: '排序', prop: 'sort', type: 'number' },
  { label: '状态', prop: 'status', type: 'select', options: [{ label: '开发中', value: 'developing' }, { label: '已上架', value: 'published' }, { label: '已下架', value: 'offline' }] }, { label: '应用描述', prop: 'description', type: 'textarea' },
])
function loadData(params: any) { return microAppApi.getList(params) }
function strategyTags(row: MicroApp) { const c = row.runtimeConfig; const tags = [c.alive && '保活', c.sync && '同步路由', c.fiber && '协程模式', c.degrade && '降级 iframe'].filter(Boolean); return tags.length ? tags : ['默认'] }
function statusText(s: string) { return ({ developing: '开发中', published: '已上架', offline: '已下架' } as any)[s] }
function statusType(s: string) { return s === 'published' ? 'success' : s === 'offline' ? 'danger' : 'warning' }
function handleSelection(rows: MicroApp[]) { selected.value = rows }
function add() { editing.value = false; Object.assign(form, { name: '', code: '', url: '', icon: 'Grid', sort: 0, status: 'developing', description: '' }); visible.value = true }
function edit(row: MicroApp) { editing.value = true; Object.assign(form, JSON.parse(JSON.stringify(row))); visible.value = true }
async function save() { if (!await formRef.value?.validate()) return; saving.value = true; try { editing.value ? await microAppApi.update(form.code, form) : await microAppApi.create(form); ElMessage.success('保存成功'); visible.value = false; tableRef.value?.refresh() } finally { saving.value = false } }
async function toggleStatus(row: MicroApp) { await microAppApi.update(row.code, { status: row.status === 'published' ? 'offline' : 'published' }); ElMessage.success('状态已更新'); tableRef.value?.refresh() }
async function batchStatus(status: 'published' | 'offline') { await Promise.all(selected.value.map(item => microAppApi.update(item.code, { status }))); ElMessage.success('批量操作完成'); tableRef.value?.refresh() }
</script>
<style scoped lang="scss">.tag { margin-right: 4px; }</style>
