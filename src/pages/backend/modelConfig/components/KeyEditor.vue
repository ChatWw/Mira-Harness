<template>
  <div class="stored-key-editor">
    <el-input :model-value="label" aria-label="密钥标签" placeholder="标签" :disabled="busy" @update:model-value="$emit('update:label', $event)" />
    <el-input :model-value="value" aria-label="储存的 API 密钥" type="password" show-password placeholder="输入 API 密钥" :disabled="busy" @update:model-value="$emit('update:value', $event)" @keyup.enter="$emit('save')" />
    <SettingsTooltip content="保存" placement="top"><el-button text circle aria-label="保存密钥" :disabled="!value.trim()" :loading="busy" @click="$emit('save')"><AppIcon name="Check" /></el-button></SettingsTooltip>
    <SettingsTooltip content="取消" placement="top"><el-button text circle aria-label="取消编辑密钥" :disabled="busy" @click="$emit('cancel')"><AppIcon name="Close" /></el-button></SettingsTooltip>
  </div>
</template>
<script setup lang="ts">
import SettingsTooltip from '../../settings/components/SettingsTooltip.vue'
defineProps<{ label: string; value: string; busy: boolean }>()
defineEmits<{ 'update:label': [value: string]; 'update:value': [value: string]; save: []; cancel: [] }>()
</script>
<style scoped lang="scss">
.stored-key-editor { display: flex; align-items: center; gap: 6px; width: 100%; .el-input { min-width: 0; flex: 1; } .el-input:first-child { flex: 0 1 90px; } .el-button { margin-left: 0; flex-shrink: 0; } }
</style>
