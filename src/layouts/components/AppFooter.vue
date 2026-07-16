<template>
  <footer
    v-if="layoutStore.config.showFooter"
    class="app-footer"
    :class="`footer-style-${layoutStore.config.footerStyle}`"
    :style="{ height: `${layoutStore.config.footerHeight}px` }"
  >
    <!-- Simple 样式 -->
    <div v-if="layoutStore.config.footerStyle === 'simple'" class="footer-simple">
      <span>{{ copyrightText }}</span>
    </div>

    <!-- Split 样式 -->
    <div v-else-if="layoutStore.config.footerStyle === 'split'" class="footer-split">
      <div class="footer-left">
        <span>{{ copyrightText }}</span>
        <a
          v-if="layoutStore.config.footerIcp"
          :href="layoutStore.config.footerIcpLink"
          target="_blank"
          class="footer-link"
        >
          {{ layoutStore.config.footerIcp }}
        </a>
      </div>
      <div class="footer-right">
        <a
          v-for="link in layoutStore.config.footerLinks"
          :key="link.url"
          :href="link.url"
          :target="link.target || '_blank'"
          class="footer-link"
        >
          {{ link.text }}
        </a>
      </div>
    </div>

    <!-- Multi 样式 -->
    <div v-else-if="layoutStore.config.footerStyle === 'multi'" class="footer-multi">
      <div class="footer-row">
        <span>{{ copyrightText }}</span>
      </div>
      <div v-if="layoutStore.config.footerIcp || layoutStore.config.footerLinks.length > 0" class="footer-row">
        <a
          v-if="layoutStore.config.footerIcp"
          :href="layoutStore.config.footerIcpLink"
          target="_blank"
          class="footer-link"
        >
          {{ layoutStore.config.footerIcp }}
        </a>
        <span v-if="layoutStore.config.footerIcp && layoutStore.config.footerLinks.length > 0" class="footer-divider">|</span>
        <a
          v-for="(link, index) in layoutStore.config.footerLinks"
          :key="link.url"
          :href="link.url"
          :target="link.target || '_blank'"
          class="footer-link"
        >
          {{ link.text }}<span v-if="index < layoutStore.config.footerLinks.length - 1" class="footer-divider">|</span>
        </a>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useLayoutStore } from '@/stores/layout'

const layoutStore = useLayoutStore()

const copyrightText = computed(() => {
  const copyright = layoutStore.config.footerCopyright
  const yearText = getYearText()
  return `© ${yearText} ${copyright}. All rights reserved.`
})

function getYearText(): string {
  const mode = layoutStore.config.footerYearMode
  const currentYear = new Date().getFullYear()

  if (mode === 'auto') {
    return String(currentYear)
  }

  // custom 模式
  const startYear = layoutStore.config.footerYearStart
  const endYear = layoutStore.config.footerYearEnd

  if (startYear && endYear && startYear !== endYear) {
    return `${startYear}-${endYear}`
  }

  return String(startYear || endYear || currentYear)
}
</script>

<style scoped lang="scss">
.app-footer {
  width: 100%;
  background: var(--cp-bg);
  border-top: 1px solid var(--cp-border);
  color: var(--cp-text-secondary);
  font-size: $font-xs;
  @include flex-center;
  padding: 0 $spacing-lg;
  flex-shrink: 0;

  @include media-max($breakpoint-md) {
    padding: 0 $spacing-md;
    font-size: 12px;
  }
}

.footer-simple {
  text-align: center;
}

.footer-split {
  width: 100%;
  @include flex-between;
  align-items: center;

  .footer-left,
  .footer-right {
    @include flex-center;
    gap: $spacing-md;
  }

  @include media-max($breakpoint-md) {
    flex-direction: column;
    gap: $spacing-xs;
  }
}

.footer-multi {
  @include flex-center;
  flex-direction: column;
  gap: 4px;
  text-align: center;

  .footer-row {
    @include flex-center;
    gap: $spacing-sm;
    flex-wrap: wrap;
  }
}

.footer-link {
  color: var(--cp-text-secondary);
  text-decoration: none;
  transition: color $transition-fast;

  &:hover {
    color: var(--cp-primary);
  }
}

.footer-divider {
  margin: 0 4px;
  color: var(--cp-text-tertiary);
}
</style>
