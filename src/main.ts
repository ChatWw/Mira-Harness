import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import router, { syncBusinessRoutes, updateDocumentTitle } from './router'
import App from './app/App.vue'
import AppIcon from '@/components/AppIcon/index.vue'
import { findCommandNavigationByPath } from './config/commandPalette'
import { resolveNavigation } from './config/navigation'
import { useCommandPaletteStore } from './stores/commandPalette'
import { initializePlatform } from './platform'
import './styles/index.scss'

async function bootstrap() {
  await initializePlatform()
  syncBusinessRoutes()
  const app = createApp(App)
  const pinia = createPinia()

// 注册持久化插件
  pinia.use(piniaPluginPersistedstate)

  app.component('AppIcon', AppIcon)

  app.use(pinia)
  router.afterEach((to) => {
    const navigation = resolveNavigation(to.path)
    updateDocumentTitle(navigation.menu || navigation.app ? navigation.title : to.meta.title)
    if (to.path === '/dashboard') return
    const destination = findCommandNavigationByPath(to.path)
    if (destination) useCommandPaletteStore().recordVisit(destination.id)
  })
  app.use(router)
  app.use(ElementPlus)
  app.mount('#app')
}

void bootstrap()
