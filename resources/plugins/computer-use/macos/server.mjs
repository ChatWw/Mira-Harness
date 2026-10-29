// MCP adapter for OrderG-X's desktop tools; no DSH runtime or attachment storage required.
import { createInterface } from 'node:readline'
import { apply, close, dispose, prepareFeedback } from './plugin/index.js'

const tools = new Map()
apply({
  tools: { register: tool => tools.set(tool.name, tool) },
  get: name => name === 'attachments' ? {
    saveImages: async images => images.map(image => ({ data: image.data.toString('base64'), mimeType: image.mediaType })),
  } : undefined,
})
let stopped = false
const input = new Set(['desktop_click', 'desktop_type', 'desktop_launch', 'desktop_scroll', 'desktop_drag', 'desktop_key'])
const send = message => process.stdout.write(JSON.stringify(message) + '\n')
const shutdown = async () => { if (stopped) return; stopped = true; await close(); process.exit(0) }
const lines = createInterface({ input: process.stdin })
// Serialize tools even if an MCP caller sends overlapping requests.
let queue = Promise.resolve()
lines.on('line', line => {
  let message
  try { message = JSON.parse(line) } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } }); return }
  if (message.method === 'mira/shutdown' || message.method === 'notifications/cancelled') { shutdown(); return }
  if (message.id === undefined) return
  queue = queue.then(async () => {
    const { id, method, params } = message
    let result
    try {
      if (stopped) throw new Error('电脑控制已停止')
      if (method === 'initialize') result = { protocolVersion: params?.protocolVersion ?? '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'mira-mac-computer-use', version: '0.4.0' } }
      else if (method === 'ping') result = {}
      else if (method === 'tools/list') result = { tools: [...tools.values()].map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.parameters })) }
      else if (method === 'tools/call') {
        try {
          const tool = tools.get(params?.name)
          if (!tool) throw new Error('Unknown desktop tool')
          const args = params.arguments ?? {}
          if (input.has(tool.name)) await prepareFeedback(tool.name)
          const value = await tool.execute(args)
          result = { content: tool.output.render(args, value).map(block => block.type === 'image' ? { type: 'image', ...block.attachment } : block) }
        } catch (error) { result = { isError: true, content: [{ type: 'text', text: error.message }] } }
      } else { send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } }); return }
      send({ jsonrpc: '2.0', id, result })
    } catch (error) { send({ jsonrpc: '2.0', id, error: { code: -32603, message: error.message } }) }
  })
})
lines.on('close', shutdown)
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
process.on('exit', dispose)
