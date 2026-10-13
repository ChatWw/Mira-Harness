/** Public model diagnostics contain no credentials or provider response objects. */
export interface MiraModelError {
  code: 'MODEL_REQUEST_FAILED'
  message: string
  detail: string
}

export const MIRA_MODEL_ERROR_MESSAGE = '模型请求失败，请查看详情或检查模型设置'
