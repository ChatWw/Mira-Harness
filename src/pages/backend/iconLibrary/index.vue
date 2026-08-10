<template>
  <SettingsPageShell title="图标库">
    <div class="icon-library-settings">
      <section class="picker-demo" aria-labelledby="icon-picker-heading">
        <div class="section-heading">
          <h2 id="icon-picker-heading">图标选择器</h2>
          <p>选择后即时更新预览，并复制可直接使用的图标名称。</p>
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

      <section class="usage-example" aria-labelledby="usage-example-heading">
        <div class="section-heading">
          <h2 id="usage-example-heading">使用示例</h2>
          <p>复制图标名称后，直接粘贴到 <code>AppIcon</code> 的 <code>name</code> 属性即可使用。</p>
        </div>
        <div class="usage-example__content">
          <div v-for="item in usageExamples" :key="item.name" class="usage-example__item">
            <AppIcon :name="item.name" :size="28" />
            <div><strong>{{ item.label }}</strong><code>{{ `<AppIcon name="${item.name}" />` }}</code></div>
          </div>
        </div>
      </section>

      <section class="icon-library" aria-labelledby="element-library-heading">
        <div class="section-heading section-heading--with-control">
          <div>
            <h2 id="element-library-heading">Element Plus</h2>
            <p>点击图标即可选择并复制名称。</p>
          </div>
          <el-input v-model="elementKeyword" class="library-search" clearable placeholder="搜索 Element Plus 图标"><template #prefix><AppIcon name="Search" /></template></el-input>
        </div>
        <IconGrid v-model="selectedElementIcon" :items="filteredElementItems" @select="copyIconName" />
        <div class="style-tools">
          <el-tooltip content="复制代码"><el-button text aria-label="复制 Element Plus 使用代码" @click="copyCode('element')"><AppIcon name="CopyDocument" /></el-button></el-tooltip>
          <el-tooltip content="查看源代码"><el-button text aria-label="查看 Element Plus 使用代码" @click="openSource('element')"><AppIcon name="View" /></el-button></el-tooltip>
        </div>
      </section>

      <section class="icon-library" aria-labelledby="iconify-library-heading">
        <div class="section-heading section-heading--with-control">
          <div>
            <h2 id="iconify-library-heading">Iconify</h2>
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
    </div>

    <el-drawer v-model="sourceVisible" :title="`${sourceLibrary === 'element' ? 'Element Plus' : 'Iconify'} 使用代码`" size="min(560px, 100%)" append-to-body>
      <div class="source-section"><pre><code>{{ sourceCode }}</code></pre></div>
    </el-drawer>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import IconPicker from '@/components/IconPicker/index.vue'
import IconGrid from '@/components/IconPicker/IconGrid.vue'
import { iconifyLibraries, loadIconifyLibrary } from '@/components/AppIcon/iconify'
import type { IconPickerItem } from '@/components/IconPicker/types'
import SettingsPageShell from '../settings/components/SettingsPageShell.vue'

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
  return normalizedKeyword ? items.filter(item => `${item.label} ${item.value}`.toLowerCase().includes(normalizedKeyword)) : items
}

function elementCode(name: string) { return `<AppIcon name="${name}" />` }
function iconifyCode(icon: string) { return `<AppIcon name="${icon}" />` }

function openSource(library: 'element' | 'iconify') {
  sourceLibrary.value = library
  sourceVisible.value = true
}

async function copyCode(library: 'element' | 'iconify') {
  const copied = await copyText(library === 'element' ? elementCode(selectedElementIcon.value) : iconifyCode(selectedIconifyIcon.value))
  if (copied) ElMessage.success('使用代码已复制')
  else ElMessage.error('复制失败，请在源代码面板中手动复制')
}

async function copyIconName(name: string) {
  const copied = await copyText(name)
  if (copied) ElMessage.success('图标名称已复制')
  else ElMessage.error('复制失败，请手动复制图标名称')
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const input = document.createElement('textarea')
    input.value = text
    input.style.position = 'fixed'
    input.style.opacity = '0'
    document.body.appendChild(input)
    input.select()
    const copied = document.execCommand('copy')
    input.remove()
    return copied
  }
}
</script>

<style scoped lang="scss">
.icon-library-settings { display: flex; flex-direction: column; gap: 48px; padding-bottom: 24px; }
.section-heading { margin-bottom: 18px; }
.section-heading h2 { margin: 0; color: var(--cp-text); font-size: 18px; font-weight: $font-semibold; letter-spacing: -0.01em; }
.section-heading p { margin: 6px 0 0; color: var(--cp-text-secondary); font-size: $font-sm; line-height: 1.6; }
.section-heading code { color: var(--cp-text); font-size: inherit; }
.section-heading--with-control { display: flex; align-items: flex-end; justify-content: space-between; gap: $spacing-lg; }
.library-search { width: min(100%, 320px); flex: 0 1 320px; }

.picker-demo__content { display: flex; align-items: center; gap: $spacing-lg; padding: $spacing-lg; border-top: 1px solid var(--cp-border-light); border-bottom: 1px solid var(--cp-border-light); }
.selected-preview { display: grid; width: 72px; height: 72px; flex: 0 0 auto; place-items: center; border: 1px solid var(--cp-border-light); border-radius: $radius-md; color: var(--cp-primary); background: var(--cp-primary-lighter); }
.picker-demo__control { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: $spacing-xs; }.control-label { color: var(--cp-text-secondary); font-size: $font-sm; }

.usage-example__content { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }.usage-example__item { display: flex; min-width: 0; align-items: center; gap: $spacing-md; padding: $spacing-md; border: 1px solid var(--cp-border-light); border-radius: $radius-md; color: var(--cp-primary); background: color-mix(in srgb, var(--cp-primary) 5%, var(--cp-bg)); }.usage-example__item div { min-width: 0; color: var(--cp-text); }.usage-example__item strong, .usage-example__item code { display: block; }.usage-example__item code { margin-top: $spacing-xs; overflow: hidden; color: var(--cp-text-secondary); font-size: $font-xs; text-overflow: ellipsis; white-space: nowrap; }

.icon-library { min-width: 0; }.iconify-tabs { margin-bottom: 8px; }.iconify-tabs :deep(.el-tabs__header) { margin-bottom: 0; }.style-tools { display: flex; justify-content: flex-end; gap: $spacing-xs; padding: $spacing-xs $spacing-sm; border-top: 1px solid var(--cp-border-light); }.source-section pre { margin: 0; padding: $spacing-md; overflow: auto; border: 1px solid var(--cp-border); border-radius: $radius-md; color: var(--cp-text); background: var(--cp-bg-hover); font-size: $font-xs; line-height: 1.65; }

@include media-max($breakpoint-lg) { .section-heading--with-control { align-items: stretch; flex-direction: column; }.library-search { width: 100%; flex-basis: auto; } }
@include media-max($breakpoint-sm) { .picker-demo__content { align-items: flex-start; flex-direction: column; }.picker-demo__control { width: 100%; }.usage-example__content { grid-template-columns: 1fr; } }
</style>
