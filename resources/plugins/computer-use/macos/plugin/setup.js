import { accessSync, constants } from 'node:fs'
import { fileURLToPath } from 'node:url'

const bin = fileURLToPath(new URL('./bin/dsh-cu', import.meta.url))
export const OVERLAY = fileURLToPath(new URL('./bin/dsh-cursor-overlay', import.meta.url))
export const INSTALL_CMD = 'npm run tools:build'
export const INSTALL_HINT = 'Mira 电脑控制组件缺失，请修复安装；开发环境请运行 npm run tools:build'
export function findBin() {
  try { accessSync(bin, constants.X_OK); return { path: bin, source: 'bundled' } } catch { return null }
}
export const readConfig = () => ({ showCursor: true })
