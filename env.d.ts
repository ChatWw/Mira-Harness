/// <reference types="vite/client" />

interface Window {
  platform?: import('./src/types').PlatformApi
}
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
