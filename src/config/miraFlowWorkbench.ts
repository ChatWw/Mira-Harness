import { isPermissionMode, type ModelSelection, type PermissionMode } from './harness'
import { validateMiraWorkflowMeta, type MiraWorkflowDocument, type MiraWorkflowEntry, type MiraWorkflowPreview, type MiraWorkflowScope, type MiraWorkflowWrite } from './miraWorkflows'
import type { ActorRecord, NodeRecord, RunRecord, StoredEvent } from '../../packages/mira-flow-kit/src/engine/mira-types'
import type { MiraFlowReviewGraph } from './miraFlowReview'
import type { MiraFlowActorConversationPage } from './miraFlowConversation'
export type { MiraFlowActorConversationPage, MiraFlowConversationMessage, MiraFlowConversationPart } from './miraFlowConversation'

/** Serializable workbench contract. Executables, drivers and host filesystem roots never cross it. */
export type MiraFlowWorkbenchRequest =
  | { action: 'definitions.list'; projectId?: string }
  | { action: 'definitions.read'; projectId?: string; name: string; scope?: MiraWorkflowScope }
  | { action: 'definitions.preview' | 'definitions.save'; projectId?: string; input: MiraWorkflowWrite }
  | { action: 'runs.start'; projectId: string; name: string; scope: MiraWorkflowScope; args?: Record<string, unknown>; revision: string; selection: ModelSelection; permissionMode?: PermissionMode }
  | { action: 'runs.list'; sessionId?: string; projectId?: string }
  | { action: 'runs.snapshot'; sessionId: string; runId: string; afterSequence?: number; limit?: number }
  | { action: 'runs.stop'; sessionId: string; runId: string }
  | { action: 'runs.resume'; sessionId: string; runId: string; selection: ModelSelection }
  | { action: 'runs.concurrency'; sessionId: string; runId: string; maxConcurrency: number }
  | { action: 'artifacts.read' | 'artifacts.save'; sessionId: string; runId: string; artifactId: string; version: number }
  | { action: 'actors.conversation'; sessionId: string; runId: string; siteId: string; ordinal: number; offset?: number; limit?: number }

export interface MiraFlowRunSnapshot { run: RunRecord; actors: ActorRecord[]; nodes: NodeRecord[]; events: StoredEvent[]; selection?: ModelSelection; graph?: MiraFlowReviewGraph }
export interface MiraFlowRunIdentity { sessionId: string; runId: string }
export interface MiraFlowActorConversationIdentity extends MiraFlowRunIdentity { siteId: string; ordinal: number }
export interface MiraFlowArtifactContent { contentType: string; bytes: number; dataBase64: string; title: string }
export interface MiraFlowArtifactSaveResult { saved: boolean }
export type MiraFlowWorkbenchResult = MiraWorkflowEntry[] | MiraWorkflowDocument | MiraWorkflowPreview | RunRecord[] | MiraFlowRunSnapshot | MiraFlowRunIdentity | MiraFlowActorConversationPage | MiraFlowArtifactContent | MiraFlowArtifactSaveResult | undefined

