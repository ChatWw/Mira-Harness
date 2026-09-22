import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('harness session row actions', () => {
  it('shows pin and archive controls without opening the session', () => {
    const source = readFileSync(new URL('../src/layouts/components/WorkspaceNavigation.vue', import.meta.url), 'utf8')

    expect(source).toContain('content="取消置顶"')
    expect(source.match(/content="置顶"/g)).toHaveLength(2)
    expect(source.match(/content="归档"/g)).toHaveLength(3)
    expect(source.match(/placement="top" popper-class="workspace-session-action-tooltip"/g)).toHaveLength(6)
    expect(source.match(/@click\.stop="toggleSessionPinnedFromRow\(session\)"/g)).toHaveLength(3)
    expect(source.match(/@click\.stop="archiveSessionFromRow\(session\.id\)"/g)).toHaveLength(3)
    expect(source).toContain('await api.archiveHarnessSessions([sessionId])')
    expect(source).toContain('await store.refreshSessions()')
    expect(source).toContain('.workspace-session-row:hover .workspace-session-row__actions')
    expect(source).toContain('.workspace-session-row__actions { position: absolute;')
    expect(source).toContain('.workspace-session-row:hover .workspace-item--session,')
    expect(source).toContain('margin-right: 58px;')
    expect(source).toContain('.workspace-session-row__status { position: absolute;')
    expect(source).toContain(':has(.workspace-session-row__tool:focus-visible)')
    expect(source).not.toContain('.workspace-session-row:focus-within')
    expect(source).toContain(':global(.workspace-session-action-tooltip.el-popper)')
  })
})
