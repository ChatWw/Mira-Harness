import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import router, { updateDocumentTitle } from './router'
import App from './app/App.vue'
import { findCommandNavigationByPath } from './config/commandPalette'
import { resolveNavigation } from './config/navigation'
import { useCommandPaletteStore } from './stores/commandPalette'
import './styles/index.scss'

const app = createApp(App)
const pinia = createPinia()

// 注册持久化插件
pinia.use(piniaPluginPersistedstate)

// 注册所有 Element Plus 图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

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
