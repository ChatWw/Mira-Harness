import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

const run = promisify(execFile)
const electron = createRequire(import.meta.url)('electron') as string

describe('real React, Radix and dnd-kit sidebar interactions', () => {
  it('keeps drag previews stable and runs row actions without navigation, duplicate requests or lost confirmation focus', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'mira-sidebar-drag-dom-'))
    let child: ReturnType<typeof execFile> | undefined
    try {
      await build({
        stdin: { contents: fixture(), resolveDir: process.cwd(), loader: 'tsx' },
        outfile: resolve(directory, 'fixture.js'), bundle: true, platform: 'browser', jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"development"' },
      })
      await run(resolve('node_modules/.bin/tailwindcss'), ['-i', resolve('apps/harness-react/src/styles/app.css'), '-o', resolve(directory, 'fixture.css'), '--minify'])
      await writeFile(resolve(directory, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>')
      await writeFile(resolve(directory, 'main.cjs'), main)
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE
      delete env.NODE_OPTIONS
      const execution = run(electron, [resolve(directory, 'main.cjs')], { env, detached: true, timeout: 20000, maxBuffer: 1024 * 1024 })
      child = execution.child
      const { stdout } = await execution
      const result = JSON.parse(stdout.split('\n').find(line => line.startsWith('MIRA_SIDEBAR_RESULT='))!.slice('MIRA_SIDEBAR_RESULT='.length))
      expect(result.errors, JSON.stringify(result.history)).toEqual([])
      expect(result.preview).toMatchObject({ mounted: true, sourceParent: 'sidebar-group:empty', writes: 0, overlay: true })
      expect(result.retargeted).toMatchObject({ mounted: true, sourceParent: 'sidebar-group:origin', writes: 0, overlay: true })
      expect(result.dropped).toMatchObject({ mounted: true, sourceParent: 'sidebar-group:empty', writes: 1, overlay: false })
      expect(result.dropped.groups.map((group: { sessionIds: string[] }) => group.sessionIds)).toEqual([['other'], ['target'], ['source']])
      expect(result.cancelled).toMatchObject({ mounted: true, sourceParent: 'sidebar-group:empty', writes: 1, overlay: false })
      expect(result.cancelled.groups).toEqual(result.dropped.groups)
      expect(result.keyboardPreview).toMatchObject({ mounted: true, sourceParent: 'sidebar-group:empty', writes: 0, overlay: true })
      expect(result.keyboardDropped).toMatchObject({ mounted: true, sourceParent: 'sidebar-group:empty', writes: 1, overlay: false })
      expect(result.keyboardRetargeted).toMatchObject({ mounted: true, writes: 0, overlay: true })
      expect(result.keyboardRetargeted.sourceParent).not.toBe('sidebar-group:empty')
      expect(result.keyboardCancelled).toMatchObject({ mounted: true, sourceParent: 'sidebar-group:origin', writes: 0, overlay: false })
      expect(result.edgePreview).toMatchObject({ mounted: true, sourceParent: 'root', writes: 0, overlay: true })
      expect(result.edgePreview.rootOrder, JSON.stringify(result.edgeTrace)).toEqual(['sidebar-group:origin', 'source', 'sidebar-group:target', 'sidebar-group:empty'])
      expect(result.edgeDropped).toMatchObject({ mounted: true, sourceParent: 'root', writes: 1, overlay: false })
      expect(result.edgeDropped.rootOrder).toEqual(result.edgePreview.rootOrder)
      expect(result.hover.visible).toBe(true)
      expect(result.hover.labels).toEqual(['显示 源任务 的文件树', '移动 源任务 到顶部', '关闭 源任务'])
      expect(result.hover.timeVisible).toBe(false)
      expect(result.hoverLeft).toMatchObject({ visible: false, timeVisible: true })
      expect(result.files).toMatchObject({ files: ['source'], opens: [], archives: [], busy: false, overlay: false })
      expect(result.groupClosed).toMatchObject({ archives: ['source'], opens: [], confirming: false, busy: false })
      expect(result.beforeConfirm.focused).toBe('侧栏外操作')
      expect(result.confirmed).toMatchObject({ confirming: true, focused: '确认归档 源任务', archives: [], opens: [] })
      expect(result.confirmLeft).toMatchObject({ confirming: true, visible: true })
      expect(result.escaped).toMatchObject({ confirming: false, archives: [], focused: '归档 源任务' })
      expect(result.outside).toMatchObject({ confirming: false, archives: [] })
      expect(result.pending).toMatchObject({ confirming: true, busy: true, archives: ['source'], opens: [] })
      expect(result.failed).toMatchObject({ confirming: true, busy: false, archives: ['source'], error: '归档保存失败' })
      expect(result.retried).toMatchObject({ confirming: false, busy: false, archives: ['source', 'source'], error: '' })
      expect(result.beforePinned.focused).toBe('侧栏外操作')
      expect(result.pinned).toMatchObject({ confirming: true, focused: '确认归档 源任务', archives: [] })
      expect(result.pinned.labels).toContain('确认归档 源任务')
      expect(result.pinned.labels).not.toContain('关闭 源任务')
      expect(result.pinnedEscaped).toMatchObject({ confirming: false, focused: '归档 源任务', archives: [], opens: [] })
      expect(result.menu).toMatchObject({ confirming: false, menuOpen: true, opens: [] })
      expect(result.menuFiles).toMatchObject({ files: ['source'], opens: [], busy: false })
      expect(result.timeline).toMatchObject({ confirming: true, archives: [], timeline: true })
      expect(result.waiting).toMatchObject({ confirming: false, labels: [], status: '等待审批', pendingInteraction: true })
      expect(result.plan).toMatchObject({ labels: [], status: '需要用户输入', pendingInteraction: true })
      expect(result.groupDraft).toMatchObject({ id: 'draft-owner', parent: 'sidebar-group:empty', first: true, count: '1', rows: 1, selected: true, preparedRows: 0, placeholders: 0, draggable: false, closeVisible: false, statusVisible: true })
      expect(result.relocatedDraft).toMatchObject({ id: 'draft-owner', parent: 'sidebar-group:target', first: true, count: '2', rows: 1, preparedRows: 0, emptyPlaceholder: true })
      expect(result.draftHover).toMatchObject({ closeVisible: true, statusVisible: false, menu: false })
      expect(result.openedDraft).toMatchObject({ id: 'draft-owner', selected: true, opens: ['draft-owner'], realOpens: [], realCreates: 0 })
      expect(result.closedDraft).toMatchObject({ rows: 0, closes: ['draft-owner'], archives: [], realCreates: 0 })
      expect(result.rootDraft).toMatchObject({ id: 'draft-owner', parent: 'root', first: true, rows: 1, selected: true, preparedRows: 0, realCreates: 0 })
    } finally {
      // Stop only this isolated child/group, including if its renderer hangs or a check fails.
      if (child?.pid) {
        if (process.platform === 'win32') child.kill()
        else {
          try { process.kill(-child.pid, 'SIGKILL') }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
        }
      }
      await rm(directory, { recursive: true, force: true })
    }
  }, 30000)
})

