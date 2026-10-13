import { miraContextPromptBody, restoreMiraContextPromptDocument } from './mira-presentation-reference'
import { serializeMiraPromptDocument } from './prompt-editor-document'

/** The same canonical reference parser serves sent messages, history edit and task-find. */
export function miraUserPrompt(content: string) {
  const document = restoreMiraContextPromptDocument(content)
  const body = miraContextPromptBody(document)
  return { document, body, canonicalBody: serializeMiraPromptDocument(body), visibleBody: body.parts.map(part => part.type === 'text' ? part.text : part.reference.label).join('') }
}
