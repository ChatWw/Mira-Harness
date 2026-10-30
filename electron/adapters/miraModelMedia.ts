import type { Context, ProviderStreams, UserMessage } from '@earendil-works/pi-ai'
import type { HarnessMessageAttachment, ProviderModelConfig } from '../../src/config/harness'

/** Host-only envelope: SDK text/image content remains valid; binary parts are encoded by the provider. */
export interface MiraMediaMessage extends UserMessage {
  miraMedia?: HarnessMessageAttachment[]
}

export function unsupportedMiraMedia(model: ProviderModelConfig, attachments: readonly { mediaType?: string }[]) {
  if (attachments.some(file => file.mediaType === 'application/pdf') && model.pdfInput !== true) return 'PDF'
  if (attachments.some(file => file.mediaType?.startsWith('video/')) && model.videoInput !== true) return '视频'
  return undefined
}

export function miraCompatibleMediaApi(api: ProviderStreams, configured: ProviderModelConfig): ProviderStreams {
  const optionsFor = (context: Context, options: Parameters<ProviderStreams['stream']>[2]) => {
    const users = context.messages.filter((message): message is MiraMediaMessage => message.role === 'user' && (typeof message.content === 'string' || message.content.length > 0))
    if (!users.some(message => message.miraMedia?.length)) return options
    return { ...options, onPayload: async (raw: unknown, model: Parameters<ProviderStreams['stream']>[0]) => {
      if (model.api !== 'openai-completions') throw new Error('当前请求协议不支持 PDF 或视频附件，请使用 OpenAI Completions 协议')
      const changed = await options?.onPayload?.(raw, model)
      const payload = (changed ?? raw) as { messages?: Array<{ role: string; content?: unknown }> }
      if (!payload || !Array.isArray(payload.messages)) throw new Error('模型附件请求格式无效')
      const serializedUsers = payload.messages.filter(message => message.role === 'user')
      // Pi preserves user order while inserting tool-result repair messages. Never attach to a guessed owner.
      if (serializedUsers.length !== users.length) throw new Error('模型附件消息归属不一致，已取消请求')
      let index = 0
      return { ...payload, messages: payload.messages.map(message => {
        if (message.role !== 'user') return message
        const media = users[index++]!.miraMedia
        if (!media?.length) return message
        const unsupported = unsupportedMiraMedia(configured, media)
        if (unsupported) throw new Error(`所选模型不支持${unsupported}输入，请切换模型或在模型设置中确认该能力`)
        const parts = media.map(file => {
          if (!file.content) throw new Error('模型附件内容未加载，已取消请求')
          if (file.mediaType === 'application/pdf') return { type: 'file', file: { filename: file.name, file_data: `data:application/pdf;base64,${file.content}` } }
          if (file.mediaType?.startsWith('video/')) return { type: 'video_url', video_url: { url: `data:${file.mediaType};base64,${file.content}` } }
          throw new Error('模型附件媒体类型无效')
        })
        const content = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : Array.isArray(message.content) ? message.content : []
        return { ...message, content: [...content, ...parts] }
      }) }
    } }
  }
  return {
    stream: (model, context, options) => api.stream(model, context, optionsFor(context, options)),
    streamSimple: (model, context, options) => api.streamSimple(model, context, optionsFor(context, options)),
  }
}
