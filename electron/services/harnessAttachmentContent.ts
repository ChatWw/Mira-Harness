import { TextDecoder } from 'node:util'
import type { HarnessAttachmentImportFile, HarnessImageMediaType, HarnessMessageAttachment } from '../../src/config/harness'

export const HARNESS_ATTACHMENT_LIMITS = {
  count: 12,
  textFileBytes: 256 * 1024,
  textTotalBytes: 1024 * 1024,
  imageFileBytes: 20 * 1024 * 1024,
  imageTotalBytes: 40 * 1024 * 1024,
} as const
export const HARNESS_ATTACHMENT_PREFIX = 'mira-attachment:'

export function harnessAttachmentImageType(bytes: Buffer): HarnessImageMediaType | undefined {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'image/gif'
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return undefined
}

function assertImageStructure(bytes: Buffer, mediaType: HarnessImageMediaType) {
  // 校验容器签名与基本完整性；这不是图片解码器，provider 仍负责解码兼容性。
  const valid = mediaType === 'image/png'
    ? bytes.length >= 45 && bytes.readUInt32BE(8) === 13 && bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0 && bytes.subarray(-8, -4).toString('ascii') === 'IEND'
    : mediaType === 'image/jpeg'
      ? bytes.length >= 4 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217
      : mediaType === 'image/gif'
        ? bytes.length >= 14 && bytes.readUInt16LE(6) > 0 && bytes.readUInt16LE(8) > 0 && bytes[bytes.length - 1] === 59
        : bytes.length >= 20 && bytes.readUInt32LE(4) + 8 === bytes.length && ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16))
  if (!valid) throw new Error('图片附件内容不完整或签名无效')
}

export function harnessAttachmentFromBytes(path: string, name: string, bytes: Buffer, declaredMediaType?: string): HarnessMessageAttachment {
  const mediaType = harnessAttachmentImageType(bytes)
  if (mediaType) {
    if (bytes.length > HARNESS_ATTACHMENT_LIMITS.imageFileBytes) throw new Error('单张图片不得超过 20 MiB')
    assertImageStructure(bytes, mediaType)
    return { path, name, mediaType, size: bytes.length, content: bytes.toString('base64') }
  }
  if (declaredMediaType?.startsWith('image/')) throw new Error('图片附件签名无效；目前支持 PNG、JPEG、GIF 和 WebP')
  if (bytes.length > HARNESS_ATTACHMENT_LIMITS.textFileBytes) throw new Error(`引用文件过大：${name}；文本附件不得超过 256 KiB`)
  let content: string
  try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) } catch { throw new Error(`不支持引用二进制文件或非 UTF-8 文本：${name}`) }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(content)) throw new Error(`不支持引用二进制文件：${name}`)
  return { path, name, content }
}

export function decodeHarnessAttachmentImport(file: HarnessAttachmentImportFile): Buffer {
  const maxEncodedLength = Math.ceil(HARNESS_ATTACHMENT_LIMITS.imageFileBytes / 3) * 4
  if (typeof file.data !== 'string' || file.data.length > maxEncodedLength) throw new Error('单张图片不得超过 20 MiB；文本附件不得超过 256 KiB')
  const padding = file.data.endsWith('==') ? 2 : file.data.endsWith('=') ? 1 : 0
  const firstPadding = file.data.indexOf('=')
  if (file.data.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(file.data) || (firstPadding !== -1 && firstPadding !== file.data.length - padding)) throw new Error('附件必须使用规范的 base64 编码')
  const bytes = Buffer.from(file.data, 'base64')
  if (bytes.toString('base64') !== file.data) throw new Error('附件必须使用规范的 base64 编码')
  return bytes
}

export function assertHarnessAttachmentTotals(attachments: readonly HarnessMessageAttachment[]) {
  if (attachments.length > HARNESS_ATTACHMENT_LIMITS.count) throw new Error('一次最多引用 12 个文件')
  let textBytes = 0, imageBytes = 0
  for (const attachment of attachments) {
    if (attachment.mediaType) imageBytes += attachment.content.length / 4 * 3 - (attachment.content.endsWith('==') ? 2 : attachment.content.endsWith('=') ? 1 : 0)
    else textBytes += Buffer.byteLength(attachment.content, 'utf8')
  }
  if (textBytes > HARNESS_ATTACHMENT_LIMITS.textTotalBytes) throw new Error('引用文件总大小超过限制；文本附件总大小不得超过 1 MiB')
  if (imageBytes > HARNESS_ATTACHMENT_LIMITS.imageTotalBytes) throw new Error('图片附件总大小不得超过 40 MiB')
}