function fixture() {
  return `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { SessionSidebar } from ${JSON.stringify(resolve('apps/harness-react/src/components/session/SessionSidebar.tsx'))}
import { SidebarPreferenceStore } from ${JSON.stringify(resolve('apps/harness-react/src/components/session/sidebar-preferences.ts'))}
const errors = [], writes = [], history = [], archives = [], files = [], opens = []
let archiveMode = 'resolve', resolveArchive, rejectArchive, activeDraft, root, realCreates = 0
const draftCalls = { creates: [], opens: [], closes: [] }
window.addEventListener('error', event => errors.push(event.error?.stack || event.message))
const preferences = { view: 'group', sort: 'manual', groups: [
  { id: 'origin', name: '来源', color: 'blue', collapsed: false, sessionIds: ['source', 'other'] },
  { id: 'target', name: '目标', color: 'purple', collapsed: false, sessionIds: ['target'] },
  { id: 'empty', name: '空组', color: 'green', collapsed: false, sessionIds: [] },
] }
const store = new SidebarPreferenceStore(async () => preferences, async value => { writes.push(value) })
const sessions = [
  { id: 'source', title: '源任务', workingDirectory: '/tmp/mira', createdAt: 1, updatedAt: 2, status: 'active' },
  { id: 'other', title: '其他任务', createdAt: 1, updatedAt: 2, status: 'active' },
  { id: 'target', title: '目标任务', createdAt: 1, updatedAt: 2, status: 'active' },
]
const state = { sessions, projects: [], runningSessionIds: [], pendingPermissions: {}, unreadSessionIds: [] }
const controller = { getSnapshot: () => state, reportError: error => errors.push(error.message), createConversation: () => { realCreates++; return Promise.resolve({id:'unexpected-real-session'}) }, archiveSession: id => { archives.push(id); return archiveMode === 'pending' ? new Promise((resolve, reject) => { resolveArchive = resolve; rejectArchive = reject }) : Promise.resolve() } }
function startDraft(groupId) {
  draftCalls.creates.push(groupId || 'root')
  activeDraft = { draftId: 'draft-owner', groupId, selected: true, preparedSessionId: 'prepared-session', workspaceLabel: 'Mira' }
  state.sessions = [...sessions, { id:'prepared-session', title:'预热草稿不可见', pinned:true, createdAt:1, updatedAt:2, status:'active' }]
  renderSidebar()
}
function renderSidebar() {
  root.render(<React.Profiler id="sidebar" onRender={() => history.push({parent: document.querySelector('[data-sidebar-session-id="source"]')?.closest('[data-collection-id]')?.getAttribute('data-collection-id'), empty: !!document.querySelector('[data-sidebar-drop-id="sidebar-drop:empty"]')})}>
    <div className="pilot-workbench" style={{height:'100vh'}}><SessionSidebar state={state} controller={controller} width={264} onClose={() => {}} preferenceStore={store} onOpenSession={id => opens.push(id)} onOpenSessionFiles={id => { files.push(id) }} draft={activeDraft} onNewConversation={() => startDraft()} onNewGroupConversation={startDraft} onOpenDraft={id => { draftCalls.opens.push(id); activeDraft={...activeDraft,selected:true}; renderSidebar() }} onCloseDraft={id => { draftCalls.closes.push(id); activeDraft=undefined; renderSidebar() }} /><button aria-label="侧栏外操作" style={{position:'absolute',left:500,top:80}}>侧栏外操作</button></div>
  </React.Profiler>)
}
window.sidebarFixture = { errors, history,
  reset: async () => { store.change(preferences); await store.save(); writes.length = 0 },
  configure: async ({ view = 'project', projectView = 'collections', pinned = false, mode = 'resolve' } = {}) => {
    state.sessions = sessions.map(session => session.id === 'source' ? { ...session, pinned } : session)
    state.pendingPermissions = {}; archiveMode = mode; archives.length = 0; files.length = 0; opens.length = 0
    store.change({ ...preferences, view, projectView, ungroupedSessionOrder: [], groupedRootOrder: [] }); await store.save(); writes.length = 0
  },
  settleArchive: error => error ? rejectArchive(new Error(error)) : resolveArchive(),
  deselectDraft: () => { activeDraft={...activeDraft,selected:false}; renderSidebar() },
  draftSnapshot: () => {
    const row=document.querySelector('[data-sidebar-draft-id]'), parent=row?.closest('[data-collection-id]'), action=row?.querySelector('.mira-session-draft__actions'), status=row?.querySelector('.mira-session-draft__status')
    return {id:row?.getAttribute('data-sidebar-draft-id'), parent:parent?.getAttribute('data-collection-id') || 'root',
      first:!!row && row=== (parent?.querySelector('.mira-collection-content') || document.querySelector('[data-sidebar-root]'))?.firstElementChild,
      count:parent?.querySelector('.mira-collection-count')?.textContent, rows:document.querySelectorAll('[data-sidebar-draft-id]').length,
      selected:row?.querySelector('.mira-session-row__open')?.getAttribute('aria-current')==='page', preparedRows:document.querySelectorAll('[data-sidebar-session-id="prepared-session"]').length,
      placeholders:parent?.querySelectorAll('.mira-sidebar-empty-drop').length || 0, emptyPlaceholder:!!document.querySelector('[data-sidebar-drop-id="sidebar-drop:empty"]'),
      draggable:!!row?.querySelector('[aria-label^="拖拽"]'), menu:!!row?.querySelector('.mira-session-row__more'),
      closeVisible:!!action && getComputedStyle(action).display!=='none', statusVisible:!!status && getComputedStyle(status).display!=='none',
      opens:[...draftCalls.opens], closes:[...draftCalls.closes], realOpens:[...opens], archives:[...archives], realCreates}
  },
  setWaiting: kind => { state.pendingPermissions = kind === 'permission' ? { source: {} } : {}; state.sessions = state.sessions.map(session => session.id === 'source' ? { ...session, planStatus: kind === 'plan' ? 'needs_input' : undefined } : session); store.change({}) },
  actions: () => {
    const row = document.querySelector('[data-sidebar-session-id="source"]'), actions = row?.querySelector('.mira-session-row__actions'), time = row?.querySelector('time')
    return { visible: !!actions && getComputedStyle(actions).display !== 'none', timeVisible: !!time && getComputedStyle(time).display !== 'none',
      labels: [...row?.querySelectorAll('.mira-session-row__action') || []].map(button => button.getAttribute('aria-label')),
      files: [...files], opens: [...opens], archives: [...archives], confirming: !!row?.hasAttribute('data-archive-confirming'), busy: row?.getAttribute('aria-busy') === 'true',
      focused: document.activeElement?.getAttribute('aria-label'), error: row?.querySelector('[role="alert"]')?.textContent || '',
      pendingInteraction: !!row?.hasAttribute('data-pending-interaction'), status: row?.querySelector('.mira-session-status')?.getAttribute('aria-label'),
      menuOpen: !!document.querySelector('[role="menu"]'), timeline: !!row?.classList.contains('mira-session-row--timeline'), overlay: !!document.querySelector('.mira-session-drag-overlay') }
  }, snapshot: () => ({ mounted: !!document.querySelector('[data-sidebar-root]'),
  groups: store.getSnapshot().preferences.groups, writes: writes.length,
  sourceParent: document.querySelector('[data-sidebar-session-id="source"]')?.closest('[data-collection-id]')?.getAttribute('data-collection-id') || 'root',
  rootOrder: [...document.querySelector('[data-sidebar-root]')?.children || []].filter(node => node.hasAttribute('data-collection-id') || node.hasAttribute('data-sidebar-session-id')).map(node => node.getAttribute('data-collection-id') || node.getAttribute('data-sidebar-session-id')),
  overlay: !!document.querySelector('.mira-session-drag-overlay') }) }
store.load().then(() => { root=createRoot(document.getElementById('root'), { onUncaughtError: error => errors.push(error.stack) }); renderSidebar() })
`
}

