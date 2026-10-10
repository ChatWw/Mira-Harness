/** UI preflight only; the host validates bytes and determines the actual media type. */
export const MIRA_IMAGE_FILE_BYTES = 20 * 1024 * 1024
export const MIRA_TEXT_FILE_BYTES = 256 * 1024
export const MIRA_PASTED_TEXT_THRESHOLD = 15 * 1024
const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }

export function attachmentImageType(path: string) { return IMAGE_TYPES[path.split('.').pop()?.toLowerCase() || ''] }

export function validateAttachmentFiles(files: readonly File[], existingCount: number, existing: readonly { mediaType?: string; size?: number }[] = []) {
  if (existingCount + files.length > 12) throw new Error('一次最多引用 12 个文件，请先移除部分文件。')
  let imageBytes = existing.reduce((sum, file) => sum + (file.mediaType ? file.size || 0 : 0), 0)
  let textBytes = existing.reduce((sum, file) => sum + (!file.mediaType ? file.size || 0 : 0), 0)
  for (const file of files) {
    const image = attachmentImageType(file.name) || file.type.startsWith('image/')
    if (file.type.startsWith('image/') && !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) throw new Error(`暂不支持这种图片格式：${file.name}，请使用 PNG、JPEG、GIF 或 WebP。`)
    if (file.size > (image ? MIRA_IMAGE_FILE_BYTES : MIRA_TEXT_FILE_BYTES)) throw new Error(`${file.name} 超过附件上限（图片 20 MiB，文本 256 KiB）。`)
    if (image) imageBytes += file.size
    else textBytes += file.size
  }
  if (imageBytes > 40 * 1024 * 1024 || textBytes > 1024 * 1024) throw new Error('附件总大小超过上限（图片 40 MiB，文本 1 MiB）。')
}

export function readAttachmentFile(file: File): Promise<{ name: string; mediaType: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`无法读取附件：${file.name}`))
    reader.onabort = () => reject(new Error('附件读取已取消'))
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const comma = result.indexOf(',')
      if (comma < 0) { reject(new Error(`无法读取附件：${file.name}`)); return }
      resolve({ name: file.name, mediaType: file.type || attachmentImageType(file.name) || 'text/plain', data: result.slice(comma + 1) })
    }
    reader.readAsDataURL(file)
  })
}
