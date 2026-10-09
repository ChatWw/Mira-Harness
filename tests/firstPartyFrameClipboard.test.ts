import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compile } from '@vue/compiler-dom'
import { parse } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import { renderToString } from '@vue/server-renderer'

const { descriptor } = parse(readFileSync(new URL('../src/pages/frontend/microAppHost/FirstPartyFrame.vue', import.meta.url), 'utf8'))
const render = new Function('Vue', compile(descriptor.template!.content, { mode: 'function', prefixIdentifiers: true }).code)(Vue)

describe('first-party iframe clipboard policy', () => {
  it.each([
    ['mira-harness', ['harness:workbench'], true],
    ['mira-harness', [], false],
    ['mira-novel-studio', ['harness:workbench'], false],
  ])('delegates write-only access to the authorized Harness frame: %s %j', async (appId, capabilities, allowed) => {
    const app = Vue.createSSRApp({
      render,
      setup: () => ({ manifest: { appId, capabilities }, url: 'https://mira.test/app', title: 'Mira', stage: undefined, frame: undefined, connect: () => undefined }),
    })
    const html = await renderToString(app)
    expect(html.includes('allow="clipboard-write *"')).toBe(allowed)
    expect(html).toContain('sandbox="allow-scripts allow-forms"')
    expect(html).not.toContain('clipboard-read')
    expect(html).not.toContain('allow-same-origin')
  })
})
