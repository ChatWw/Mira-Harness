import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('harness session title overflow', () => {
  it('keeps every sidebar session title in a fixed-width track that scrolls only when needed', () => {
    const source = readFileSync(new URL('../src/layouts/components/WorkspaceNavigation.vue', import.meta.url), 'utf8')

    expect(source.match(/v-session-title-overflow/g)).toHaveLength(3)
    expect(source.match(/<AppLoadingIndicator :size="16" fallback-icon="lucide:loader-circle"/g)).toHaveLength(3)
    expect(source).toContain('.workspace-session-row__status.is-unread { width: 6px; height: 6px; border-radius: 50%; background: #339CFF; }')
    expect(source).toContain("track.scrollWidth > element.clientWidth + 1")
    expect(source).toContain("element.classList.toggle('is-overflowing', overflow)")
    expect(source).toContain("element.style.setProperty('--workspace-title-duration', `${Math.max(4, scrollDistance / 22.5)}s`)")
    expect(source).toContain('.workspace-item__title.is-overflowing::after')
    expect(source).toContain('background: linear-gradient(90deg, transparent, var(--workspace-title-fade-bg))')
    expect(source).toContain('.workspace-session-row:hover .workspace-item__title.is-overflowing::before')
    expect(source).toContain('background: linear-gradient(90deg, var(--workspace-title-fade-bg), transparent)')
    expect(source).toContain('animation: workspace-session-title-scroll var(--workspace-title-duration) linear both')
    expect(source).toContain('100% { transform: translateX(var(--workspace-title-shift)); }')
    expect(source).not.toContain('100% { transform: translateX(0); }')
    expect(source).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
