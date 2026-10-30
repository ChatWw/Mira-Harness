import { accessSync, constants } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const bin = fileURLToPath(new URL('./bin/dsh-cu', import.meta.url))
export const OVERLAY = fileURLToPath(new URL('./bin/dsh-cursor-overlay', import.meta.url))
export const INSTALL_CMD = 'npm run tools:build'
export const INSTALL_HINT = 'Mira 电脑控制组件缺失，请修复安装；开发环境请运行 npm run tools:build'
export function findBin() {
  try { accessSync(bin, constants.X_OK); return { path: bin, source: 'bundled' } } catch { return null }
}
export function readConfig() {
  if (!process.env.MIRA_CU_CONFIG) return { showCursor: true }
  try { return { showCursor: JSON.parse(readFileSync(process.env.MIRA_CU_CONFIG, 'utf8')).showCursor !== false } }
  catch (error) { if (error.code === 'ENOENT') return { showCursor: true }; throw new Error('电脑控制设置无法读取，请在插件详情页重新保存光标设置') }
}
