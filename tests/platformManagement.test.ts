import { reactive } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { cloneValue } from '../src/pages/backend/platformManagement'
import type { MenuItem } from '../src/types'

vi.mock('@/router', () => ({
  default: { currentRoute: { value: { path: '/settings/menu-management' } }, replace: vi.fn() },
  syncBusinessRoutes: vi.fn(),
}))

describe('platform management IPC values', () => {
  it('converts reactive menu trees into structured-cloneable values', () => {
    const menus = reactive<MenuItem[]>([
      {
        id: 'links',
        title: '链接',
        type: 'dir',
        path: '/links',
        children: [
          {
            id: 'links_docs',
            title: '文档',
            type: 'menu',
            path: '/links/docs',
            target: { type: 'iframe', url: 'https://example.com' },
          },
        ],
      },
    ])

    expect(() => structuredClone(menus)).toThrow()

    const payload = cloneValue(menus)

    expect(() => structuredClone(payload)).not.toThrow()
    expect(payload).toEqual(menus)
  })
})
