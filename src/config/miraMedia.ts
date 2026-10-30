export type MiraMediaKind = 'audio' | 'video' | 'pdf' | 'word' | 'sheet' | 'presentation'
export const MIRA_OFFICE_PREVIEW_LIMIT = 25 * 1024 * 1024
const formats: Record<string, { kind: MiraMediaKind; mediaType: string }> = {
  doc: { kind: 'word', mediaType: 'application/msword' },
  pptx: { kind: 'presentation', mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  docx: { kind: 'word', mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  xlsx: { kind: 'sheet', mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  xlsm: { kind: 'sheet', mediaType: 'application/vnd.ms-excel.sheet.macroEnabled.12' },
  xls: { kind: 'sheet', mediaType: 'application/vnd.ms-excel' },
  pdf: { kind: 'pdf', mediaType: 'application/pdf' },
  mp4: { kind: 'video', mediaType: 'video/mp4' }, mov: { kind: 'video', mediaType: 'video/quicktime' },
  webm: { kind: 'video', mediaType: 'video/webm' }, m4v: { kind: 'video', mediaType: 'video/x-m4v' },
  mp3: { kind: 'audio', mediaType: 'audio/mpeg' }, wav: { kind: 'audio', mediaType: 'audio/wav' },
  m4a: { kind: 'audio', mediaType: 'audio/mp4' }, ogg: { kind: 'audio', mediaType: 'audio/ogg' },
  opus: { kind: 'audio', mediaType: 'audio/opus' }, flac: { kind: 'audio', mediaType: 'audio/flac' },
  weba: { kind: 'audio', mediaType: 'audio/webm' },
}
export function miraMediaFormat(path: string) {
  const extension = path.split(/[\\/]/).pop()?.split('.').pop()?.toLowerCase() ?? ''
  return Object.prototype.hasOwnProperty.call(formats, extension) ? formats[extension] : undefined
}
export interface MiraMediaPreview {
  id: string; path: string; kind: MiraMediaKind; mediaType: string; byteLength: number; url: string
  sourceFingerprint?: string
  workspaceIdentity?: string
}
