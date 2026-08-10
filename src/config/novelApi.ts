export interface NovelApiSlotConfig {
  endpoint: string
  apiKey: string
  model: string
}

export interface NovelApiConfig {
  gen: NovelApiSlotConfig
  gen2: NovelApiSlotConfig
}

export const NOVEL_API_PREFERENCE_KEY = 'novelApi'

export const EMPTY_NOVEL_API_CONFIG: NovelApiConfig = {
  gen: { endpoint: '', apiKey: '', model: '' },
  gen2: { endpoint: '', apiKey: '', model: '' },
}
