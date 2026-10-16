import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { blurTimeline } from './shortcuts'

type Metrics = { view: number; total: number; left: number }

function readMetrics(el: HTMLElement): Metrics {
  return { view: el.clientWidth, total: Math.max(el.clientWidth, el.scrollWidth), left: el.scrollLeft }
}

export function TimelineScrollbar({
  scrollRef,
  onScrollBy,
}: {
  scrollRef: RefObject<HTMLDivElement | null>
  onScrollBy: (dx: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [metrics, setMetrics] = useState<Metrics>({ view: 1, total: 1, left: 0 })
  const dragRef = useRef<{ lastX: number } | null>(null)

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
    const child = el.firstElementChild
    if (child) ro.observe(child)
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

  function panFromPointerDx(dx: number) {
    const el = scrollRef.current
    if (!el) return
    const room = Math.max(0, el.scrollWidth - el.clientWidth)
    const liveThumb = Math.max(32, (el.clientWidth / Math.max(el.clientWidth, el.scrollWidth)) * (trackRef.current?.clientWidth ?? trackW))
    const liveMaxThumb = Math.max(1, (trackRef.current?.clientWidth ?? trackW) - liveThumb)
    onScrollBy(room < 4 ? dx : (dx / liveMaxThumb) * room)
    sync()
  }

  function setScrollFromClientX(clientX: number) {
    const track = trackRef.current
    const el = scrollRef.current
    if (!track || !el) return
    const rect = track.getBoundingClientRect()
    const ratio = (clientX - rect.left - thumbW / 2) / Math.max(1, rect.width - thumbW)
    const room = Math.max(0, el.scrollWidth - el.clientWidth)
    const target = Math.max(0, Math.min(1, ratio)) * Math.max(1, room)
    onScrollBy(target - el.scrollLeft)
    sync()
  }

  function onThumbDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    blurTimeline(scrollRef.current)
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { lastX: event.clientX }
  }

  function onThumbMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const origin = dragRef.current
    if (!origin) return
    const dx = event.clientX - origin.lastX
    origin.lastX = event.clientX
    panFromPointerDx(dx)
  }

  function onThumbUp() {
    dragRef.current = null
  }

  function onTrackDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    blurTimeline(scrollRef.current)
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
