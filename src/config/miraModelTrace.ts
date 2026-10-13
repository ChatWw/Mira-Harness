export type MiraModelCallSource = 'main' | 'title' | 'summary' | 'memory' | 'subagent' | 'workflow' | 'verification'
export interface MiraModelCall {
  id: string
  sessionId: string
  runId?: string
  agentSessionId?: string
  source: MiraModelCallSource
  providerId: string
  providerName: string
  modelId: string
  startedAt: number
  completedAt?: number
  status: 'running' | 'completed' | 'failed' | 'aborted'
  request?: unknown
  response?: unknown
  error?: string
}
export interface MiraModelTrace {
  sessionId: string
  records: MiraModelCall[]
  sourceFile: string
  truncated: boolean
  warning?: string
}
export interface MiraTaskDiagnosticPaths { sessionFile: string; runtimeLog: string; modelTrace: string }
