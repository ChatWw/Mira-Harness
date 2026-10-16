import pluginIcons from '../components/extensions/plugin-icons.json'
import { miraFileTreeIcon } from './mira-file-tree-icon'
import type { MiraPromptReference } from './prompt-editor-document'

// ZCode mentionIconDom: WandSparkles, Goal, Workflow and SquareSlash.
const referenceIcons = {
  skill: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3M5 6v4M19 14v4M10 2v2M7 8H3M21 16h-4M11 3H9"/>',
  goal: '<path d="M12 13V2l8 4-8 4M20.561 10.222a9 9 0 1 1-12.55-5.29M8.002 9.997a5 5 0 1 0 8.9 2.02"/>',
  workflow: '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/>',
  command: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 15 6-6"/>',
}

/** Keep composer tokens and sent-message references visually identical. */
export function decorateMiraPromptReference(element: HTMLElement, reference: MiraPromptReference): void {
  element.classList.remove('mira-prompt-reference-plugin-image')
  element.style.removeProperty('--mira-reference-plugin-icon')
  if (reference.kind === 'file') element.style.setProperty('--mira-reference-file-icon', `url("${miraFileTreeIcon(reference.value)}")`)
  if (reference.kind === 'skill' || reference.kind === 'command') {
    const command = reference.value.replace(/^builtin:/, '')
    const icon = reference.kind === 'skill' ? referenceIcons.skill : command === 'goal' ? referenceIcons.goal : command === 'workflow' ? referenceIcons.workflow : referenceIcons.command
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>`
    element.style.setProperty('--mira-reference-icon', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`)
  }
  if (reference.kind === 'plugin') {
    const name = reference.pluginIcon || reference.value.split('@')[0]
    const src = pluginIcons[name as keyof typeof pluginIcons] || (/^https:\/\//.test(name) ? name : undefined)
    if (src) {
      element.style.setProperty('--mira-reference-plugin-icon', `url(${JSON.stringify(src)})`)
      element.classList.add('mira-prompt-reference-plugin-image')
    }
  }
}
