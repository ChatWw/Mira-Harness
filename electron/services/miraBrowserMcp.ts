import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { WebContents } from 'electron'
import { miraBrowserAutomation, type MiraBrowserAutomation } from './miraBrowserAutomation'

const string = { type: 'string' }
const definitions = [
  ['browser_list', '列出当前任务的 Mira 内置浏览器标签页', {}, []],
  ['browser_open', '在当前任务的 Mira 内置浏览器中打开 HTTP(S) 网页，返回 browserId', { url: string }, ['url']],
  ['browser_navigate', '导航当前任务的内置标签页', { browserId: string, url: string }, ['browserId', 'url']],
  ['browser_snapshot', '读取主文档文本与可操作元素引用；不包含 iframe 内的元素。操作后重新读取以验证结果', { browserId: string }, ['browserId']],
  ['browser_click', '点击最近快照中的元素；失效时重新读取快照', { browserId: string, ref: string }, ['browserId', 'ref']],
  ['browser_fill', '替换最近快照引用的文本框内容', { browserId: string, ref: string, text: string }, ['browserId', 'ref', 'text']],
  ['browser_scroll', '垂直滚动网页（CSS 像素）', { browserId: string, deltaY: { type: 'number', minimum: -10000, maximum: 10000 } }, ['browserId', 'deltaY']],
  ['browser_screenshot', '截取当前任务内置网页的可见区域', { browserId: string }, ['browserId']],
] as const

/** Host-only MCP transport: identity and task scope come from the run, never model arguments. */
export async function createMiraBrowserTransport(owner: WebContents, sessionId: string, service: MiraBrowserAutomation = miraBrowserAutomation) {
  const server = new Server({ name: 'mira-embedded-browser', version: '0.2.0' }, { capabilities: { tools: {} } })
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: definitions.map(([name, description, properties, required]) => ({ name, description, inputSchema: { type: 'object' as const, properties, required: [...required], additionalProperties: false } })) }))
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    try {
      const definition = definitions.find(([name]) => name === request.params.name)
      const args = request.params.arguments || {}
      if (!definition || Object.keys(args).some(key => !Object.prototype.hasOwnProperty.call(definition[2], key)) || definition[3].some(key => !(key in args))) throw new Error('浏览器工具参数无效')
      const result = await service.execute(owner, sessionId, request.params.name, args, extra.signal)
      return { content: result?.image ? [{ type: 'image' as const, data: result.image, mimeType: 'image/png' }] : [{ type: 'text' as const, text: JSON.stringify(result) }] }
    } catch (error) { return { isError: true, content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }] } }
  })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return clientTransport
}