const INVALID = '工作流请求无效'
function invalid(): never { throw new Error(INVALID) }
const plain = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)))
function only(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) invalid()
}
function id(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)) invalid()
}
function name(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(value) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value) || value.endsWith('.')) invalid()
}
function revision(value: unknown) { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) invalid() }
function scope(value: unknown) { if (value !== 'global' && value !== 'project') invalid() }
function model(value: unknown) {
  if (!plain(value)) invalid()
  only(value, ['providerId', 'modelId', 'thinkingLevel'])
  id(value.providerId)
  // Provider model ids can include namespaces, unlike session/project identity.
  if (typeof value.modelId !== 'string' || !value.modelId.trim() || value.modelId.length > 256 || /[\u0000-\u001f\u007f]/.test(value.modelId)) invalid()
  if (value.thinkingLevel !== undefined && !['off', 'low', 'medium', 'high'].includes(value.thinkingLevel as string)) invalid()
}
/** Reject non-JSON, accessors, cycles, unusual prototypes and prototype-polluting keys before cloning. */
function json(value: unknown, seen = new Set<object>(), depth = 0, omitUndefined = true): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return
  if (depth > 64 || typeof value !== 'object' || !value || seen.has(value) || !Array.isArray(value) && !plain(value)) invalid()
  seen.add(value)
  if (Array.isArray(value) && Object.keys(value).length !== value.length) invalid()
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (Array.isArray(value) && key === 'length') continue
    if (!descriptor.enumerable || !('value' in descriptor) || ['__proto__', 'constructor', 'prototype'].includes(key)) invalid()
    if (descriptor.value !== undefined) json(descriptor.value, seen, depth + 1, omitUndefined)
    else if (Array.isArray(value) || !omitUndefined) invalid()
  }
  if (Object.getOwnPropertySymbols(value).length) invalid()
  seen.delete(value)
}
/** Runtime parser stays app-free: pure type imports do not load the compiler into Vue/React. */
export function parseMiraFlowWorkbenchRequest(value: unknown): MiraFlowWorkbenchRequest {
  try {
    if (!plain(value)) invalid()
    json(value)
    if (value.action === 'runs.start' && value.args !== undefined) json(value.args, new Set(), 0, false)
    const serialized = JSON.stringify(value)
    if (new TextEncoder().encode(serialized).length > 512 * 1024) invalid()
    const request = JSON.parse(serialized) as Record<string, unknown>
    if (request.projectId !== undefined) id(request.projectId)
    switch (request.action) {
      case 'definitions.list': only(request, ['action', 'projectId']); break
      case 'definitions.read':
        only(request, ['action', 'projectId', 'name', 'scope']); name(request.name)
        if (request.scope !== undefined) scope(request.scope)
        if (request.scope === 'project' && !request.projectId) invalid()
        break
      case 'definitions.preview':
      case 'definitions.save': {
        only(request, ['action', 'projectId', 'input'])
        if (!plain(request.input)) invalid()
        const input = request.input
        only(input, ['scope', 'name', 'meta', 'script', 'expectedRevision'])
        scope(input.scope); name(input.name); validateMiraWorkflowMeta(input.meta)
        if (input.scope === 'project' && !request.projectId) invalid()
        if (typeof input.script !== 'string' || new TextEncoder().encode(input.script).length > 256 * 1024) invalid()
        if (input.expectedRevision !== undefined) revision(input.expectedRevision)
        break
      }
      case 'runs.start':
        only(request, ['action', 'projectId', 'name', 'scope', 'args', 'revision', 'selection', 'permissionMode'])
        id(request.projectId); name(request.name); scope(request.scope); revision(request.revision); model(request.selection)
        if (request.args !== undefined && (!plain(request.args) || new TextEncoder().encode(JSON.stringify(request.args)).length > 32 * 1024)) invalid()
        if (request.permissionMode !== undefined && !isPermissionMode(request.permissionMode)) invalid()
        break
      case 'runs.list':
        only(request, ['action', 'sessionId', 'projectId'])
        if (request.sessionId !== undefined) id(request.sessionId)
        break
      case 'runs.snapshot':
        only(request, ['action', 'sessionId', 'runId', 'afterSequence', 'limit']); id(request.sessionId); id(request.runId)
        if (request.afterSequence !== undefined && (!Number.isSafeInteger(request.afterSequence) || Number(request.afterSequence) < -1)) invalid()
        if (request.limit !== undefined && (!Number.isSafeInteger(request.limit) || Number(request.limit) < 1 || Number(request.limit) > 500)) invalid()
        break
      case 'runs.stop': only(request, ['action', 'sessionId', 'runId']); id(request.sessionId); id(request.runId); break
      case 'runs.resume': only(request, ['action', 'sessionId', 'runId', 'selection']); id(request.sessionId); id(request.runId); model(request.selection); break
      case 'runs.concurrency':
        only(request, ['action', 'sessionId', 'runId', 'maxConcurrency']); id(request.sessionId); id(request.runId)
        if (!Number.isSafeInteger(request.maxConcurrency) || Number(request.maxConcurrency) < 1) invalid()
        break
      case 'actors.conversation':
        only(request, ['action', 'sessionId', 'runId', 'siteId', 'ordinal', 'offset', 'limit']); id(request.sessionId); id(request.runId)
        // Compiler site ids contain '#'; they remain journal keys, never host paths.
        if (typeof request.siteId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:#-]{0,255}$/.test(request.siteId)
          || !Number.isSafeInteger(request.ordinal) || Number(request.ordinal) < 1) invalid()
        if (request.offset !== undefined && (!Number.isSafeInteger(request.offset) || Number(request.offset) < 0)) invalid()
        if (request.limit !== undefined && (!Number.isSafeInteger(request.limit) || Number(request.limit) < 1 || Number(request.limit) > 100)) invalid()
        break
      case 'artifacts.read':
      case 'artifacts.save':
        only(request, ['action', 'sessionId', 'runId', 'artifactId', 'version']); id(request.sessionId); id(request.runId)
        if (typeof request.artifactId !== 'string' || !/^[A-Za-z0-9_.-]{1,64}$/.test(request.artifactId)
          || !Number.isSafeInteger(request.version) || Number(request.version) < 1 || Number(request.version) > 16) invalid()
        break
      default: invalid()
    }
    return request as unknown as MiraFlowWorkbenchRequest
  } catch { throw new Error(INVALID) }
}
