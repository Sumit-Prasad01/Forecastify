import { useEffect, useRef, useState } from 'react'

/**
 * Animates from the previous value (or 0) up to `target` whenever it changes.
 * Returns null until the first real value arrives, so callers can keep
 * showing a loading placeholder instead of an animated "0".
 * Respects prefers-reduced-motion by returning `target` immediately without animation.
 */
export function useCountUp(target: number | null, durationMs = 800): number | null {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const [value, setValue] = useState<number | null>(null)
  const lastTarget = useRef(0)

  useEffect(() => {
    if (target === null || prefersReducedMotion) return

    const from = lastTarget.current
    const start = performance.now()
    let raf: number

    function tick(now: number) {
      const progress = Math.min((now - start) / durationMs, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(from + (target! - from) * eased)
      if (progress < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        lastTarget.current = target!
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs, prefersReducedMotion])

  if (prefersReducedMotion) return target
  return value
}
