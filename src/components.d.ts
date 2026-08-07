declare module 'vue' {
  export interface GlobalComponents {
    AppIcon: typeof import('./components/AppIcon/index.vue')['default']
  }
}

export {}
