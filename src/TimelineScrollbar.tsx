import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

type Metrics = { view: number; total: number; left: number }

function readMetrics(el: HTMLElement): Metrics {
  return { view: el.clientWidth, total: Math.max(el.clientWidth, el.scrollWidth), left: el.scrollLeft }
}

export function TimelineScrollbar({ scrollRef }: { scrollRef: RefObject<HTMLDivElement | null> }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [metrics, setMetrics] = useState<Metrics>({ view: 1, total: 1, left: 0 })
  const dragRef = useRef<{ originX: number; originLeft: number; maxThumb: number; maxScroll: number } | null>(null)

  const sync = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const next = readMetrics(el)
    setMetrics((prev) =>
      prev.view === next.view && prev.total === next.total && Math.abs(prev.left - next.left) < 0.5 ? prev : next,
    )
  }, [scrollRef])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    sync()
    el.addEventListener('scroll', sync, { passive: true })
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', sync)
      ro.disconnect()
    }
  }, [scrollRef, sync])

  const trackW = metrics.view
  const thumbW = Math.max(32, (metrics.view / Math.max(1, metrics.total)) * trackW)
  const maxThumb = Math.max(1, trackW - thumbW)
  const maxScroll = Math.max(1, metrics.total - metrics.view)
  const thumbLeft = (metrics.left / maxScroll) * maxThumb

  function setScrollFromClientX(clientX: number) {
    const track = trackRef.current
    const el = scrollRef.current
    if (!track || !el) return
    const rect = track.getBoundingClientRect()
    const ratio = (clientX - rect.left - thumbW / 2) / Math.max(1, rect.width - thumbW)
    el.scrollLeft = Math.max(0, Math.min(1, ratio)) * maxScroll
    sync()
  }

  function onThumbDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { originX: event.clientX, originLeft: metrics.left, maxThumb, maxScroll }
  }

  function onThumbMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const origin = dragRef.current
    const el = scrollRef.current
    if (!origin || !el) return
    const dx = event.clientX - origin.originX
    el.scrollLeft = origin.originLeft + (dx / origin.maxThumb) * origin.maxScroll
    sync()
  }

  function onThumbUp() {
    dragRef.current = null
  }

  function onTrackDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('.gantt-hscroll-thumb')) return
    setScrollFromClientX(event.clientX)
  }

  return (
    <div
      className="gantt-hscroll"
      ref={trackRef}
      role="scrollbar"
      aria-label="Timeline"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={Math.round(maxScroll)}
      aria-valuenow={Math.round(metrics.left)}
      onPointerDown={onTrackDown}
    >
      <button
        type="button"
        className="gantt-hscroll-thumb"
        aria-label="Timeline scroll thumb"
        style={{ width: thumbW, transform: `translateX(${thumbLeft}px)` }}
        onPointerDown={onThumbDown}
        onPointerMove={onThumbMove}
        onPointerUp={onThumbUp}
        onPointerCancel={onThumbUp}
      />
    </div>
  )
}
