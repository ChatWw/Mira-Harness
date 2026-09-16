import type { MenuItem } from '@/types'

export function filterIframeMenus(items: MenuItem[]): MenuItem[] {
  return items.flatMap((item) => {
    if (item.target?.type === 'iframe') return [{ ...item }]
    if (item.type !== 'dir') return []
    return [{ ...item, children: filterIframeMenus(item.children || []) }]
  })
}
