import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version

export default defineConfig({
  define: { __MIRA_VERSION__: JSON.stringify(appVersion) },
  plugins: [vue({ template: { compilerOptions: { isCustomElement: tag => tag.startsWith('l-') } } })],
  resolve: { alias: { '@': resolve(__dirname, 'src'), '@styles': resolve(__dirname, 'src/styles') } },
  css: { preprocessorOptions: { scss: { additionalData: '@use "@/styles/variables.scss" as *; @use "@/styles/mixins.scss" as *;', api: 'modern-compiler' } } },
})
