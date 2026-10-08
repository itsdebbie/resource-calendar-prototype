import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { Zoom } from './data'
import {
  BUFFER_COLS,
  DEMO_TODAY,
  EDGE_PX,
  GUTTER,
  columnAtIndex,
  columnIndexAt,
  columnWidth,
  columnsInExtent,
  contextLabel,
  dateAtWorldX,
  utc,
  worldXForDate,
  type TimeWindow,
} from './timeline'

function extentAround(zoom: Zoom, iso: string, extra = 20) {
  const idx = columnIndexAt(zoom, utc(iso))
  return { min: idx - BUFFER_COLS, max: idx + BUFFER_COLS + extra }
}

function visiblePx(el: HTMLElement) {
  return Math.min(2200, Math.max(320, Math.min(el.clientWidth, window.innerWidth) - GUTTER))
}

export function useTimelineScroll(zoom: Zoom, scrollRef: RefObject<HTMLDivElement | null>) {
  const [viewportPx, setViewportPx] = useState(980)
  const colW = columnWidth(zoom, viewportPx)
  const anchorRef = useRef({ iso: DEMO_TODAY, offsetPx: 0 })
  const [extent, setExtent] = useState(() => extentAround(zoom, DEMO_TODAY))
  const todayIndex = columnIndexAt(zoom, utc(DEMO_TODAY))
  const [viewWindow, setViewWindow] = useState<TimeWindow>(() => ({
    start: columnAtIndex(zoom, todayIndex).start,
    end: columnAtIndex(zoom, todayIndex + 13).end,
  }))
  const [firstVisible, setFirstVisible] = useState(todayIndex)
  const [alignNonce, setAlignNonce] = useState(0)

  const extentRef = useRef(extent)
  const colWRef = useRef(colW)
  const zoomRef = useRef(zoom)
  extentRef.current = extent
  colWRef.current = colW
  zoomRef.current = zoom

  const prevMin = useRef(extent.min)
  const prevZoom = useRef(zoom)
  const pendingAlign = useRef(true)
  const readyRef = useRef(false)
  const alignedAt = useRef(0)

  const columns = useMemo(() => columnsInExtent(zoom, extent.min, extent.max), [zoom, extent.min, extent.max])
  const canvasWidth = GUTTER + columns.length * colW
  const visibleCount = Math.max(8, Math.ceil(viewportPx / colW))

  const publishWindow = useCallback((el: HTMLElement) => {
    const { min, max } = extentRef.current
    const width = colWRef.current
    const z = zoomRef.current
    const sl = el.scrollLeft
    const count = Math.max(8, Math.ceil(visiblePx(el) / width))
    const i0 = Math.min(max, Math.max(min, min + Math.floor(sl / width)))
    const i1 = Math.min(max, Math.max(i0, i0 + count - 1))
    const start = columnAtIndex(z, i0).start
    const end = columnAtIndex(z, i1).end
    setFirstVisible((prev) => (prev === i0 ? prev : i0))
    setViewWindow((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
  }, [])

  const dateAtClientX = useCallback(
    (clientX: number) => {
      const el = scrollRef.current
      if (!el) return DEMO_TODAY
      const rect = el.getBoundingClientRect()
      const x = clientX - rect.left + el.scrollLeft - GUTTER
      return dateAtWorldX(zoom, extent.min, colW, x)
    },
    [scrollRef, zoom, extent.min, colW],
  )

  const dateAtViewportCenter = useCallback(() => {
    const el = scrollRef.current
    if (!el) return DEMO_TODAY
    const rect = el.getBoundingClientRect()
    return dateAtClientX(rect.left + GUTTER + Math.max(40, (rect.width - GUTTER) / 2))
  }, [dateAtClientX, scrollRef])

  const expandToIndex = useCallback((index: number) => {
    setExtent((e) => {
      let { min, max } = e
      if (index - min < 12) min = index - BUFFER_COLS
      if (max - index < 12) max = index + BUFFER_COLS
      if (min === e.min && max === e.max) return e
      return { min, max }
    })
  }, [])

  const setAnchor = useCallback((iso: string, offsetPx: number) => {
    anchorRef.current = { iso, offsetPx }
  }, [])

  const jumpTo = useCallback(
    (iso: string, offsetPx = 0) => {
      anchorRef.current = { iso, offsetPx }
      pendingAlign.current = true
      readyRef.current = false
      setExtent((e) => {
        const idx = columnIndexAt(zoom, utc(iso))
        if (idx >= e.min + 8 && idx <= e.max - 8) return e
        return extentAround(zoom, iso)
      })
      setAlignNonce((n) => n + 1)
    },
    [zoom],
  )

  const ensureDate = useCallback(
    (iso: string) => {
      expandToIndex(columnIndexAt(zoom, utc(iso)))
    },
    [expandToIndex, zoom],
  )

  const scrollBy = useCallback(
    (dx: number) => {
      const el = scrollRef.current
      if (!el) return
      el.scrollLeft += dx
      alignedAt.current = el.scrollLeft
      const leftIdx = extentRef.current.min + Math.floor(el.scrollLeft / colWRef.current)
      expandToIndex(leftIdx)
      expandToIndex(leftIdx + Math.ceil(visiblePx(el) / colWRef.current))
      publishWindow(el)
    },
    [scrollRef, expandToIndex, publishWindow],
  )

  const autoScrollFromPointer = useCallback(
    (clientX: number) => {
      const el = scrollRef.current
      if (!el) return 0
      const rect = el.getBoundingClientRect()
      const left = rect.left + GUTTER + EDGE_PX
      const right = rect.right - EDGE_PX
      let dx = 0
      if (clientX > right) dx = Math.min(36, 12 + (clientX - right) / 3)
      else if (clientX < left) dx = -Math.min(36, 12 + (left - clientX) / 3)
      if (dx) scrollBy(dx)
      return dx
    },
    [scrollRef, scrollBy],
  )

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => {
      const next = visiblePx(el)
      setViewportPx((prev) => (Math.abs(prev - next) < 2 ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [scrollRef])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let frames = 0
    let raf = 0

    if (prevZoom.current !== zoom) {
      prevZoom.current = zoom
      pendingAlign.current = true
      readyRef.current = false
      const next = extentAround(zoom, anchorRef.current.iso)
      prevMin.current = next.min
      if (next.min !== extent.min || next.max !== extent.max) {
        setExtent(next)
        return
      }
    }

    const apply = () => {
      const { iso, offsetPx } = anchorRef.current
      const target = Math.max(0, worldXForDate(zoom, extent.min, colW, iso) - offsetPx)
      el.scrollLeft = target
      const stuck = target > colW && el.scrollLeft < colW && el.scrollWidth <= el.clientWidth + 4
      if (stuck && frames < 8) {
        frames += 1
        raf = requestAnimationFrame(apply)
        return
      }
      alignedAt.current = el.scrollLeft
      prevMin.current = extent.min
      pendingAlign.current = false
      readyRef.current = true
      publishWindow(el)
    }

    if (pendingAlign.current) {
      apply()
      return () => cancelAnimationFrame(raf)
    }

    const deltaCols = prevMin.current - extent.min
    if (deltaCols !== 0) {
      el.scrollLeft += deltaCols * colW
      alignedAt.current = el.scrollLeft
      prevMin.current = extent.min
    }
    publishWindow(el)
    return () => cancelAnimationFrame(raf)
  }, [zoom, extent.min, extent.max, colW, alignNonce, scrollRef, publishWindow])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const onScroll = () => {
      publishWindow(el)
      if (!readyRef.current || pendingAlign.current) return
      if (el.scrollWidth <= el.clientWidth + colWRef.current) return
      if (Math.abs(el.scrollLeft - alignedAt.current) < 2) return
      const width = colWRef.current
      if (el.scrollLeft < width * 6) {
        setExtent((e) => ({ min: e.min - BUFFER_COLS, max: e.max }))
      } else if (el.scrollLeft + el.clientWidth > el.scrollWidth - width * 6) {
        setExtent((e) => ({ min: e.min, max: e.max + BUFFER_COLS }))
      }
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [scrollRef, publishWindow])

  return {
    columns,
    colW,
    canvasWidth,
    extent,
    viewWindow,
    firstVisible,
    visibleCount,
    contextLabel: contextLabel(zoom, viewWindow),
    dateAtClientX,
    dateAtViewportCenter,
    jumpTo,
    ensureDate,
    scrollBy,
    autoScrollFromPointer,
    setAnchor,
  }
}
