import type { NovelProjectDocument } from '@/config/novel'

export type Stage = 'setup' | 'outline' | 'chapter' | 'content'
export type Tool = 'knowledge' | 'prompts' | 'mindMap' | 'ideas' | 'splitter' | 'optimizer' | 'shortcuts'
export type EditorTarget = 'outline' | 'chapter' | 'content'

export type StageDefinition = { key: Stage; title: string; icon: string }
export type SetupField = { key: keyof NovelProjectDocument['story']; label: string; placeholder: string }
export type QuickAction = { key: string; title: string; icon: string }
