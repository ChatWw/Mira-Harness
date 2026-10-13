import { LoaderCircle } from 'lucide-react'

export function MiraWorkingIndicator({ running }: { running: boolean }) {
  return running ? <div className="mira-working-indicator" role="status">
    <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
    <span>Mira 正在努力工作中～</span>
  </div> : null
}
