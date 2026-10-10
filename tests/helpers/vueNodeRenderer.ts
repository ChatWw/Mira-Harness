import { readFileSync } from 'node:fs'
import { compile } from '@vue/compiler-dom'
import { compileScript, parse } from '@vue/compiler-sfc'
import { ScriptTarget, transpileModule } from 'typescript'
import * as Vue from 'vue'
import { createRenderer, ssrContextKey, type Component, type VNode } from 'vue'

/** Vitest imports SFC setup through its SSR pipeline; compile its real template for the Node renderer. */
export function withVueClientRender(component: Component, source: URL): Component {
  const { descriptor } = parse(readFileSync(source, 'utf8'))
  const bindings = compileScript(descriptor, { id: source.pathname }).bindings
  const code = compile(descriptor.template!.content, { mode: 'function', prefixIdentifiers: true, bindingMetadata: bindings, expressionPlugins: ['typescript'] }).code
  return { ...component, render: new Function('Vue', transpileModule(code, { compilerOptions: { target: ScriptTarget.ESNext } }).outputText)(Vue) }
}

export type VueTestNode = {
  type: string; text: string; props: Record<string, unknown>; children: VueTestNode[]; parent?: VueTestNode
  contentWindow?: { postMessage: (...args: unknown[]) => void }
}

/** Run real Vue ref, watch and unmount lifecycles in Node without simulating browser layout. */
export function createVueNodeRenderer() {
  const node = (type: string, text = ''): VueTestNode => ({ type, text, props: {}, children: [] })
  const renderer = createRenderer<VueTestNode, VueTestNode>({
    createElement: type => node(type), createText: text => node('#text', text), createComment: text => node('#comment', text),
    setText: (target, text) => { target.text = text }, setElementText: (target, text) => { target.text = text; target.children = [] },
    parentNode: target => target.parent || null,
    nextSibling: target => target.parent?.children[target.parent.children.indexOf(target) + 1] || null,
    patchProp: (target, key, _previous, next) => { target.props[key] = next },
    insert: (target, parent, anchor) => {
      if (target.parent) target.parent.children.splice(target.parent.children.indexOf(target), 1)
      target.parent = parent
      const index = anchor ? parent.children.indexOf(anchor) : -1
      parent.children.splice(index < 0 ? parent.children.length : index, 0, target)
    },
    remove: target => { if (target.parent) target.parent.children.splice(target.parent.children.indexOf(target), 1); target.parent = undefined },
    insertStaticContent: (content, parent, anchor) => {
      const target = node('#static', content); target.parent = parent
      const index = anchor ? parent.children.indexOf(anchor) : -1
      parent.children.splice(index < 0 ? parent.children.length : index, 0, target)
      return [target, target]
    },
  })
  const root = node('root')
  const all = (target = root): VueTestNode[] => [target, ...target.children.flatMap(child => all(child))]
  function mount(component: Component, props: Record<string, unknown> = {}, components: Record<string, Component> = {}) {
    const app = renderer.createApp(component, props)
    app.provide(ssrContextKey, {})
    for (const [name, value] of Object.entries(components)) app.component(name, value)
    return { app, instance: app.mount(root), root }
  }
  return { root, all, mount, render: (vnode: VNode | null) => renderer.render(vnode, root) }
}
