// Hidden-document policy adapted from ZCode documentHiddenMotionPause (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd. Mira also settles active Web Animations.
export function installDocumentMotion(doc: Document = document) {
  const sync = () => {
    const hidden = doc.visibilityState === 'hidden'
    doc.documentElement.toggleAttribute('data-document-hidden', hidden)
    if (hidden) for (const animation of doc.getAnimations()) {
      if (animation.effect?.getComputedTiming().iterations === Infinity) continue
      animation.finish()
    }
  }
  sync()
  doc.addEventListener('visibilitychange', sync)
  return () => { doc.removeEventListener('visibilitychange', sync); doc.documentElement.removeAttribute('data-document-hidden') }
}
