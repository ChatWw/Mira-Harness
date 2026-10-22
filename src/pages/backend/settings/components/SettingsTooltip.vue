<template>
  <el-tooltip
    v-bind="$attrs"
    :popper-class="`settings-tooltip ${$attrs['popper-class'] || ''}`"
    transition="settings-tooltip"
  >
    <slot />
    <template #content>
      <span class="settings-tooltip__surface"><slot name="content">{{ $attrs.content }}</slot></span>
    </template>
  </el-tooltip>
</template>

<script setup lang="ts">
defineOptions({ inheritAttrs: false })
</script>
