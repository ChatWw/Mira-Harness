import { useEffect, useRef, useState, type ReactNode } from 'react'

const entrances = new Set<string>()
export function MiraStreamEntrance({ identity, active, children }: { identity: string; active: boolean; children: ReactNode }) {
  const [animate, setAnimate] = useState(() => active && !entrances.has(identity))
  useEffect(() => {
    if (!active || entrances.has(identity)) return
    setAnimate(true)
    const mark = window.setTimeout(() => {
      entrances.add(identity)
      if (entrances.size > 800) entrances.delete(entrances.values().next().value!)
    }, 0)
    const cleanup = window.setTimeout(() => setAnimate(false), 1000)
    return () => { window.clearTimeout(mark); window.clearTimeout(cleanup) }
  }, [active, identity])
  return <div className="min-w-0" data-mira-stream-entrance={animate || undefined}>{children}</div>
}

type Snapshot = { key: string; version?: string; content: ReactNode }
export function MiraQueuedSummary({ contentKey, version, enabled, children }: { contentKey: string; version?: string; enabled: boolean; children: ReactNode }) {
  const next: Snapshot = { key: contentKey, version, content: children }
  const latest = useRef(next); latest.current = next
  const [shown, setShown] = useState<Snapshot>(next)
  const current = useRef(next), queue = useRef<Snapshot[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [previous, setPrevious] = useState<Snapshot>()
  const [reduced, setReduced] = useState(false)
  const animate = enabled && !reduced
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    update(); query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    const promote = (snapshot: Snapshot) => {
      setPrevious(current.current); current.current = snapshot; setShown(snapshot)
      const expected = performance.now() + 800
      timer.current = setTimeout(() => {
        timer.current = undefined; setPrevious(undefined)
        // Skip stale queued summaries after a blocked main thread.
        if (performance.now() - expected > 250) queue.current = queue.current.slice(-1)
        const following = queue.current.shift()
        if (following) promote(following)
      }, 800)
    }
    const snapshot = latest.current
    if (!animate) {
      clearTimeout(timer.current); timer.current = undefined; queue.current = []
      setPrevious(undefined); current.current = snapshot; setShown(snapshot)
    } else if (current.current.key === snapshot.key) {
      if (current.current.version !== snapshot.version) { current.current = snapshot; setShown(snapshot) }
    } else if (timer.current !== undefined) {
      const index = queue.current.findIndex(item => item.key === snapshot.key)
      if (index >= 0) queue.current[index] = snapshot
      else queue.current = queue.current.length ? [queue.current[0]!, snapshot] : [snapshot]
    } else promote(snapshot)
  }, [contentKey, version, animate])
  useEffect(() => () => clearTimeout(timer.current), [])
  if (!animate) return <>{children}</>
  return <span className="mira-summary-roll">
    {previous && <span key={`exit:${previous.key}`} className="mira-summary-roll__previous" aria-hidden="true" inert>{previous.content}</span>}
    <span key={shown.key} className={previous ? 'mira-summary-roll__current' : undefined}>{shown.content}</span>
  </span>
}
