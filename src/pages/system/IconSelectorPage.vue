<template>
  <PageContainer title="图标选择器" description="浏览图标、选择后预览，并复制可直接使用的代码。" max-width="1600">
    <section class="picker-demo panel">
      <div class="section-heading">
        <div>
          <h3>图标选择器组件</h3>
          <p>选择后即时更新预览；首版仅用于演示与复制代码。</p>
        </div>
      </div>
      <div class="picker-demo__content">
        <div class="selected-preview" aria-label="当前选择的图标预览">
          <AppIcon v-if="selectedDemoItem" :name="selectedDemoItem.value" :size="34" />
        </div>
        <div class="picker-demo__control">
          <span class="control-label">当前图标</span>
          <IconPicker v-model="selectedIcon" :items="pickerItems" :libraries="pickerLibraries" @select="copyIconName" @library-change="loadLibraryItems" />
        </div>
      </div>
    </section>

    <section class="usage-example panel">
      <div class="section-heading"><div><h3>使用图标示例</h3><p>复制图标名称后，直接粘贴到 <code>AppIcon</code> 的 <code>name</code> 属性即可使用。</p></div></div>
      <div class="usage-example__content">
        <div v-for="item in usageExamples" :key="item.name" class="usage-example__item">
          <AppIcon :name="item.name" :size="28" />
          <div><strong>{{ item.label }}</strong><code>{{ `<AppIcon name="${item.name}" />` }}</code></div>
        </div>
      </div>
    </section>

    <section class="icon-library panel">
      <div class="section-heading">
        <div>
          <h3>图标库（Element Plus）</h3>
          <p>与 Element Plus 图标库相同的浏览方式，点击图标即可选择。</p>
        </div>
        <el-input v-model="elementKeyword" class="library-search" clearable placeholder="搜索 Element Plus 图标"><template #prefix><AppIcon name="Search" /></template></el-input>
      </div>
      <IconGrid v-model="selectedElementIcon" :items="filteredElementItems" @select="copyIconName" />
      <div class="style-tools">
        <el-tooltip content="复制代码"><el-button text aria-label="复制 Element Plus 使用代码" @click="copyCode('element')"><AppIcon name="CopyDocument" /></el-button></el-tooltip>
        <el-tooltip content="查看源代码"><el-button text aria-label="查看 Element Plus 使用代码" @click="openSource('element')"><AppIcon name="View" /></el-button></el-tooltip>
      </div>
    </section>

    <section class="icon-library panel">
      <div class="section-heading iconify-heading">
        <div>
          <h3>图标库（Iconify）</h3>
          <p>离线提供 Lucide、Material Symbols 和 Tabler 三套常用图标库。</p>
        </div>
        <el-input v-model="iconifyKeyword" class="library-search" clearable placeholder="搜索当前图标库"><template #prefix><AppIcon name="Search" /></template></el-input>
      </div>
      <el-tabs v-model="activeIconifyLibrary" class="iconify-tabs">
        <el-tab-pane v-for="library in iconifyLibraries" :key="library.value" :label="library.label" :name="library.value" />
      </el-tabs>
      <div v-loading="loadingIconifyLibrary"><IconGrid v-model="selectedIconifyIcon" :items="filteredIconifyItems" @select="copyIconName" /></div>
      <div class="style-tools">
        <el-tooltip content="复制代码"><el-button text aria-label="复制 Iconify 使用代码" @click="copyCode('iconify')"><AppIcon name="CopyDocument" /></el-button></el-tooltip>
        <el-tooltip content="查看源代码"><el-button text aria-label="查看 Iconify 使用代码" @click="openSource('iconify')"><AppIcon name="View" /></el-button></el-tooltip>
      </div>
    </section>

    <el-drawer v-model="sourceVisible" :title="`${sourceLibrary === 'element' ? 'Element Plus' : 'Iconify'} 使用代码`" size="min(560px, 100%)">
      <div class="source-section">
        <pre><code>{{ sourceCode }}</code></pre>
      </div>
    </el-drawer>
  </PageContainer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import PageContainer from '@/components/PageContainer/index.vue'
import IconPicker from '@/components/IconPicker/index.vue'
import IconGrid from '@/components/IconPicker/IconGrid.vue'
import { iconifyLibraries, loadIconifyLibrary } from '@/components/AppIcon/iconify'
import type { IconPickerItem } from '@/components/IconPicker/types'

const elementKeyword = ref('')
const iconifyKeyword = ref('')
const activeIconifyLibrary = ref('lucide')
const selectedIcon = ref('Pointer')
const selectedElementIcon = ref('Pointer')
const selectedIconifyIcon = ref('lucide:mouse-pointer-2')
const sourceVisible = ref(false)
const sourceLibrary = ref<'element' | 'iconify'>('element')
const loadingIconifyLibrary = ref(false)

const elementItems: IconPickerItem[] = Object.entries(ElementPlusIconsVue)
  .map(([label]) => ({ label, value: label, type: 'element' as const }))
  .sort((left, right) => left.label.localeCompare(right.label))

const pickerLibraries = [
  { value: 'element', label: 'Element Plus' },
  ...iconifyLibraries.map(({ value, label }) => ({ value, label })),
]
const iconifyItemsByLibrary = ref<Record<string, IconPickerItem[]>>({})
const usageExamples = [
  { label: 'Element Plus', name: 'Pointer' },
  { label: 'Iconify · Lucide', name: 'lucide:mouse-pointer-2' },
]

