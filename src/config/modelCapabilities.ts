export const MODEL_TYPES = [
  { value: 'chat', label: '文本', icon: 'lucide:type' },
  { value: 'image', label: '图片', icon: 'lucide:image' },
  { value: 'embedding', label: '嵌入', icon: 'lucide:boxes' },
  { value: 'reranking', label: '重排', icon: 'lucide:arrow-down-up' },
] as const

export const MODEL_ABILITIES = [
  { key: 'reasoning', label: '推理', icon: 'lucide:lightbulb' },
  { key: 'toolCall', label: '工具', icon: 'lucide:wrench' },
] as const

export const MODEL_INPUTS = [
  { key: 'multimodal', label: '视觉', icon: 'lucide:eye' },
  { key: 'audioInput', label: '音频', icon: 'lucide:ear' },
  { key: 'videoInput', label: '视频', icon: 'lucide:video' },
] as const
