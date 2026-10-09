import { miraCodeHighlighter, miraCodeThemes } from './code-highlighter'

export const highlightFilePreview = (code: string, language: string, signal?: AbortSignal) =>
  miraCodeHighlighter.highlight({ code, language, themes: miraCodeThemes }, signal)
