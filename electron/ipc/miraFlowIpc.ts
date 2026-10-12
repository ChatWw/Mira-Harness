import { BrowserWindow, ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { parseMiraFlowWorkbenchRequest, type MiraFlowWorkbenchRequest } from '../../src/config/miraFlowWorkbench'

export interface MiraFlowRequestPort {
  request(sender: WebContents, request: MiraFlowWorkbenchRequest, assertAuthorized?: () => void): Promise<unknown>
}
export function assertMiraFlowHostFrame(event: IpcMainInvokeEvent) {
  if (!event.senderFrame || event.senderFrame.parent !== null || event.senderFrame !== event.sender.mainFrame
    || event.sender.isDestroyed() || !BrowserWindow.fromWebContents(event.sender)) throw new Error('工作流只能由宿主工作台管理')
}
/** Do not surface filesystem paths, provider errors, source text or credentials over renderer IPC. */
export function miraFlowPublicError(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  const known = ['工作流请求无效', '工作流只能由宿主工作台管理', '第一方授权无效或应用已停用', '应用没有所需能力', '工作流服务不可用',
    '工作流已变化，请刷新后重试', '工作流已经运行中', '工作流未运行', '这个工作流不能原样续跑', '工作流定义不存在',
    '工作流已存在、已移除或已被修改，请刷新后重试', '工作流运行未获批准', '工作流所属会话无效', '工作流需要所属会话', '工作流项目不存在',
    '工作流续跑必须使用原模型和推理档位',
    '工作流智能体不存在，请刷新后重试', '工作流对话记录不可读取，请刷新后重试', '工作流对话已变化，请刷新后重试',
    '工作流产物不存在，请刷新后重试', '工作流产物不可读取，请刷新后重试', '此产物是预置看板，没有可下载的文件内容',
    '预览文件过大，请保存后查看',
    '不能覆盖工作流产物存储，请选择其他位置', '保存位置已变化，请重试', '请选择普通文件作为保存位置',
    '请先选择一个可用模型', '所选模型不属于当前供应商', '当前 Agent 模型不可用，请检查 Provider 配置']
  // Compiler diagnostics describe source the caller already owns; keep bounded actionable feedback.
  if (message.startsWith('工作流编译失败：\n')) return new Error(message.slice(0, 4000))
  return new Error(known.includes(message) ? message : error instanceof Error && error.name === 'AbortError' ? '工作流操作已取消' : '工作流操作失败，请刷新后重试')
}
export async function invokeMiraFlowRequest(flows: MiraFlowRequestPort | undefined, event: IpcMainInvokeEvent, raw: unknown, assertGrant?: () => void) {
  try {
    const assertAuthorized = () => { assertMiraFlowHostFrame(event); assertGrant?.() }
    assertAuthorized()
    const request = parseMiraFlowWorkbenchRequest(raw)
    if (!flows) throw new Error('工作流服务不可用')
    const result = await flows.request(event.sender, request, assertAuthorized)
    assertAuthorized() // Await cannot extend the lifetime of a revoked grant or closed window.
    return result
  } catch (error) { throw miraFlowPublicError(error) }
}
export function registerMiraFlowIpc({ flows }: { flows: MiraFlowRequestPort }) {
  ipcMain.handle('platform:mira-workflow', (event, request: unknown) => invokeMiraFlowRequest(flows, event, request))
}
