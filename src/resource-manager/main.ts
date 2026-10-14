import { createApp } from 'vue'
import ResourceManager from './ResourceManager.vue'
// Like ZCode's standalone renderer, inherit the main window's saved theme.
function applyTheme() {
  const theme = localStorage.getItem('cp-theme-mode')
  document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : 'light dark'
}
applyTheme()
window.addEventListener('storage', event => { if (event.key === 'cp-theme-mode') applyTheme() })
createApp(ResourceManager).mount('#app')
