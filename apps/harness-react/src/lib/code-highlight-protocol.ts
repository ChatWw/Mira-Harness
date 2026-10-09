import type { TokensResult } from 'shiki/core'
import type { HighlightOptions } from 'streamdown'

// GrammarState contains class methods and stays inside the tokenizer owner.
export type MiraHighlightResult = Omit<TokensResult, 'grammarState'>
export type MiraHighlightRequest = { type: 'highlight'; id: number; options: HighlightOptions } | { type: 'cancel'; id: number }
export type MiraHighlightResponse = { type: 'ready' } | { type: 'result'; id: number; result: MiraHighlightResult } | { type: 'error'; id: number; message: string } | { type: 'cancelled'; id: number } | { type: 'loader-error'; message: string }

export const miraCodeThemes: [string, string] = ['github-light', 'github-dark']
export const highlightCancelled = () => new DOMException('代码高亮已取消', 'AbortError')
