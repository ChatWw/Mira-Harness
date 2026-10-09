import { useEffect, useRef, type ReactNode } from 'react'
import { Check, CircleAlert, LoaderCircle } from 'lucide-react'

export interface ComposerSuggestion {
  id: string
  label: string
  description?: string
  keywords?: string
  icon?: ReactNode
  disabled?: boolean
  selected?: boolean
  action: { type: 'file' | 'skill' | 'mcp' | 'session' | 'command'; value: string }
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

export function ComposerSuggestionPanel({ sections, selectedIndex, onHighlight, onSelect, onTrigger }: {
  sections: ComposerSuggestionSection[]
  selectedIndex: number
  onHighlight: (index: number) => void
  onSelect: (item: ComposerSuggestion) => void
  onTrigger: (trigger: '@' | '/' | '$') => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const items = sections.flatMap(section => section.items)
  const selectedId = items[selectedIndex]?.id
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])
  let offset = 0
  return <div className="mira-composer-suggestions">
    <div ref={listRef} className="mira-composer-suggestions__list" role="listbox" id="mira-composer-suggestions" aria-label="上下文与能力" aria-busy={sections.some(section => section.loading)}>
      {sections.map(section => {
        const start = offset; offset += section.items.length
        return <div key={section.id} role="group" aria-label={section.title} className="mira-composer-suggestions__section">
          <div className="mira-composer-suggestions__heading">{section.title}</div>
          {section.loading && <div className="mira-composer-suggestions__status" role="status"><LoaderCircle size={14} className="animate-spin" />正在加载{section.title}…</div>}
          {section.error && <div className="mira-composer-suggestions__status is-error" role="alert"><CircleAlert size={14} /><span>{section.error}</span>{section.onRetry && <button type="button" onMouseDown={event => event.preventDefault()} onClick={section.onRetry}>重试</button>}</div>}
          {!section.loading && !section.error && !section.items.length && <div className="mira-composer-suggestions__status">{section.empty || '没有匹配项'}</div>}
          {section.items.map((item, index) => <button key={item.id} id={`mira-suggestion-${item.id}`} type="button" role="option" aria-selected={start + index === selectedIndex} aria-disabled={item.disabled || undefined} disabled={item.disabled} tabIndex={-1} className="mira-composer-suggestions__option" data-suggestion-id={item.id} onMouseDown={event => event.preventDefault()} onMouseEnter={() => { if (!item.disabled) onHighlight(start + index) }} onClick={() => { if (!item.disabled) onSelect(item) }}>
            {item.icon}<span className="mira-composer-suggestions__label">{item.label}</span>{item.description && <small>{item.description}</small>}{item.selected && <Check size={14} />}
          </button>)}
        </div>
      })}
    </div>
    <div className="mira-composer-suggestions__footer">
      {([['@', '上下文'], ['/', '命令'], ['$', '技能']] as const).map(([trigger, label]) => <button key={trigger} type="button" onMouseDown={event => event.preventDefault()} onClick={() => onTrigger(trigger)}><kbd>{trigger}</kbd>{label}</button>)}
      <span><kbd>↑</kbd><kbd>↓</kbd>选择 <kbd>↵</kbd>确认</span>
    </div>
  </div>
}
