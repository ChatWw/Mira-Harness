import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MiraWorkspaceHtml } from '../electron/services/miraWorkspaceHtml'

describe('workspace HTML browser preview', () => {
  let directory: string, root: string, previews: MiraWorkspaceHtml
  const owner = { grantId: 'grant', webContentsId: 1 }
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'mira-html-')); root = join(directory, 'project')
    await mkdir(join(root, '原型 #?'), { recursive: true })
    await writeFile(join(root, '原型 #?', 'index.HTML'), '<html><link rel="stylesheet" href="style.css"><script src="main.js"></script><h1>本地页面</h1></html>')
    await writeFile(join(root, '原型 #?', 'style.css'), 'h1{color:red}')
    await writeFile(join(root, '原型 #?', 'main.js'), 'document.title="本地原型"')
    await writeFile(join(root, 'index.html'), '<h1>root</h1>')
    await writeFile(join(directory, 'secret.html'), 'outside')
    previews = new MiraWorkspaceHtml()
  })
  afterEach(async () => { previews.closeAll(); await rm(directory, { recursive: true, force: true }) })

  it('serves encoded HTML, relative scripts/styles and root-relative assets from an isolated origin', async () => {
    const url = await previews.open(root, '原型 #?/index.HTML', owner, () => {})
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/.*index.HTML$/)
    expect(await (await fetch(url)).text()).toContain('本地页面')
    const css = await fetch(new URL('style.css', url))
    expect(css.headers.get('content-type')).toContain('text/css'); expect(await css.text()).toContain('color:red')
    expect(await (await fetch(new URL('main.js', url))).text()).toContain('本地原型')
    expect(await (await fetch(new URL('/index.html', url))).text()).toContain('root')
    await writeFile(join(root, '原型 #?', 'main.js'), 'updated')
    expect(await (await fetch(new URL('main.js', url))).text()).toBe('updated')
    const head = await fetch(url, { method: 'HEAD' }); expect(head.status).toBe(200); expect(await head.text()).toBe('')
    const another = await previews.open(root, 'index.html', owner, () => {})
    expect(new URL(another).origin).toBe(new URL(url).origin)
    const isolated = await previews.open(root, 'index.html', { ...owner, grantId: 'other' }, () => {})
    expect(new URL(isolated).origin).not.toBe(new URL(url).origin)
  })

  it('rejects non-HTML entries, traversal, external symlinks, foreign origins and revoked workspaces', async () => {
    await expect(previews.open(root, '原型 #?/style.css', owner, () => {})).rejects.toThrow('仅 HTML')
    await expect(previews.open(root, '../secret.html', owner, () => {})).rejects.toThrow('路径')
    await symlink(join(directory, 'secret.html'), join(root, 'escape.html'))
    await expect(previews.open(root, 'escape.html', owner, () => {})).rejects.toThrow('工作目录')
    let allowed = true
    const url = await previews.open(root, 'index.html', owner, () => { if (!allowed) throw Error('revoked') })
    expect((await fetch(new URL('/escape.html', url))).status).toBe(403)
    expect((await fetch(new URL('/%2e%2e%2fsecret.html', url))).status).toBe(403)
    expect((await fetch(url, { headers: { Origin: 'https://foreign.test' } })).status).toBe(403)
    expect((await fetch(url, { method: 'POST' })).status).toBe(405)
    expect((await fetch(new URL('/missing.html', url))).status).toBe(404)
    allowed = false; expect((await fetch(url)).status).toBe(403)
  })

  it('closes preview servers when the owning grant or window is released', async () => {
    const first = await previews.open(root, 'index.html', owner, () => {})
    const second = await previews.open(root, 'index.html', { ...owner, grantId: 'second' }, () => {})
    previews.closeForGrant('grant', 2); expect((await fetch(first)).status).toBe(200)
    previews.closeForGrant('grant', 1); await expect(fetch(first)).rejects.toThrow()
    expect((await fetch(second)).status).toBe(200)
    previews.closeForWebContents(1); await expect(fetch(second)).rejects.toThrow()
  })
})
