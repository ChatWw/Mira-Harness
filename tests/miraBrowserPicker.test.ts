// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { buildMiraBrowserPicker, cancelMiraBrowserPicker, readMiraBrowserElement, type MiraBrowserPickResult } from '../src/platform/miraBrowserPicker'
import { miraBrowserPrompt, miraBrowserReferences, miraBrowserPromptBody, miraBrowserReferenceElement, parseMiraBrowserSnapshots, restoreMiraBrowserPromptDocument } from '../apps/harness-react/src/lib/mira-browser-reference'
import { createMiraPromptDocument, serializeMiraPromptDocument, validateMiraPromptDocument } from '../apps/harness-react/src/lib/prompt-editor-document'

afterEach(() => { window.eval(cancelMiraBrowserPicker(1)); window.eval(cancelMiraBrowserPicker(2)); document.body.replaceChildren() })
const snapshot = () => ({ pageUrl: 'https://mira.test/page', pageTitle: 'Mira', tagName: 'button', role: 'button', accessibleName: '继续', selector: '#go', xpath: '/html[1]/body[1]/button[1]', text: '继续', nearbyText: '页面正文', htmlExcerpt: '<button id="go">继续</button>', attributes: 'id="go"', style: 'Color: rgb(0, 0, 0)', rect: { x: 10, y: 20, width: 80, height: 28 } })

describe('Mira native page element selection', () => {
  it('captures the clicked target without hover, suppresses navigation, sanitizes fields and restores the original cursor', async () => {
    document.body.innerHTML = '<main><input type="password" value="secret-password"><textarea>private-draft</textarea><a id="go" href="/next" onclick="alert(1)">继续</a></main>'
    document.documentElement.style.setProperty('cursor', 'help', 'important')
    const result = window.eval(buildMiraBrowserPicker(1)) as Promise<MiraBrowserPickResult>
    expect(document.querySelector('[data-mira-element-picker="overlay"]')).not.toBeNull()
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    document.getElementById('go')!.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    const value = await result
    expect(value.status).toBe('selected')
    if (value.status !== 'selected') throw Error('No selection')
    expect(value.element).toMatchObject({ tagName: 'a', role: 'link', selector: '#go', accessibleName: '继续' })
    expect(value.element.htmlExcerpt).not.toContain('onclick')
    expect(value.element.nearbyText).not.toContain('private-draft')
    expect(document.querySelector('[data-mira-element-picker]')).toBeNull()
    expect(document.documentElement.style.getPropertyValue('cursor')).toBe('help')
    expect(document.documentElement.style.getPropertyPriority('cursor')).toBe('important')
  })
  it('cancels old runs, ignores late cancellation of a new run, and Escape clears the active picker', async () => {
    const old = window.eval(buildMiraBrowserPicker(1)) as Promise<MiraBrowserPickResult>
    const current = window.eval(buildMiraBrowserPicker(2)) as Promise<MiraBrowserPickResult>
    await expect(old).resolves.toEqual({ status: 'cancelled' })
    window.eval(cancelMiraBrowserPicker(1))
    expect(document.querySelectorAll('[data-mira-element-picker="overlay"]')).toHaveLength(1)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await expect(current).resolves.toEqual({ status: 'cancelled' })
    expect(document.querySelector('[data-mira-element-picker]')).toBeNull()
  })
  it('excludes root and nested form values from parent HTML and text snapshots', async () => {
    document.body.innerHTML = '<section id="form"><input value="secret-value"><textarea>private-draft</textarea><button>继续</button></section>'
    const result = window.eval(buildMiraBrowserPicker(1)) as Promise<MiraBrowserPickResult>
    document.getElementById('form')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(JSON.stringify(await result)).not.toMatch(/secret-value|private-draft/)
  })
  it('bounds untrusted payloads and retains atomic snapshots across persistence and prompt serialization', () => {
    for (const bad of [{ ...snapshot(), text: 'x'.repeat(4001) }, { ...snapshot(), pageUrl: 'javascript:alert(1)' }, { ...snapshot(), rect: { x: NaN, y: 0, width: 1, height: 1 } }]) expect(readMiraBrowserElement(bad)).toBeUndefined()
    const document = createMiraPromptDocument('已有草稿'), selected = { sessionId: 'current', browserId: 'browser:one', element: snapshot() }
    const result = miraBrowserPrompt(selected, document)
    if ('error' in result) throw Error(result.error)
    document.parts.push({ type: 'reference', reference: result.reference })
    const restored = validateMiraPromptDocument(JSON.parse(JSON.stringify(document)))!
    expect(restored).toEqual(document)
    expect(serializeMiraPromptDocument(restored)).toContain('页面正文')
    expect(miraBrowserPrompt(selected, restored)).toHaveProperty('duplicate', true)
    for (let i = 1; i < 8; i++) { const next = miraBrowserPrompt({ ...selected, element: { ...selected.element, selector: `#item-${i}` } }, document); if ('error' in next) throw Error(next.error); document.parts.push({ type: 'reference', reference: next.reference }) }
    expect(miraBrowserPrompt({ ...selected, element: { ...selected.element, selector: '#ninth' } }, document)).toHaveProperty('error')
  })

  it('restores sent snapshots with trimmed boundaries and backticks without hiding malformed input', () => {
    const element = { ...snapshot(), text: '示例 ```json\n保持原文' }
    const result = miraBrowserPrompt({ sessionId: 'current', browserId: 'browser:one', element }, createMiraPromptDocument(''))
    if ('error' in result) throw Error(result.error)
    for (const text of [result.reference.text, result.reference.text.trim(), `正文${result.reference.text}`.trim()]) {
      const parsed = parseMiraBrowserSnapshots(text)
      expect(parsed.references).toHaveLength(1)
      expect(miraBrowserReferenceElement(parsed.references[0])).toEqual(element)
      const restored = restoreMiraBrowserPromptDocument(text)
      expect(miraBrowserReferences(restored)).toHaveLength(1)
      expect(miraBrowserPrompt({ sessionId: 'current', browserId: 'browser:one', element }, restored)).toHaveProperty('duplicate', true)
      expect(serializeMiraPromptDocument(miraBrowserPromptBody(restored))).toBe(text.startsWith('正文') ? '正文' : '')
    }
    for (const malformed of ['\n\n网页元素快照：\n```json\n{not json}\n```\n', result.reference.text.replace('https://mira.test/page', 'javascript:alert(1)')]) {
      expect(parseMiraBrowserSnapshots(malformed)).toEqual({ visibleText: malformed, references: [] })
    }
  })
})
