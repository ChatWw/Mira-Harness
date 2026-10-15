import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'

export function setupMiraTextContextMenu(window: BrowserWindow) {
  window.webContents.on('context-menu', async (_event, params) => {
    if (!params.isEditable && !params.selectionText) return
    const frame = params.frame
    if (!frame || frame.isDestroyed()) return
    try {
      // Lexical owns its undo stack; Chromium's editFlags only describe native history.
      const history = params.isEditable ? await frame.executeJavaScript(`(() => {
        const editor = document.activeElement?.closest('.mira-prompt-editor');
        return editor ? { undo: editor.dataset.miraCanUndo === 'true', redo: editor.dataset.miraCanRedo === 'true' } : null;
      })()`) as { undo: boolean; redo: boolean } | null : null
      if (window.isDestroyed() || frame.isDestroyed()) return
      const flags = params.editFlags
      const historyItem = (action: 'undo' | 'redo', label: string): MenuItemConstructorOptions => history ? {
        label, enabled: history[action], accelerator: action === 'undo' ? 'CmdOrCtrl+Z' : process.platform === 'darwin' ? 'CmdOrCtrl+Shift+Z' : 'Ctrl+Y',
        registerAccelerator: false,
        click: () => {
          if (!frame.isDestroyed()) void frame.executeJavaScript(`document.activeElement?.closest('.mira-prompt-editor')?.dispatchEvent(new CustomEvent('mira-prompt-history', { detail: '${action}' }))`).catch(console.error)
        },
      } : { label, role: action, enabled: action === 'undo' ? flags.canUndo : flags.canRedo }
      const items: MenuItemConstructorOptions[] = params.isEditable ? [
        historyItem('undo', '撤销'), historyItem('redo', '重做'),
        { type: 'separator' },
        { label: '剪切', role: 'cut', enabled: flags.canCut },
        { label: '复制', role: 'copy', enabled: flags.canCopy },
        { label: '粘贴', role: 'paste', enabled: flags.canPaste },
        { label: '删除', role: 'delete', enabled: flags.canDelete },
        { type: 'separator' },
        { label: '全选', role: 'selectAll', enabled: flags.canSelectAll },
      ] : [{ label: '复制', role: 'copy', enabled: flags.canCopy }]
      Menu.buildFromTemplate(items).popup({ window, frame })
    } catch (error) {
      if (!window.isDestroyed() && !frame.isDestroyed()) console.error('文本右键菜单打开失败', error)
    }
  })
}
