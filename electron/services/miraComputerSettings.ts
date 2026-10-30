import { execFile } from 'node:child_process'
import { accessSync, constants, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import type { MiraComputerPermission, MiraComputerStatus } from '../../src/config/miraComputerUse'

const run = promisify(execFile)
const panes = { 'screen-recording': 'Privacy_ScreenCapture', accessibility: 'Privacy_Accessibility' }

/** Probe the same Swift executable used by desktop tools, under the same Electron parent. */
export class MiraComputerSettings {
  constructor(private readonly options: {
    resourceRoot: string; configPath: string; openExternal: (url: string) => Promise<unknown>; platform?: string
    run?: (file: string, args: string[]) => Promise<string>
  }) {}

  private binary(name: string) { return join(this.options.resourceRoot, 'macos/plugin/bin', name) }
  private executable(name: string) {
    try { accessSync(this.binary(name), constants.X_OK); return true } catch { return false }
  }
  private async native(args: string[]) {
    return this.options.run ? this.options.run(this.binary('dsh-cu'), args) : (await run(this.binary('dsh-cu'), args, { timeout: 8000, maxBuffer: 64 * 1024 })).stdout
  }
  private showCursor() {
    try { return JSON.parse(readFileSync(this.options.configPath, 'utf8')).showCursor !== false }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true; throw error }
  }
  async status(): Promise<MiraComputerStatus> {
    const platform = this.options.platform ?? process.platform
    const status: MiraComputerStatus = { platform, engineAvailable: platform === 'darwin' && this.executable('dsh-cu'), cursorAvailable: platform === 'darwin' && this.executable('dsh-cursor-overlay'), screenRecording: null, accessibility: null, showCursor: this.showCursor() }
    if (status.engineAvailable) {
      try {
        const value = JSON.parse(await this.native(['permissions']))
        if (typeof value.screenRecording !== 'boolean' || typeof value.accessibility !== 'boolean') throw new Error('权限检测结果无效')
        status.screenRecording = value.screenRecording; status.accessibility = value.accessibility
      } catch { status.error = '无法检测系统权限，请修复或更新 Mira 电脑控制组件后重新检测。' }
    }
    return status
  }
  setCursor(showCursor: boolean) {
    if (typeof showCursor !== 'boolean') throw new Error('光标开关无效')
    mkdirSync(dirname(this.options.configPath), { recursive: true })
    const temporary = this.options.configPath + '.tmp'
    writeFileSync(temporary, JSON.stringify({ showCursor }) + '\n', { mode: 0o600 })
    renameSync(temporary, this.options.configPath)
  }
  async openPermission(permission: MiraComputerPermission) {
    if ((this.options.platform ?? process.platform) !== 'darwin' || !Object.prototype.hasOwnProperty.call(panes, permission)) throw new Error('系统权限类型无效')
    // Register the actual helper with TCC on an explicit user action, then open its settings pane.
    if (this.executable('dsh-cu')) await this.native(['request-permission', permission]).catch(() => undefined)
    await this.options.openExternal(`x-apple.systempreferences:com.apple.preference.security?${panes[permission]}`)
  }
}
