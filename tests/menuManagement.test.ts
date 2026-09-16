import { describe, expect, it } from 'vitest'
import { filterIframeMenus } from '../src/pages/backend/menuManagement/menuUtils'
import type { MenuItem } from '../src/types'

describe('menu management filtering', () => {
  it('keeps empty directories so an iframe child can be added later', () => {
    const menus: MenuItem[] = [
      { id: 'empty', title: '空目录', type: 'dir', path: '/empty', children: [] },
      {
        id: 'nested',
        title: '嵌套目录',
        type: 'dir',
        path: '/nested',
        children: [
          { id: 'page', title: '内置页面', type: 'menu', path: '/nested/page', target: { type: 'component', componentKey: 'page' } },
          { id: 'link', title: '外链', type: 'menu', path: '/nested/link', target: { type: 'iframe', url: 'https://example.com' } },
        ],
      },
    ]

    expect(filterIframeMenus(menus)).toEqual([
      { id: 'empty', title: '空目录', type: 'dir', path: '/empty', children: [] },
      {
        id: 'nested',
        title: '嵌套目录',
        type: 'dir',
        path: '/nested',
        children: [
          { id: 'link', title: '外链', type: 'menu', path: '/nested/link', target: { type: 'iframe', url: 'https://example.com' } },
        ],
      },
    ])
  })
})
