// Scroll-edge feedback adapted from ZCode MentionPanel/scrollMask (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd. See third-party-licenses/zcode/.
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Check, CircleAlert, Info, LoaderCircle } from 'lucide-react'
import type { MiraPromptTrigger } from '../../lib/prompt-input-triggers'

export interface ComposerSuggestion {
  id: string
  label: string
  description?: string
  keywords?: string
  icon?: ReactNode
  disabled?: boolean
  selected?: boolean
  action: { type: 'file' | 'skill' | 'plugin' | 'plugin-command' | 'prompt-command' | 'agent' | 'mcp' | 'session' | 'command'; value: string }
}
export interface ComposerSuggestionSection {
  id: string
  title: string
  items: ComposerSuggestion[]
  loading?: boolean
  error?: string
  empty?: string
  onRetry?: () => void
}

export function ComposerSuggestionPanel({ listId, hasQuery, sections, selectedIndex, actionMenu = false, onHighlight, onSelect, onTrigger }: {
  listId: string
  hasQuery: boolean
  actionMenu?: boolean
  sections: ComposerSuggestionSection[]
  selectedIndex: number
  onHighlight: (index: number) => void
  onSelect: (item: ComposerSuggestion) => void
  onTrigger: (trigger: MiraPromptTrigger) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const items = sections.flatMap(section => section.items)
  const selectedId = items[selectedIndex]?.id
  const layoutSignature = JSON.stringify(sections.map(section => [section.id, section.title, section.loading, section.error, section.empty, section.items.map(item => [item.id, item.label, item.description])]))
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const updateScrollEdges = () => {
      const remaining = list.scrollHeight - list.clientHeight - list.scrollTop
      list.dataset.miraScrollTop = String(list.scrollTop > 1)
      list.dataset.miraScrollBottom = String(remaining > 1)
    }
    const revealSelected = () => {
      const target = list.querySelector<HTMLElement>('[aria-selected="true"]')
      if (target) {
        const viewport = list.getBoundingClientRect(), bounds = target.getBoundingClientRect()
        if (viewport.height && bounds.height) {
          if (bounds.top < viewport.top) list.scrollTop += bounds.top - viewport.top
          else if (bounds.bottom > viewport.bottom) list.scrollTop += bounds.bottom - viewport.bottom
        }
      }
      updateScrollEdges()
    }
    // Keep scrolling inside the candidate list, including asynchronous catalog and popup layout changes.
    revealSelected()
    const frame = requestAnimationFrame(revealSelected)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(revealSelected) : undefined
    observer?.observe(list)
    list.querySelectorAll('.mira-composer-suggestions__section').forEach(section => observer?.observe(section))
    list.addEventListener('scroll', updateScrollEdges, { passive: true })
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); list.removeEventListener('scroll', updateScrollEdges) }
  }, [selectedId, layoutSignature])
  let offset = 0
  return <div className="mira-composer-suggestions" data-has-query={hasQuery}>
    <div ref={listRef} className="mira-composer-suggestions__list" role="listbox" id={listId} aria-label="上下文与能力" aria-busy={sections.some(section => section.loading)}>
      {!sections.length && <div className="mira-composer-suggestions__status">没有匹配的上下文</div>}
      {sections.map(section => {
        const start = offset; offset += section.items.length
        return <div key={section.id} role="group" aria-label={section.title} className="mira-composer-suggestions__section">
          {sections.length > 1 && <div className="mira-composer-suggestions__heading" title={section.title}>{section.title}</div>}
          {section.loading && <div className="mira-composer-suggestions__status" role="status"><LoaderCircle size={14} className="animate-spin" />正在加载{section.title}…</div>}
          {section.error && <div className="mira-composer-suggestions__status is-error" role="alert"><CircleAlert size={14} /><span>{section.error}</span>{section.onRetry && <button type="button" onMouseDown={event => event.preventDefault()} onClick={section.onRetry}>重试</button>}</div>}
          {!section.loading && !section.error && !section.items.length && <div className="mira-composer-suggestions__status">{section.empty || '没有匹配项'}</div>}
          {section.items.map((item, index) => <button key={item.id} id={`${listId}-${item.id}`} type="button" role="option" aria-selected={start + index === selectedIndex} aria-disabled={item.disabled || undefined} disabled={item.disabled} tabIndex={-1} className="mira-composer-suggestions__option" data-suggestion-id={item.id} title={[item.label, item.description].filter(Boolean).join(' · ')} onMouseDown={event => event.preventDefault()} onMouseEnter={() => { if (!item.disabled) onHighlight(start + index) }} onClick={() => { if (!item.disabled) onSelect(item) }}>
            {item.icon}<span className="mira-composer-suggestions__label">{item.label}</span>{item.description && <small>{item.description}</small>}{item.selected && <Check size={14} />}
          </button>)}
        </div>
      })}
    </div>
    {!hasQuery && <div className="mira-composer-suggestions__footer">
      {(actionMenu ? [['@', '添加上下文'], ['/', '选择能力'], ['$', '选择技能']] as const : [['@', '上下文'], ['/', '命令'], ['$', '技能'], ['#', '对话']] as const).map(([trigger, label]) => <button key={trigger} type="button" onMouseDown={event => event.preventDefault()} onClick={() => onTrigger(trigger)}><kbd>{trigger}</kbd>{label}</button>)}
      {actionMenu ? <span><Info size={14} />输入内容以搜索插件、文件和对话</span> : <span><kbd>↑</kbd><kbd>↓</kbd>选择 <kbd>↵</kbd>确认</span>}
    </div>}
  </div>
}
