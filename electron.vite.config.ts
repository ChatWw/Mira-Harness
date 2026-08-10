import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const vuePlugin = vue({ template: { compilerOptions: { isCustomElement: tag => tag.startsWith('l-') } } })
const appVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], build: { rollupOptions: { input: resolve(__dirname, 'electron/main.ts') } } },
  preload: { plugins: [externalizeDepsPlugin()], build: { rollupOptions: { input: resolve(__dirname, 'electron/preload.ts') } } },
  renderer: {
    root: __dirname,
    define: { __MIRA_VERSION__: JSON.stringify(appVersion) },
    plugins: [vuePlugin],
    resolve: { alias: { '@': resolve(__dirname, 'src'), '@styles': resolve(__dirname, 'src/styles') } },
    css: { preprocessorOptions: { scss: { additionalData: '@use "@/styles/variables.scss" as *; @use "@/styles/mixins.scss" as *;', api: 'modern-compiler' } } },
    build: { rollupOptions: { input: resolve(__dirname, 'index.html') } },
  },
})