const pickerItems = computed(() => [...elementItems, ...Object.values(iconifyItemsByLibrary.value).flat()])
const selectedDemoItem = computed(() => pickerItems.value.find(item => item.value === selectedIcon.value))
const filteredElementItems = computed(() => filterItems(elementItems, elementKeyword.value))
const filteredIconifyItems = computed(() => filterItems(iconifyItemsByLibrary.value[activeIconifyLibrary.value] || [], iconifyKeyword.value))
const sourceCode = computed(() => sourceLibrary.value === 'element' ? elementCode(selectedElementIcon.value) : iconifyCode(selectedIconifyIcon.value))

watch(activeIconifyLibrary, async () => {
  iconifyKeyword.value = ''
  await loadLibraryItems(activeIconifyLibrary.value)
  const firstItem = iconifyItemsByLibrary.value[activeIconifyLibrary.value]?.[0]
  if (!selectedIconifyIcon.value.startsWith(`${activeIconifyLibrary.value}:`) && firstItem) selectedIconifyIcon.value = firstItem.value
})

watch(selectedElementIcon, value => { selectedIcon.value = value })
watch(selectedIconifyIcon, value => { selectedIcon.value = value })

void loadLibraryItems('lucide')

async function loadLibraryItems(libraryName: string) {
  if (iconifyItemsByLibrary.value[libraryName]) return
  loadingIconifyLibrary.value = true
  try {
    const collection = await loadIconifyLibrary(`${libraryName}:`)
    if (!collection) return
    iconifyItemsByLibrary.value = {
      ...iconifyItemsByLibrary.value,
      [libraryName]: Object.keys(collection.icons)
        .map(name => ({ label: name, value: `${libraryName}:${name}`, type: 'iconify' as const }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    }
  } finally {
    loadingIconifyLibrary.value = false
  }
}

function filterItems(items: IconPickerItem[], keyword: string) {
  const normalizedKeyword = keyword.trim().toLowerCase()
  const filtered = normalizedKeyword ? items.filter(item => `${item.label} ${item.value}`.toLowerCase().includes(normalizedKeyword)) : items
  return filtered
}

function elementCode(name: string) {
  return `<AppIcon name="${name}" />`
}

function iconifyCode(icon: string) {
  return `<AppIcon name="${icon}" />`
}

function openSource(library: 'element' | 'iconify') {
  sourceLibrary.value = library
  sourceVisible.value = true
}

async function copyCode(library: 'element' | 'iconify') {
  const code = library === 'element' ? elementCode(selectedElementIcon.value) : iconifyCode(selectedIconifyIcon.value)
  const copied = await copyText(code)
  if (copied) ElMessage.success('使用代码已复制')
  else ElMessage.error('复制失败，请在源代码面板中手动复制')
}

async function copyIconName(name: string) {
  const copied = await copyText(name)
  if (copied) ElMessage.success('图标名称已复制')
  else ElMessage.error('复制失败，请手动复制图标名称')
}

async function copyText(text: string) {
  let copied = false
  try {
    await navigator.clipboard.writeText(text)
    copied = true
  } catch {
    const input = document.createElement('textarea')
    input.value = text
    input.style.position = 'fixed'
    input.style.opacity = '0'
    document.body.appendChild(input)
    input.select()
    copied = document.execCommand('copy')
    input.remove()
  }
  return copied
}
</script>

<style scoped lang="scss">
.panel { overflow: hidden; border: 1px solid var(--cp-border); border-radius: $radius-lg; background: var(--cp-bg-elevated); }.panel + .panel { margin-top: $spacing-lg; }.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: $spacing-lg; padding: $spacing-lg; border-bottom: 1px solid var(--cp-border); }.section-heading h3 { margin: 0 0 $spacing-xs; color: var(--cp-text); font-size: $font-base; }.section-heading p { margin: 0; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.6; }.library-search { width: min(100%, 320px); flex: 0 1 320px; }.picker-demo__content, .usage-example__content { display: flex; align-items: center; gap: $spacing-lg; padding: $spacing-xl; }.usage-example__content { align-items: stretch; }.usage-example__item { display: flex; min-width: 0; flex: 1; align-items: center; gap: $spacing-md; padding: $spacing-md; border: 1px solid var(--cp-border); border-radius: $radius-md; color: var(--cp-primary); background: var(--cp-primary-lighter); }.usage-example__item div { min-width: 0; color: var(--cp-text); }.usage-example__item strong, .usage-example__item code { display: block; }.usage-example__item code { margin-top: $spacing-xs; overflow: hidden; color: var(--cp-text-secondary); font-size: $font-xs; text-overflow: ellipsis; white-space: nowrap; }.selected-preview { display: grid; width: 72px; height: 72px; flex: 0 0 auto; place-items: center; border: 1px solid var(--cp-border); border-radius: $radius-md; color: var(--cp-primary); background: var(--cp-primary-lighter); }.picker-demo__control { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: $spacing-xs; }.control-label { color: var(--cp-text-secondary); font-size: $font-sm; }.iconify-tabs { padding: 0 $spacing-lg; }.style-tools { display: flex; justify-content: flex-end; gap: $spacing-xs; padding: $spacing-xs $spacing-sm; border-top: 1px solid var(--cp-border); }.source-section pre { margin: 0; padding: $spacing-md; overflow: auto; border: 1px solid var(--cp-border); border-radius: $radius-md; color: var(--cp-text); background: var(--cp-bg-hover); font-size: $font-xs; line-height: 1.65; }
@include media-max($breakpoint-lg) { .section-heading { flex-direction: column; }.library-search { width: 100%; flex-basis: auto; } }
@include media-max($breakpoint-sm) { .picker-demo__content, .usage-example__content { align-items: flex-start; flex-direction: column; }.usage-example__item, .picker-demo__control { width: 100%; }.iconify-tabs { padding: 0 $spacing-md; } }
</style>
