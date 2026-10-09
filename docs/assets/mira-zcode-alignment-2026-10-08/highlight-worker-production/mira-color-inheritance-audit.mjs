import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { createHighlighter } from 'shiki'
import { chromium } from '/Users/wujinbo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const evidence = dirname(fileURLToPath(import.meta.url))
const root = resolve(evidence, '../../../..')
const stylesheet = await readFile(resolve(root, 'dist/harness-react-app/app.css'), 'utf8')
const bundle = await build({ stdin: { contents: "import {renderMiraHighlightedCode} from './apps/harness-react/src/lib/code-highlighter';window.miraRenderCode=renderMiraHighlightedCode", resolveDir: root, loader: 'ts' }, bundle: true, platform: 'browser', format: 'esm', target: 'chrome110', write: false, logLevel: 'silent' })
const highlighter = await createHighlighter({ themes: ['github-light', 'github-dark'], langs: ['typescript', 'vue', 'python'] })
const singleLine = Array.from({ length: 2100 }, (_, index) => `export const single${index}: string = "Mira ${index}";`).join('')
const inputs = [
  { language: 'typescript', code: singleLine },
  { language: 'typescript', code: '/* first\r\nsecond */\r\nconst answer = "<Mira> & 你好";\r\n\r\n' },
  { language: 'vue', code: '<template><p>{{ title }}</p></template>\n<script setup lang="ts">const title = "Mira"</script>\n' },
  { language: 'python', code: 'text = """first\nsecond"""\nprint(text)\n' },
]
const neutral = { color: '#24292E', '--shiki-dark': '#E1E4E8' }
const keyword = { color: '#D73A49', '--shiki-dark': '#F97583' }
const synthetic = { language: 'text', result: { tokens: [[
  { content: 'plain', offset: 0, htmlStyle: neutral },
  { content: '順序', offset: 5, htmlStyle: { '--shiki-dark': '#E1E4E8', color: '#24292E' } },
  { content: ' other', offset: 7, htmlStyle: keyword },
  { content: ' bold', offset: 13, htmlStyle: { ...neutral, 'font-weight': 'bold', '--shiki-dark-font-weight': 'bold' } },
  { content: ' italic', offset: 18, htmlStyle: { ...neutral, 'font-style': 'italic', '--shiki-dark-font-style': 'italic' } },
  { content: ' underline', offset: 25, htmlStyle: { ...neutral, 'text-decoration': 'underline', '--shiki-dark-text-decoration': 'underline' } },
  { content: ' background', offset: 35, htmlStyle: { ...neutral, 'background-color': '#eee', '--shiki-dark-bg': '#333' } },
]] } }
const report = { startedAt: new Date().toISOString(), passed: false, boundary: 'Independent headless Chrome diagnostic. Current shared production renderer and built production CSS; tokenizer runs only in Node to prepare reference fixtures. No Worker, React scheduler, Electron, native input, INP or whole-product acceptance.', stylesheetSha256: createHash('sha256').update(stylesheet).digest('hex'), comparisons: [] }
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
  report.runtime = await browser.version()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.setContent('<!doctype html><html><body><div id="root"><div id="before" style="width:1100px;overflow:auto"></div><div id="after" style="width:1100px;overflow:auto"></div></div></body></html>')
  await page.addStyleTag({ content: stylesheet })
  await page.addScriptTag({ type: 'module', content: Buffer.from(bundle.outputFiles[0].contents).toString() })
  await page.waitForFunction(() => typeof window.miraRenderCode === 'function')
  for (const themes of [['github-light', 'github-dark'], ['github-dark', 'github-light']]) {
    const cases = inputs.map(input => {
      const { grammarState, ...result } = highlighter.codeToTokens(input.code, { lang: input.language, themes: { light: themes[0], dark: themes[1] }, tokenizeTimeLimit: 0, tokenizeMaxLineLength: 0 })
      return { language: input.language, result }
    })
    cases.push(synthetic)
    for (const item of cases) for (const dark of [false, true]) for (const surface of ['completed', 'file', 'streaming']) {
      const comparison = await page.evaluate(({ item, dark, surface }) => {
        document.documentElement.classList.toggle('dark', dark)
        const escapeHtml = value => value.replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character])
        // Exact prior serializer, used only as the visual and content reference.
        const prior = (result, language) => {
          const style = result.rootStyle || (result.fg && result.bg ? `background-color:${result.bg};color:${result.fg}` : '')
          const lines = result.tokens.map(line => `<span class="line">${line.map(token => {
            const tokenStyle = Object.entries(token.htmlStyle || {}).map(([name, value]) => `${name}:${value}`).join(';')
            return `<span${tokenStyle ? ` style="${escapeHtml(tokenStyle)}"` : ''}>${escapeHtml(token.content)}</span>`
          }).join('')}</span>`).join('\n')
          return `<pre class="shiki"${style ? ` style="${escapeHtml(style)}"` : ''}><code class="${escapeHtml(`language-${language}`)}">${lines}</code></pre>`
        }
        const classes = surface === 'completed' ? 'pilot-markdown' : surface === 'file' ? 'mira-file-source' : 'dark:[&_.shiki]:text-[var(--shiki-dark,inherit)]! dark:[&_.shiki]:bg-[var(--shiki-dark-bg,transparent)]! dark:[&_.shiki_span]:text-[var(--shiki-dark,inherit)]! dark:[&_.shiki_span]:bg-[var(--shiki-dark-bg,transparent)]!'
        const before = document.getElementById('before'), after = document.getElementById('after')
        before.className = classes; after.className = classes
        before.innerHTML = prior(item.result, item.language)
        after.innerHTML = window.miraRenderCode(item.result, item.language)
        if (before.textContent !== after.textContent) throw new Error('Full source changed')
        const properties = ['color', 'backgroundColor', 'fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'textDecorationLine', 'textDecorationColor', 'textDecorationStyle', 'lineHeight']
        const records = element => {
          const walker = document.createTreeWalker(element.querySelector('code'), NodeFilter.SHOW_TEXT)
          const output = []
          while (walker.nextNode()) {
            const node = walker.currentNode, computed = getComputedStyle(node.parentElement)
            if (node.textContent) output.push({ text: node.textContent, style: JSON.stringify(properties.map(name => computed[name])) })
          }
          return output
        }
        const baseline = records(before), candidate = records(after)
        let left = 0, right = 0, leftOffset = 0, rightOffset = 0, characters = 0
        while (left < baseline.length && right < candidate.length) {
          const a = baseline[left], b = candidate[right]
          const length = Math.min(a.text.length - leftOffset, b.text.length - rightOffset)
          if (a.text.slice(leftOffset, leftOffset + length) !== b.text.slice(rightOffset, rightOffset + length) || a.style !== b.style) throw new Error(`Character/style mismatch at ${characters}: ${a.style} / ${b.style}`)
          characters += length; leftOffset += length; rightOffset += length
          if (leftOffset === a.text.length) { left++; leftOffset = 0 }
          if (rightOffset === b.text.length) { right++; rightOffset = 0 }
        }
        if (left !== baseline.length || right !== candidate.length) throw new Error('Character count mismatch')
        return { surface, dark, characters, perCharacterComputedStylesEqual: true, fullSourceEqual: true, beforeElements: before.querySelectorAll('*').length, afterElements: after.querySelectorAll('*').length, scrollWidthEqual: before.scrollWidth === after.scrollWidth }
      }, { item, dark, surface })
      assert.equal(comparison.scrollWidthEqual, true)
      report.comparisons.push({ language: item.language, themes, ...comparison })
    }
  }
  report.passed = true
} catch (error) {
  report.failure = { message: error.message, stack: error.stack }
  process.exitCode = 1
} finally {
  await browser.close()
  highlighter.dispose()
  report.finishedAt = new Date().toISOString()
  await writeFile(resolve(evidence, 'mira-color-inheritance-results.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ passed: report.passed, comparisons: report.comparisons.length, failure: report.failure?.message }))
}
