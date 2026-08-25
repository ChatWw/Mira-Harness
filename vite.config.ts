import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'path'

const appVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version

export default defineConfig({
  define: { __MIRA_VERSION__: JSON.stringify(appVersion) },
  plugins: [vue({ template: { compilerOptions: { isCustomElement: tag => tag.startsWith('l-') } } })],
  server: {
    port: 9000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@styles': resolve(__dirname, 'src/styles'),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        // 自动导入全局变量和 mixins，每个 .vue 和 .scss 文件都可以直接使用
        additionalData: `@use "@/styles/variables.scss" as *; @use "@/styles/mixins.scss" as *;`,
        api: 'modern-compiler',
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          'element-plus': ['element-plus'],
          'iconify-runtime': ['@iconify/vue'],
        },
      },
    },
  },
})
