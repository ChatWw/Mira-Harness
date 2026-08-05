import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], build: { rollupOptions: { input: resolve(__dirname, 'electron/main.ts') } } },
  preload: { plugins: [externalizeDepsPlugin()], build: { rollupOptions: { input: resolve(__dirname, 'electron/preload.ts') } } },
  renderer: {
    root: __dirname,
    plugins: [vue()],
    resolve: { alias: { '@': resolve(__dirname, 'src'), '@styles': resolve(__dirname, 'src/styles') } },
    css: { preprocessorOptions: { scss: { additionalData: '@use "@/styles/variables.scss" as *; @use "@/styles/mixins.scss" as *;', api: 'modern-compiler' } } },
    build: { rollupOptions: { input: resolve(__dirname, 'index.html') } },
  },
})
