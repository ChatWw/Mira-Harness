/* Copyright 2026 Z.AI Co., Ltd. SPDX-License-Identifier: Apache-2.0
 * Mira adaptation of ZCode AutomationDesignPrimitives and AutomationEditView controls.
 * License: third-party-licenses/zcode/. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Popover from '@radix-ui/react-popover'
import * as Tooltip from '@radix-ui/react-tooltip'
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'

export function AutomationHint({ label, children, hoverOnly = false }: { label: string; children: ReactNode; hoverOnly?: boolean }) {
  return <Tooltip.Provider delayDuration={400}><Tooltip.Root disableHoverableContent={hoverOnly}><Tooltip.Trigger asChild onFocus={hoverOnly ? event => event.preventDefault() : undefined}>{children}</Tooltip.Trigger><Tooltip.Portal container={document.getElementById('root')}><Tooltip.Content className="mira-automation-hint" side="top" sideOffset={6}>{label}</Tooltip.Content></Tooltip.Portal></Tooltip.Root></Tooltip.Provider>
}
export function AutomationSelect({ label, value, options, onChange, disabled, icon }: {
  label: string; value: string; options: { value: string; label: string; disabled?: boolean; description?: string }[]; onChange: (value: string) => void; disabled?: boolean; icon?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  return <DropdownMenu.Root open={open && !disabled} onOpenChange={setOpen}><DropdownMenu.Trigger type="button" className="mira-automation-select" aria-label={label} disabled={disabled}>{icon}<span>{options.find(option => option.value === value)?.label || '请选择'}</span><ChevronDown size={12} /></DropdownMenu.Trigger><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content className="mira-automation-menu" align="start" sideOffset={4} collisionPadding={12}>{options.map(option => <DropdownMenu.Item key={option.value} disabled={option.disabled} onSelect={() => onChange(option.value)}><span className="mira-automation-option-label">{option.label}{option.description && <small>{option.description}</small>}</span>{option.value === value && <Check size={14} />}</DropdownMenu.Item>)}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
}
export function AutomationCreateButton({ disabled, onManually, onViaChat }: { disabled?: boolean; onManually: () => void; onViaChat: () => void }) {
  return <DropdownMenu.Root><div className="mira-automation-create"><button type="button" aria-label="新建自动化" disabled={disabled} onClick={onManually}>创建定时任务</button><DropdownMenu.Trigger type="button" aria-label="创建任务方式" disabled={disabled}><ChevronDown size={14} /></DropdownMenu.Trigger></div><DropdownMenu.Portal container={document.getElementById('root')}><DropdownMenu.Content className="mira-automation-menu" align="end" sideOffset={4}><DropdownMenu.Item onSelect={onViaChat}>去会话中创建</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
}
export const WEEKDAYS = [[1, '一'], [2, '二'], [3, '三'], [4, '四'], [5, '五'], [6, '六'], [0, '日']] as const
export function AutomationWeekdays({ value, onChange }: { value: number[]; onChange: (value: number[]) => void }) {
  return <div className="mira-automation-weekdays" role="group" aria-label="运行星期">{WEEKDAYS.map(([day, label]) => <button key={day} type="button" aria-label={`周${label}`} aria-pressed={value.includes(day)} onClick={() => { if (value.includes(day) && value.length === 1) return; onChange(value.includes(day) ? value.filter(item => item !== day) : [...value, day].sort()) }}>{label}</button>)}</div>
}
export function AutomationTimePicker({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  const [hour, minute] = value.split(':')
  return <Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger type="button" className="mira-automation-select" disabled={disabled} aria-label="运行时间">{value}<ChevronDown size={12} /></Popover.Trigger><Popover.Portal container={document.getElementById('root')}><Popover.Content className="mira-automation-popover mira-automation-time" sideOffset={4} align="start" aria-label="选择运行时间"><AutomationNumberColumn count={24} value={Number(hour)} label="小时" onChange={part => onChange(`${String(part).padStart(2, '0')}:${minute}`)} /><AutomationNumberColumn count={60} value={Number(minute)} label="分钟" onChange={part => onChange(`${hour}:${String(part).padStart(2, '0')}`)} /></Popover.Content></Popover.Portal></Popover.Root>
}
function AutomationNumberColumn({ count, value, label, onChange, start = 0 }: { count: number; value: number; label: string; onChange: (value: number) => void; start?: number }) {
  const selected = useRef<HTMLButtonElement>(null)
  useEffect(() => { selected.current?.scrollIntoView({ block: 'center' }) }, [])
  return <div className="mira-automation-number-column" role="listbox" aria-label={label}>{Array.from({ length: count }, (_, index) => index + start).map(part => <button type="button" role="option" key={part} ref={part === value ? selected : undefined} aria-selected={value === part} onClick={() => onChange(part)}>{String(part).padStart(2, '0')}</button>)}</div>
}
export function AutomationMonthDayPicker({ month, day, onChange, disabled }: { month: number; day: number; onChange: (month: number, day: number) => void; disabled?: boolean }) {
  const count = new Date(2024, month, 0).getDate()
  return <Popover.Root key={String(disabled)}><Popover.Trigger type="button" className="mira-automation-select" disabled={disabled} aria-label="每年日期">{month} 月 {day} 日<ChevronDown size={12} /></Popover.Trigger><Popover.Portal container={document.getElementById('root')}><Popover.Content className="mira-automation-popover mira-automation-time" sideOffset={4} align="start"><AutomationNumberColumn start={1} count={12} value={month} label="月份" onChange={value => onChange(value, Math.min(day, new Date(2024, value, 0).getDate()))} /><AutomationNumberColumn start={1} count={count} value={day} label="日期" onChange={value => onChange(month, value)} /></Popover.Content></Popover.Portal></Popover.Root>
}
export function AutomationDatePicker({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => value ? new Date(`${value}T12:00:00`) : new Date())
  const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const year = month.getFullYear(), index = month.getMonth(), offset = new Date(year, index, 1).getDay(), length = new Date(year, index + 1, 0).getDate()
  return <Popover.Root open={open} onOpenChange={next => { setOpen(next); if (next) setMonth(value ? new Date(`${value}T12:00:00`) : new Date()) }}><Popover.Trigger type="button" className="mira-automation-select mira-automation-date-trigger" aria-label="结束日期" disabled={disabled}><CalendarDays size={18} />{value.replace(/-/g, '/') || '选择日期'}</Popover.Trigger><Popover.Portal container={document.getElementById('root')}><Popover.Content className="mira-automation-popover mira-automation-calendar" align="start" sideOffset={6}><header><strong>{year}年{index + 1}月</strong><div><button type="button" className="mira-automation-icon" aria-label="上个月" onClick={() => setMonth(new Date(year, index - 1, 1))}><ChevronLeft size={16} /></button><button type="button" className="mira-automation-icon" aria-label="下个月" onClick={() => setMonth(new Date(year, index + 1, 1))}><ChevronRight size={16} /></button></div></header><div className="mira-automation-calendar-grid">{['日', '一', '二', '三', '四', '五', '六'].map(label => <span key={label}>{label}</span>)}{Array.from({ length: offset }, (_, n) => <span key={`blank-${n}`} />)}{Array.from({ length }, (_, n) => { const day = n + 1, date = `${year}-${String(index + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; return <button type="button" key={day} aria-label={date} aria-pressed={date === value} aria-current={date === today ? 'date' : undefined} disabled={date < today} onClick={() => { onChange(date); setOpen(false) }}>{day}</button> })}</div></Popover.Content></Popover.Portal></Popover.Root>
}
