import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('harness session context menu', () => {
  it('groups the persistent session actions and project-aware submenus', () => {
    const source = readFileSync(new URL('../src/layouts/components/WorkspaceNavigation.vue', import.meta.url), 'utf8')

    expect(source).toContain('重命名</span>')
    expect(source).toContain("contextSession.unread ? '标记为已读' : '标记未读'")
    expect(source).toContain('<AppIcon name="lucide:eye" />')
    expect(source).not.toContain('lucide:mail-open')
    expect(source).toContain('>归档</span>')
    expect(source).toContain('>删除</span>')
    expect(source).toContain('>移动到</span>')
    expect(source).toContain('@click="moveContextSession(project.id)"')
    expect(source).toContain('>复制工作目录</span>')
    expect(source).toContain('>复制会话 ID</span>')
    expect(source).toContain('>复制为 Markdown</span>')
    expect(source).toContain("openSessionProject('file-manager')")
    expect(source).toContain("openSessionProject('terminal')")
    expect(source).toContain('await store.moveSession(session.id, projectId)')
    expect(source).toContain('await store.setSessionUnread(session.id, !session.unread)')
    expect(source).toContain(':disabled="!contextSession.workingDirectory"')
    expect(source).not.toContain("ElMessage.success(session.unread ? '已标记为已读' : '已标记为未读')")
    expect(source).not.toContain("ElMessage.success('Markdown 已复制')")
  })
})
