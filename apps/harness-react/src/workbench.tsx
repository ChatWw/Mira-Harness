import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ArrowDown, ArrowUpRight, Check, ChevronDown, CircleAlert, Clock3,
  FileText, FolderOpen, LoaderCircle, Play, RotateCcw, Send, ShieldCheck,
  Square, X,
} from 'lucide-react'

type Scene = 'empty' | 'running' | 'approval' | 'complete' | 'error'
const scenes: { id: Scene; label: string }[] = [
  { id: 'empty', label: '空态' },
  { id: 'running', label: '执行中' },
  { id: 'approval', label: '待确认' },
  { id: 'complete', label: '已完成' },
  { id: 'error', label: '失败恢复' },
]

export function Workbench() {
  const [scene, setScene] = useState<Scene>('empty')
  const [draft, setDraft] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  const [task, setTask] = useState('整理项目资料，输出一份简明摘要')
  const contentRef = useRef<HTMLDivElement>(null)

  function go(next: Scene) { setScene(next); setActionMessage(''); setPreviewOpen(false) }
  useEffect(() => {
    if (scene === 'approval' || scene === 'complete' || scene === 'error') {
      contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight })
    }
  }, [scene])
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!draft.trim()) return
    setTask(draft.trim())
    setDraft('')
    go('running')
  }

  const status = {
    empty: { label: '等待任务', icon: <Clock3 size={15} />, className: 'idle' },
    running: { label: '正在执行', icon: <LoaderCircle size={15} className="spin" />, className: 'working' },
    approval: { label: '等待你的确认', icon: <ShieldCheck size={15} />, className: 'attention' },
    complete: { label: '已完成', icon: <Check size={15} />, className: 'success' },
    error: { label: '需要处理', icon: <CircleAlert size={15} />, className: 'danger' },
  }[scene]

  return (
    <div className="workbench">
      <header className="workbench__topbar">
        <div className="workbench__identity"><span className="workbench__mark">M</span><span>Mira Harness</span><span className="workbench__divider" /><span className="workbench__muted">任务工作台</span></div>
        <span className="workbench__demo">交互原型 · 演示数据，不会调用模型或修改文件</span>
      </header>

      <div className="workbench__body">
        <main className="thread">
          <div className="thread__heading">
            <div><p className="thread__path">个人工作台 / 新任务</p><h1>{scene === 'empty' ? '把想法交给 Mira' : task}</h1></div>
            {scene !== 'empty' && <span className={`status status--${status.className}`}>{status.icon}{status.label}</span>}
          </div>

          <div ref={contentRef} className="thread__content">
            {scene === 'empty' ? <EmptyState onChoose={(prompt) => setDraft(prompt)} /> : (
              <div className="task-flow">
                <div className="user-request"><span className="user-request__label">你的任务</span><p>{task}</p></div>
                <div className="task-flow__line" aria-hidden="true" />
                <section className="run-report" aria-label="任务执行过程">
                  <div className="run-report__title"><span className="run-report__avatar">M</span><strong>Mira</strong><span>任务执行记录</span></div>
                  <div className="run-report__body">
                    <p className="run-report__lead">我会先检查资料范围，提取关键内容，再整理成一份可继续编辑的摘要。</p>
                    <div className="activity"><span className="activity__icon"><FolderOpen size={16} /></span><div><strong>查看资料目录</strong><span>已识别 8 个文件 · 文档与 Markdown</span></div><Check size={15} className="activity__done" /></div>
                    <div className="activity"><span className="activity__icon"><FileText size={16} /></span><div><strong>读取项目说明</strong><span>已提取目标、范围和待解决的问题</span></div><Check size={15} className="activity__done" /></div>
                    <details className="tool-detail"><summary>查看工具调用详情<ChevronDown size={14} /></summary><div>示例：list_files → read_file → summarize。这里展示的是预设场景，没有真实文件路径或工具调用。</div></details>

                    {scene === 'running' && <div className="run-inline run-inline--working"><LoaderCircle size={16} className="spin" /><div><strong>正在整理摘要结构</strong><span>长任务期间，执行状态应保持可见；切换应用后需要从任务快照恢复。</span></div><button type="button" onClick={() => { go('error'); setActionMessage('已演示停止操作；实际取消行为待接入 Harness API') }}><Square size={12} />停止</button></div>}

                    {scene === 'approval' && <div className="approval"><div className="approval__icon"><ShieldCheck size={18} /></div><div className="approval__body"><strong>需要确认后才能写入文件</strong><p>准备创建 <code>项目摘要.md</code>。内容可在右侧成果预览中检查；此处不会写入真实文件。</p><div className="approval__actions"><button type="button" className="button button--quiet" onClick={() => { go('error'); setActionMessage('已拒绝写入，演示任务已停止') }}>拒绝</button><button type="button" className="button button--primary" onClick={() => { go('complete'); setActionMessage('已允许写入（仅演示）') }}>允许并继续<ArrowUpRight size={15} /></button></div></div></div>}

                    {scene === 'complete' && <div className="result"><div className="result__head"><span><Check size={16} />任务已完成</span><span>成果 1 项</span></div><p>已将资料整理为一份摘要草稿。你可以先检查内容，再继续提出修改。</p><button type="button" className="artifact" onClick={() => setPreviewOpen(true)}><span className="artifact__icon"><FileText size={20} /></span><span><strong>项目摘要.md</strong><small>Markdown 文档 · 示例成果</small></span><ArrowUpRight size={17} /></button></div>}

                    {scene === 'error' && <div className="failure"><CircleAlert size={18} /><div><strong>本次任务未完成</strong><p>{actionMessage || '读取其中一份资料时失败。已完成的步骤仍可查看；确认资料可用后重试。'}</p><button type="button" onClick={() => go('running')}><RotateCcw size={14} />重新尝试</button></div></div>}
                  </div>
                </section>
              </div>
            )}
          </div>

          <form className="composer" onSubmit={submit}>
            <label className="composer__label" htmlFor="task-input">{scene === 'empty' ? '描述你的任务' : '继续这个任务'}</label>
            <textarea id="task-input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="例如：整理这份资料，生成一页摘要…" rows={2} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} />
            <div className="composer__footer"><span>演示模式 · 不会发送给模型</span><button type="submit" disabled={!draft.trim()} aria-label="演示发送任务"><Send size={17} /></button></div>
          </form>
        </main>

        <aside className="inspector" aria-label="任务工作区">
          <div className="inspector__header"><span>工作区</span><span>示例任务</span></div>
          <div className="inspector__content">
            <section className="inspector__section"><h2>任务状态</h2><div className={`inspector__state inspector__state--${status.className}`}>{status.icon}<span>{status.label}</span></div><p>这里演示状态与成果如何在同一个工作区中持续呈现。</p></section>
            <section className="inspector__section"><h2>执行阶段</h2><ol className="steps"><li className="steps__done"><Check size={13} />理解任务</li><li className={scene === 'empty' ? '' : 'steps__done'}>{scene === 'empty' ? <span className="steps__dot" /> : <Check size={13} />}检查资料</li><li className={scene === 'complete' ? 'steps__done' : scene === 'running' || scene === 'approval' ? 'steps__current' : ''}>{scene === 'complete' ? <Check size={13} /> : <span className="steps__dot" />}整理摘要</li><li className={scene === 'complete' ? 'steps__done' : ''}>{scene === 'complete' ? <Check size={13} /> : <span className="steps__dot" />}交付成果</li></ol></section>
            <section className="inspector__section"><h2>成果</h2>{scene === 'complete' || scene === 'approval' ? <button type="button" className="inspector__file" onClick={() => setPreviewOpen(true)}><FileText size={17} /><span>项目摘要.md</span><ArrowUpRight size={15} /></button> : <p>完成后，文件与摘要会出现在这里。</p>}</section>
          </div>
          <div className="inspector__foot"><ShieldCheck size={15} /><span>操作前确认，执行后可追溯</span></div>
        </aside>
      </div>

      <nav className="scene-switcher" aria-label="演示场景"><span>场景预览</span>{scenes.map((item) => <button key={item.id} type="button" className={scene === item.id ? 'is-active' : ''} aria-current={scene === item.id ? 'step' : undefined} onClick={() => go(item.id)}>{item.label}</button>)}<ArrowDown size={14} aria-hidden="true" /></nav>
      {previewOpen && <div className="preview-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewOpen(false) }}><section className="preview" role="dialog" aria-modal="true" aria-label="示例成果预览"><header><div><FileText size={18} /><strong>项目摘要.md</strong><span>演示内容</span></div><button type="button" aria-label="关闭预览" onClick={() => setPreviewOpen(false)}><X size={18} /></button></header><article><h2>项目摘要</h2><p>这是一份用于验证工作台交互的示例成果，不来自真实项目文件。</p><h3>目标</h3><p>把分散的资料归纳为可阅读、可复核的任务结果。</p><h3>下一步</h3><p>接入真实 Harness 任务事件与文件成果引用后，再验证预览和恢复能力。</p></article></section></div>}
    </div>
  )
}

function EmptyState({ onChoose }: { onChoose: (prompt: string) => void }) {
  return <div className="empty"><div className="empty__symbol"><Play size={22} fill="currentColor" /></div><h2>从一个任务开始</h2><p>描述你要研究、整理、写作或处理的内容。Mira 会把执行过程、需要确认的操作和最终成果放在同一处。</p><div className="empty__examples"><span>试试这些任务</span><button type="button" onClick={() => onChoose('整理项目资料，输出一份简明摘要')}>整理一份资料<ArrowUpRight size={14} /></button><button type="button" onClick={() => onChoose('阅读这篇文章，提炼关键观点')}>提炼文章要点<ArrowUpRight size={14} /></button></div></div>
}
