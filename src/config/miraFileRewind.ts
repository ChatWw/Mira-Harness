/** File recovery preview adapted from ZCode ConversationFileRewindDialog.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode. */
export type MiraFileRewindReason = 'checkpoint_missing' | 'checkpoint_unavailable' | 'operation_interrupted' | 'external_modified' | 'workspace_changed' | 'file_read_failed' | 'history_limit' | 'recovery_incomplete'
export interface MiraFileRewindFile { path: string; operationCount: number; action?: 'restore' | 'delete'; reason?: MiraFileRewindReason }
export interface MiraFileRewindPreview {
  messageId: string
  safeFiles: MiraFileRewindFile[]
  unsafeFiles: MiraFileRewindFile[]
  ignoredTools: Array<{ name: string; count: number }>
  canApply: boolean
  snapshotToken?: string
  recoveryId?: string
}
export interface MiraFileRewindResult { applied: boolean; preview: MiraFileRewindPreview; message: string }
export type MiraHistoryEditWorkspace = { mode: 'preserve' } | { mode: 'rewind'; snapshotToken: string }
export interface MiraHistoryEditBlocked { disposition: 'blocked'; preview: MiraFileRewindPreview; message: string }
export const MIRA_FILE_REWIND_REASONS: Record<MiraFileRewindReason, string> = {
  checkpoint_missing: '这次修改未保存文件快照', checkpoint_unavailable: '无法保存可安全恢复的文件快照',
  operation_interrupted: '修改中断，缺少完成后的快照', external_modified: '文件在记录之外被修改',
  workspace_changed: '文件属于其他工作目录', file_read_failed: '无法安全读取当前文件', history_limit: '修改记录超过整段预览上限',
  recovery_incomplete: '上次恢复中断，需先撤销未完成的恢复',
}
