export type NovelModelRole = 'authoring' | 'automation'

export interface NovelModelProfile {
  endpoint: string
  apiKey: string
  modelId: string
}

export interface NovelModelProfiles {
  authoring: NovelModelProfile
  automation: NovelModelProfile
}

export interface NovelStorySetup {
  background: string
  characters: string
  relationships: string
  plot: string
  writingStyle: string
}

export interface NovelChapter {
  id: string
  title: string
  outline: string
  content: string
}

export interface NovelKnowledgeEntry {
  id: string
  category: string
  title: string
  content: string
  tags: string[]
}

export interface NovelMindMapNode {
  id: string
  title: string
  children: NovelMindMapNode[]
}

export type NovelPromptScope = 'outline' | 'chapter' | 'content' | 'selection'

export interface NovelPromptTemplate {
  id: string
  name: string
  scope: NovelPromptScope
  content: string
}

export interface NovelAssistantMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

export interface NovelGeneratedIdea {
  id: string
  title: string
  summary: string
  createdAt: number
}

export interface NovelProjectDocument {
  version: 1
  id: string
  title: string
  createdAt: number
  updatedAt: number
  story: NovelStorySetup
  outline: string
  chapters: NovelChapter[]
  knowledge: NovelKnowledgeEntry[]
  mindMap: NovelMindMapNode
  prompts: NovelPromptTemplate[]
  assistantMessages: NovelAssistantMessage[]
  generatedIdeas: NovelGeneratedIdea[]
  optimizer: { mode: 'sentence' | 'paragraph'; iterations: number }
  splitterSource: string
}

export interface NovelProjectSummary {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  chapterCount: number
}

export interface NovelWorkspaceSettings {
  shortcuts: string[]
}

export const NOVEL_MODEL_PROFILES_PREFERENCE_KEY = 'novelModelProfiles'

export const EMPTY_NOVEL_MODEL_PROFILE: NovelModelProfile = {
  endpoint: '',
  apiKey: '',
  modelId: '',
}

export const EMPTY_NOVEL_MODEL_PROFILES: NovelModelProfiles = {
  authoring: { ...EMPTY_NOVEL_MODEL_PROFILE },
  automation: { ...EMPTY_NOVEL_MODEL_PROFILE },
}

export const DEFAULT_NOVEL_WORKSPACE_SETTINGS: NovelWorkspaceSettings = {
  shortcuts: [],
}

export const DEFAULT_NOVEL_PROMPTS: NovelPromptTemplate[] = [
  {
    id: 'outline',
    name: '生成故事总纲',
    scope: 'outline',
    content: '基于作品设定中的背景、人物、关系、剧情和写作风格，生成一个有清晰冲突、转折与伏笔的小说总纲。',
  },
  {
    id: 'chapter',
    name: '生成章节细纲',
    scope: 'chapter',
    content: '基于总纲和当前章节标题，生成本章的核心事件、人物动机、冲突、伏笔与结尾钩子。',
  },
  {
    id: 'content',
    name: '续写正文',
    scope: 'content',
    content: '保持当前作品的叙事视角、人物关系和文风，续写正文。避免复述已有内容，推进明确事件。',
  },
  {
    id: 'polish',
    name: '润色选中文本',
    scope: 'selection',
    content: '润色选中文本，保留剧情事实和叙事视角，提升画面感、节奏与表达的自然度。只返回改写后的文本。',
  },
]

function createId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function createNovelProject(title = '未命名作品'): NovelProjectDocument {
  const now = Date.now()
  return {
    version: 1,
    id: createId(),
    title,
    createdAt: now,
    updatedAt: now,
    story: { background: '', characters: '', relationships: '', plot: '', writingStyle: '' },
    outline: '',
    chapters: [],
    knowledge: [],
    mindMap: { id: createId(), title, children: [] },
    prompts: DEFAULT_NOVEL_PROMPTS.map(template => ({ ...template })),
    assistantMessages: [],
    generatedIdeas: [],
    optimizer: { mode: 'paragraph', iterations: 1 },
    splitterSource: '',
  }
}

export function toNovelProjectSummary(project: NovelProjectDocument): NovelProjectSummary {
  return {
    id: project.id,
    title: project.title,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    chapterCount: project.chapters.length,
  }
}
