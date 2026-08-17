import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import ElementPlus, { ElTooltip } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import router, { syncBusinessRoutes, updateDocumentTitle } from './router'
import App from './app/App.vue'
import AppIcon from '@/components/AppIcon/index.vue'
import { findCommandNavigationByPath } from './config/commandPalette'
import { resolveNavigation } from './config/navigation'
import { useCommandPaletteStore } from './stores/commandPalette'
import { initializePlatform } from './platform'
import './styles/index.scss'

const tooltipDefaults = ElTooltip.props as Record<string, { default?: unknown }>
tooltipDefaults.showAfter.default = 550
tooltipDefaults.showArrow.default = false
tooltipDefaults.popperClass.default = 'mira-tooltip'

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
    const destination = findCommandNavigationByPath(to.path)
    if (destination) useCommandPaletteStore().recordVisit(destination.id)
  })
  app.use(router)
  app.use(ElementPlus, { locale: zhCn })
  app.mount('#app')
}

void bootstrap()
