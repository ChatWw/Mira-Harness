/* Draft motion timing adapted from ZCode ConversationBottomDockTransition.
 * Copyright 2026 Z.AI Co., Ltd. Apache-2.0; see third-party-licenses/zcode/.
 * Mira keeps the composer mounted and animates its position across layout modes. */
import { Component, createRef, type ReactNode } from 'react'

type Props = { draft: boolean; children: ReactNode }
type Snapshot = { composer?: DOMRect; welcome?: HTMLElement; welcomeRect?: DOMRect }
const easing = 'cubic-bezier(0.23, 1, 0.32, 1)'

export class MiraTaskTransition extends Component<Props> {
  private root = createRef<HTMLDivElement>()
  private animations: Animation[] = []
  private ghost?: HTMLElement
  private stop = () => { this.animations.forEach(animation => animation.cancel()); this.animations = []; this.ghost?.remove(); this.ghost = undefined }
  private visibility = () => { if (document.hidden) this.stop() }
  private motion?: MediaQueryList
  componentDidMount() {
    this.motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    this.motion.addEventListener('change', this.stop)
    document.addEventListener('visibilitychange', this.visibility)
    window.addEventListener('resize', this.stop)
  }
  getSnapshotBeforeUpdate(previous: Props): Snapshot | null {
    if (previous.draft === this.props.draft) return null
    const root = this.root.current
    const welcome = root?.querySelector<HTMLElement>('.mira-task-start')
    return { composer: root?.querySelector('.mira-composer-region')?.getBoundingClientRect(), ...(welcome ? { welcome: welcome.cloneNode(true) as HTMLElement, welcomeRect: welcome.getBoundingClientRect() } : {}) }
  }
  componentDidUpdate(_previous: Props, _state: unknown, snapshot: Snapshot | null) {
    if (!snapshot) return
    this.stop()
    const root = this.root.current
    if (!root || document.hidden || this.motion?.matches) return
    const play = (element: HTMLElement, frames: Keyframe[], duration: number) => {
      const animation = element.animate(frames, { duration, easing })
      this.animations.push(animation)
      animation.addEventListener('finish', () => { animation.cancel(); this.animations = this.animations.filter(item => item !== animation) }, { once: true })
      return animation
    }
    const composer = root.querySelector<HTMLElement>('.mira-composer-region')
    if (composer && snapshot.composer) {
      const next = composer.getBoundingClientRect()
      play(composer, [{ transform: `translate(${snapshot.composer.left - next.left}px, ${snapshot.composer.top - next.top}px)` }, { transform: 'translate(0, 0)' }], 260)
    }
    const welcome = root.querySelector<HTMLElement>('.mira-task-start')
    if (this.props.draft && welcome) play(welcome, [{ opacity: 0, transform: 'translateY(32px) scale(.96)' }, { opacity: 1, transform: 'none' }], 260)
    else if (snapshot.welcome && snapshot.welcomeRect) {
      const ghost = snapshot.welcome, before = snapshot.welcomeRect, bounds = root.getBoundingClientRect()
      ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true
      Object.assign(ghost.style, { position: 'absolute', pointerEvents: 'none', top: `${before.top - bounds.top}px`, left: `${before.left - bounds.left}px`, width: `${before.width}px`, height: `${before.height}px`, margin: '0' })
      root.append(ghost); this.ghost = ghost
      play(ghost, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(32px) scale(.97)' }], 180).addEventListener('finish', () => { ghost.remove(); if (this.ghost === ghost) this.ghost = undefined }, { once: true })
    }
  }
  componentWillUnmount() {
    this.stop(); this.motion?.removeEventListener('change', this.stop)
    document.removeEventListener('visibilitychange', this.visibility); window.removeEventListener('resize', this.stop)
  }
  render() { return <div ref={this.root} className="mira-conversation-root" data-draft={this.props.draft}>{this.props.children}</div> }
}
