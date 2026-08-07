import { addCollection } from '@iconify/vue'
import type { IconifyJSON } from '@iconify/types'

export const iconifyLibraries = [
  { value: 'lucide', label: 'Lucide', load: () => import('@iconify-json/lucide/icons.json') },
  { value: 'material-symbols', label: 'Material Symbols', load: () => import('@iconify-json/material-symbols/icons.json') },
  { value: 'tabler', label: 'Tabler', load: () => import('@iconify-json/tabler/icons.json') },
] as const

type IconifyLibrary = typeof iconifyLibraries[number]['value']
type IconifyCollection = IconifyJSON

const collections = new Map<IconifyLibrary, IconifyCollection>()

export function getIconifyLibrary(name: string) {
  const [prefix] = name.split(':', 1)
  return iconifyLibraries.find(library => library.value === prefix)
}

export async function loadIconifyLibrary(name: string) {
  const library = getIconifyLibrary(name)
  if (!library) return
  const cached = collections.get(library.value)
  if (cached) return cached
  const { default: rawCollection } = await library.load()
  const collection = rawCollection as IconifyCollection
  addCollection(collection)
  collections.set(library.value, collection)
  return collection
}

export async function isAvailableIconifyIcon(name: string) {
  const collection = await loadIconifyLibrary(name)
  if (!collection) return false
  const iconName = name.slice(name.indexOf(':') + 1)
  return Boolean(collection.icons[iconName] || collection.aliases?.[iconName])
}
