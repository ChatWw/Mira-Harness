/* Assets and sizing follow ZCode PluginIcon; see docs/MIRA_PLUGIN_MARKETPLACE.md. */
import { useState } from 'react'
import { Blocks } from 'lucide-react'
import icons from './plugin-icons.json'
import type { MiraPluginListing } from '../../../../../src/config/miraPlugins'

export function pluginLabel(item: { name: string; listing?: MiraPluginListing }) { return item.listing?.displayName || item.name }
export function MiraPluginAvatar({ item }: { item: { name: string; listing?: MiraPluginListing } }) {
  const [failed, setFailed] = useState(false)
  const name = item.listing?.icon || item.name
  const src = icons[name as keyof typeof icons] || (/^https:\/\//.test(name) ? name : undefined)
  return <span className="mira-market-avatar">{src && !failed ? <img src={src} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <Blocks size={24} aria-hidden="true" />}</span>
}
