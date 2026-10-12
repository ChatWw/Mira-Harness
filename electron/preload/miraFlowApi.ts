import { ipcRenderer } from 'electron'
import type { MiraFlowWorkbenchRequest } from '../../src/config/miraFlowWorkbench'

export const miraFlowApi = {
  requestMiraWorkflow: (request: MiraFlowWorkbenchRequest): Promise<unknown> => ipcRenderer.invoke('platform:mira-workflow', request),
}