const main = `
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
app.setPath('userData', path.join(__dirname, 'profile'))
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
let window, lastPoint
const edgeTrace = []
const inspect = async expression => { try { return await window.webContents.executeJavaScript(expression) } catch (error) { throw Error('Renderer expression failed: ' + expression + '\\n' + error.message) } }
const point = selector => inspect('(() => { const node=document.querySelector(' + JSON.stringify(selector) + '); if(!node) return null; const r=node.getBoundingClientRect(); return {x:r.x+r.width*.75,y:r.y+r.height/2}; })()')
const mouse = (type, at, pressed = false) => { lastPoint = at || lastPoint; return window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {type, ...lastPoint, button:type === 'mouseMoved'?'none':'left', buttons:pressed?1:0, clickCount:type === 'mouseMoved'?0:1}) }
const wait = async expression => {
  const end = Date.now() + 3000
  while (Date.now() < end) { if (await inspect(expression)) return; await pause(10) }
  throw Error('Did not settle: ' + expression)
}
const frames = () => inspect('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
const key = async (code, virtualKeyCode) => { const event = {key:code === 'Space'?' ':code,code,windowsVirtualKeyCode:virtualKeyCode}; await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {type:'keyDown',...event,text:code === 'Enter'?String.fromCharCode(13):undefined}); await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {type:'keyUp',...event}) }
async function keyboardEmpty() {
  await inspect('document.querySelector("[data-sidebar-session-id=source] .mira-session-row__grip").focus()')
  await key('Space', 32); await wait('!!document.querySelector(".mira-session-drag-overlay")')
  for (let index=0;index<20;index++) {
    if ((await inspect('window.sidebarFixture.snapshot()')).sourceParent === 'sidebar-group:empty') break
    await key('ArrowDown', 40); await frames()
  }
  for (let index=0;index<8;index++) await frames()
}
async function start() {
  const handle = await point('button[aria-label="拖拽排序 源任务"]')
  await mouse('mouseMoved', handle); await mouse('mousePressed', handle, true)
  await mouse('mouseMoved', {x:handle.x,y:handle.y+8}, true)
  await wait('!!document.querySelector(".mira-session-drag-overlay")')
}
async function target(selector) {
  for (let index=0;index<3;index++) {
    const at=await point(selector)
    if (!at) break
    await mouse('mouseMoved', {x:at.x,y:at.y-2}, true)
    await mouse('mouseMoved', {x:at.x,y:at.y+2}, true)
    await frames()
  }
}
async function enterExpandedHeadUpward() {
  const head=await point('[data-sidebar-drop-id="sidebar-head:target"]')
  await mouse('mouseMoved', {x:head.x,y:head.y+80}, true); await frames()
  for (let index=0;index<45;index++) {
    await mouse('mouseMoved', {x:head.x,y:head.y+75-index*5}, true); await frames()
    const snapshot=await inspect('window.sidebarFixture.snapshot()')
    edgeTrace.push({y:head.y+75-index*5,snapshot,geometry:{head:await point('[data-sidebar-drop-id="sidebar-head:target"]'),source:await point('[data-sidebar-session-id="source"]'),over:await inspect('document.querySelector("[role=status]")?.textContent')}})
    if (snapshot.rootOrder.indexOf('source') === snapshot.rootOrder.indexOf('sidebar-group:target')-1) return
  }
}
const rowButton = label => '[data-sidebar-session-id="source"] button[aria-label="' + label + '"]'
const actionSnapshot = () => inspect('window.sidebarFixture.actions()')
const configure = async options => { await inspect('document.activeElement?.blur(); window.sidebarFixture.configure(' + JSON.stringify(options) + ')'); await frames() }
const hoverSource = async () => { await mouse('mouseMoved', await point('[data-sidebar-session-id="source"]')); await frames() }
async function pressButton(label) {
  const at = await point(rowButton(label)); await mouse('mouseMoved', at); await mouse('mousePressed', at, true); await mouse('mouseReleased', at); await frames()
}
async function focusOutside() {
  const at = await point('button[aria-label="侧栏外操作"]'); await mouse('mouseMoved', at); await mouse('mousePressed', at, true); await mouse('mouseReleased', at); await frames()
}
async function keyboardButton(label) {
  await inspect('document.querySelector("[data-sidebar-session-id=source] .mira-session-row__open").focus()'); await frames()
  if (!await point(rowButton(label))) throw Error('Missing keyboard action ' + label + ': ' + JSON.stringify(await actionSnapshot()))
  await inspect('document.querySelector(' + JSON.stringify(rowButton(label)) + ').focus()'); await key('Enter', 13); await frames()
}
async function rowActions() {
  await configure({view:'group'}); await hoverSource()
  const hover = await actionSnapshot()
  await mouse('mouseMoved', {x:600,y:100}); await frames()
  const hoverLeft = await actionSnapshot()
  await hoverSource(); await pressButton('显示 源任务 的文件树')
  await wait('!window.sidebarFixture.actions().busy')
  const files = await actionSnapshot()
  await pressButton('关闭 源任务'); await wait('!window.sidebarFixture.actions().busy')
  const groupClosed = await actionSnapshot()
  await configure({}); await focusOutside()
  const beforeConfirm = await actionSnapshot()
  await hoverSource(); await pressButton('归档 源任务')
  const confirmed = await actionSnapshot()
  await mouse('mouseMoved', {x:600,y:100}); await frames()
  const confirmLeft = await actionSnapshot()
  await key('Escape', 27); await frames()
  const escaped = await actionSnapshot()
  await keyboardButton('归档 源任务')
  await mouse('mousePressed', {x:600,y:100}, true); await mouse('mouseReleased'); await frames()
  const outside = await actionSnapshot()
  await configure({mode:'pending'}); await keyboardButton('归档 源任务'); await keyboardButton('确认归档 源任务')
  await inspect('document.querySelector(' + JSON.stringify(rowButton('确认归档 源任务')) + ').dispatchEvent(new MouseEvent("click", {bubbles:true}))'); await frames()
  const pending = await actionSnapshot()
  await inspect('window.sidebarFixture.settleArchive("归档保存失败")'); await wait('!window.sidebarFixture.actions().busy')
  const failed = await actionSnapshot()
  await keyboardButton('确认归档 源任务'); await inspect('window.sidebarFixture.settleArchive()'); await wait('!window.sidebarFixture.actions().busy')
  const retried = await actionSnapshot()
  await configure({view:'group',pinned:true}); await focusOutside()
  const beforePinned = await actionSnapshot()
  await hoverSource(); await pressButton('归档 源任务')
  const pinned = await actionSnapshot()
  await key('Escape', 27); await frames()
  const pinnedEscaped = await actionSnapshot()
  await pressButton('归档 源任务')
  await pressButton('源任务 的操作'); await wait('!!document.querySelector("[role=menu]")')
  const menu = await actionSnapshot()
  await inspect('[...document.querySelectorAll("[role=menuitem]")].find(node => node.textContent === "显示文件树").click()'); await frames(); await wait('!window.sidebarFixture.actions().busy')
  const menuFiles = await actionSnapshot()
  await configure({projectView:'timeline'}); await keyboardButton('归档 源任务')
  const timeline = await actionSnapshot()
  await inspect('window.sidebarFixture.setWaiting("permission")'); await frames()
  const waiting = await actionSnapshot()
  await inspect('window.sidebarFixture.setWaiting("plan")'); await frames()
  const plan = await actionSnapshot()
  return {hover,hoverLeft,files,groupClosed,beforeConfirm,confirmed,confirmLeft,escaped,outside,pending,failed,retried,beforePinned,pinned,pinnedEscaped,menu,menuFiles,timeline,waiting,plan}
}
async function draftActions() {
  await configure({view:'group'}); await focusOutside()
  const press=async label => { const at=await point('button[aria-label="'+label+'"]'); if(!at) throw Error('Missing draft control '+label); await mouse('mouseMoved',at); await mouse('mousePressed',at,true); await mouse('mouseReleased',at); await frames() }
  const snapshot=()=>inspect('window.sidebarFixture.draftSnapshot()')
  await press('在 空组 新建任务'); await wait('window.sidebarFixture.draftSnapshot().rows===1')
  await mouse('mouseMoved',{x:600,y:100}); await focusOutside()
  const groupDraft=await snapshot()
  await press('在 目标 新建任务'); await wait('window.sidebarFixture.draftSnapshot().parent==="sidebar-group:target"')
  const relocatedDraft=await snapshot()
  await mouse('mouseMoved',await point('[data-sidebar-draft-id]')); await frames()
  const draftHover=await snapshot()
  await inspect('window.sidebarFixture.deselectDraft()'); await frames()
  await press('打开草稿 新任务'); const openedDraft=await snapshot()
  await press('关闭草稿 新任务'); await wait('window.sidebarFixture.draftSnapshot().rows===0')
  const closedDraft=await snapshot()
  await press('新建任务'); await wait('window.sidebarFixture.draftSnapshot().rows===1')
  const rootDraft=await snapshot()
  return {groupDraft,relocatedDraft,draftHover,openedDraft,closedDraft,rootDraft}
}
app.whenReady().then(async () => {
  try {
    window = new BrowserWindow({ width:1440,height:1100,show:false,webPreferences:{contextIsolation:true,sandbox:true,backgroundThrottling:false} })
    window.webContents.debugger.attach('1.3')
    await window.loadFile(path.join(__dirname, 'index.html'))
    await wait('!!document.querySelector("[data-sidebar-session-id=source]")')
    await frames()
    await start(); await target('[data-sidebar-drop-id="sidebar-drop:empty"]')
    await pause(80)
    const preview = await inspect('window.sidebarFixture.snapshot()')
    await target('[data-sidebar-session-id="other"]')
    const retargeted = await inspect('window.sidebarFixture.snapshot()')
    await target('[data-sidebar-drop-id="sidebar-drop:empty"]')
    await mouse('mouseReleased')
    await frames(); await pause(80)
    const dropped = await inspect('window.sidebarFixture.snapshot()')
    if (dropped.mounted) {
      await start(); await target('[data-sidebar-session-id="other"]')
      await key('Escape', 27)
      await mouse('mouseReleased')
      await frames(); await pause(80)
    }
    const cancelled = await inspect('window.sidebarFixture.snapshot()')
    await inspect('window.sidebarFixture.reset()'); await frames()
    await keyboardEmpty()
    const keyboardPreview = await inspect('window.sidebarFixture.snapshot()')
    await key('Space', 32); await frames(); await pause(80)
    const keyboardDropped = await inspect('window.sidebarFixture.snapshot()')
    await inspect('window.sidebarFixture.reset()'); await frames()
    await keyboardEmpty(); await key('ArrowDown', 40); await frames()
    const keyboardRetargeted = await inspect('window.sidebarFixture.snapshot()')
    await key('Escape', 27); await frames(); await pause(80)
    const keyboardCancelled = await inspect('window.sidebarFixture.snapshot()')
    await inspect('window.sidebarFixture.reset()'); await frames()
    await start(); await enterExpandedHeadUpward()
    const edgePreview = await inspect('window.sidebarFixture.snapshot()')
    await mouse('mouseReleased'); await frames(); await pause(80)
    const edgeDropped = await inspect('window.sidebarFixture.snapshot()')
    const actions = await rowActions()
    const drafts = await draftActions()
    console.log('MIRA_SIDEBAR_RESULT=' + JSON.stringify({preview,retargeted,dropped,cancelled,keyboardPreview,keyboardDropped,keyboardRetargeted,keyboardCancelled,edgePreview,edgeDropped,edgeTrace,...actions,...drafts,errors:await inspect('window.sidebarFixture.errors'),history:await inspect('window.sidebarFixture.history')}))
    app.quit()
  } catch (error) { console.error(error.stack); app.exit(1) }
})
`
