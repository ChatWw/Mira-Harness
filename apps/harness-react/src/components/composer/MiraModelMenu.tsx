import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ArrowLeft, Brain, Check, ChevronRight, Image, Search, Settings2 } from 'lucide-react'

export interface MiraModelOption {
  providerId: string
  providerName: string
  modelId: string
  modelName?: string
  reasoning: boolean
  multimodal?: boolean
}

type MiraModelMenuProps = {
  open: boolean
  ownerKey: string
  models: MiraModelOption[]
  selected?: MiraModelOption
  container?: HTMLElement | null
  disabled: boolean
  drilldown?: boolean
  onSelect: (model: MiraModelOption) => void
  onManage?: () => void
  onReturnFocus: () => void
  onEscapeKeyDown?: (event: globalThis.KeyboardEvent) => void
}

const modelKey = (model: MiraModelOption) => JSON.stringify([model.providerId, model.modelId])

// Provider submenus adapted from ZCode ModelConfigSelect; see third-party-licenses/zcode.
export function MiraModelMenu({ open, ownerKey, models, selected, container, disabled, drilldown = false, onSelect, onManage, onReturnFocus, onEscapeKeyDown }: MiraModelMenuProps) {
  const [query, setQuery] = useState('')
  const [openProvider, setOpenProvider] = useState<string>()
  const input = useRef<HTMLInputElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const returnFocus = useRef(false)
  useEffect(() => { returnFocus.current = false }, [ownerKey])
  useEffect(() => {
    if (!open) { setQuery(''); setOpenProvider(undefined); return }
    returnFocus.current = true
    const timer = window.setTimeout(() => input.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [open])
  const groups = new Map<string, MiraModelOption[]>()
  for (const model of models) {
    const group = groups.get(model.providerId)
    if (group) group.push(model)
    else groups.set(model.providerId, [model])
  }
  const search = query.trim().toLocaleLowerCase()
  const providerModels = drilldown && openProvider ? groups.get(openProvider) : undefined
  const matches = (providerModels ?? models).filter(model => `${model.providerName} ${model.modelName || ''} ${model.modelId}`.toLocaleLowerCase().includes(search))
  function enterProvider(providerId?: string) {
    setOpenProvider(providerId); setQuery(''); input.current?.focus()
  }
  function searchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) { event.stopPropagation(); return }
    if (event.key === 'Escape' || event.key === 'Tab') return
    event.stopPropagation()
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const rows = content.current?.querySelectorAll<HTMLElement>('[data-mira-model-row]:not([data-disabled])')
    rows?.[event.key === 'ArrowDown' ? 0 : rows.length - 1]?.focus()
  }
  function renderModels(options: MiraModelOption[], showProvider = false) {
    return <DropdownMenu.RadioGroup value={selected ? modelKey(selected) : ''} onValueChange={value => {
      if (disabled) return
      const model = models.find(item => modelKey(item) === value)
      if (model) onSelect(model)
    }}>{options.map(model => <DropdownMenu.RadioItem key={modelKey(model)} value={modelKey(model)} disabled={disabled} data-mira-model-row className="harness-composer__menu-item mira-model-menu__option">
      <span title={model.modelId}><strong>{model.modelName || model.modelId}</strong>{showProvider && <small>{model.providerName}</small>}</span>
      {model.multimodal && <Image size={14} aria-label="支持图片输入" className="mira-model-menu__capability" />}
      {model.reasoning && <Brain size={14} aria-label="支持推理" className="mira-model-menu__capability" />}
      <DropdownMenu.ItemIndicator className="harness-composer__check"><Check size={16} /></DropdownMenu.ItemIndicator>
    </DropdownMenu.RadioItem>)}</DropdownMenu.RadioGroup>
  }
  return <DropdownMenu.Portal container={container}><DropdownMenu.Content ref={content} align={drilldown ? 'start' : 'end'} side="top" sideOffset={4} collisionPadding={drilldown ? 12 : undefined} className={`harness-composer__menu harness-composer__model-menu${drilldown ? ' mira-model-menu--drilldown' : ''}`} onKeyDownCapture={event => { if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) event.stopPropagation() }} onEscapeKeyDown={event => {
    if (event.isComposing || event.keyCode === 229) event.preventDefault()
    else if (drilldown && openProvider) { event.preventDefault(); enterProvider() }
    else onEscapeKeyDown?.(event)
  }} onInteractOutside={() => { returnFocus.current = false }} onCloseAutoFocus={event => {
    event.preventDefault()
    if (returnFocus.current && !disabled) onReturnFocus()
  }}>
    {providerModels && <div className="mira-model-menu__navigation"><button type="button" aria-label="返回服务商" onClick={() => enterProvider()}><ArrowLeft size={18} /></button><strong>{providerModels[0].providerName}</strong></div>}
    <div className="harness-composer__search"><Search size={16} /><input ref={input} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={searchKey} placeholder="搜索模型" aria-label="搜索模型" /></div>
    <div className="mira-model-menu__list">
      {search ? renderModels(matches, !providerModels) : providerModels ? renderModels(providerModels) : Array.from(groups, ([providerId, options]) => drilldown ? <DropdownMenu.Item key={providerId} disabled={disabled} data-mira-model-row className="harness-composer__menu-item mira-model-menu__provider" onSelect={event => { event.preventDefault(); enterProvider(providerId) }}><span title={options[0].providerName}>{options[0].providerName}</span>{selected?.providerId === providerId && <Check size={16} aria-label="当前供应商" />}<ChevronRight size={14} /></DropdownMenu.Item> : <DropdownMenu.Sub key={providerId} open={openProvider === providerId} onOpenChange={open => setOpenProvider(open ? providerId : undefined)}>
        <DropdownMenu.SubTrigger disabled={disabled} data-mira-model-row className="harness-composer__menu-item mira-model-menu__provider"><span title={options[0].providerName}>{options[0].providerName}</span>{selected?.providerId === providerId && <Check size={16} aria-label="当前供应商" />}<ChevronRight size={14} /></DropdownMenu.SubTrigger>
        <DropdownMenu.Portal container={container}><DropdownMenu.SubContent className="harness-composer__menu mira-model-menu__submenu" sideOffset={4} onKeyDownCapture={event => { if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) event.stopPropagation() }} onEscapeKeyDown={event => {
          event.preventDefault()
          if (event.isComposing || event.keyCode === 229) return
          event.stopPropagation()
          content.current?.querySelector<HTMLElement>('.mira-model-menu__provider[data-state="open"]')?.focus()
          setOpenProvider(undefined)
        }}>{renderModels(options)}</DropdownMenu.SubContent></DropdownMenu.Portal>
      </DropdownMenu.Sub>)}
      {!models.length && <span className="harness-composer__menu-empty">{onManage ? '请先在设置中配置模型' : '暂无可用模型，请在电脑上配置'}</span>}
      {models.length > 0 && search && !matches.length && <span className="harness-composer__menu-empty" role="status">没有匹配的模型</span>}
    </div>
    {onManage && <div className="mira-model-menu__footer"><DropdownMenu.Separator className="harness-composer__menu-separator" /><DropdownMenu.Item data-mira-model-row className="harness-composer__menu-item" onSelect={() => { returnFocus.current = false; onManage() }}><Settings2 size={16} /><span>管理模型</span></DropdownMenu.Item></div>}
  </DropdownMenu.Content></DropdownMenu.Portal>
}
