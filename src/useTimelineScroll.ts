import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { Zoom } from './data'
import {
  BUFFER_COLS,
  DEMO_TODAY,
  EDGE_SCROLL_GAIN,
  EDGE_SCROLL_MAX_PX,
  EDGE_SCROLL_MIN_PX,
  EDGE_SCROLL_ZONE_PX,
  GUTTER,
  columnAtIndex,
  columnIndexAt,
  columnWidth,
  columnsInExtent,
  contextLabel,
  dateAtWorldX,
  isoFromTs,
  utc,
  worldXForDate,
  type TimeWindow,
} from './timeline'
import type { ScrollDemoMode } from './scrollDemo'

function extentAround(zoom: Zoom, iso: string, extra = 24) {
  const idx = columnIndexAt(zoom, utc(iso))
  return { min: idx - BUFFER_COLS, max: idx + BUFFER_COLS + extra }
}

function visiblePx(el: HTMLElement, gutter: number) {
  return Math.min(2200, Math.max(320, Math.min(el.clientWidth, window.innerWidth) - gutter))
}

export function useTimelineScroll(
  zoom: Zoom,
  scrollRef: RefObject<HTMLDivElement | null>,
  options?: {
    gutter?: number
    initialIso?: string
    mode?: ScrollDemoMode
    boundStartIso?: string
    boundEndIso?: string
  },
) {
  const gutter = options?.gutter ?? GUTTER
  const gutterRef = useRef(gutter)
  gutterRef.current = gutter
  const startIso = options?.initialIso ?? DEMO_TODAY
  const mode = options?.mode ?? 'infinite'
  const modeRef = useRef(mode)
  modeRef.current = mode
  const boundStartIso = options?.boundStartIso
  const boundEndIso = options?.boundEndIso
  const boundStartRef = useRef(boundStartIso)
  const boundEndRef = useRef(boundEndIso)
  boundStartRef.current = boundStartIso
  boundEndRef.current = boundEndIso
  const [viewportPx, setViewportPx] = useState(980)
  const colW = columnWidth(zoom, viewportPx)
  const anchorRef = useRef({ iso: startIso, offsetPx: 0 })
  const [extent, setExtent] = useState(() => extentAround(zoom, startIso))
  const startIndex = columnIndexAt(zoom, utc(startIso))
  const [viewWindow, setViewWindow] = useState<TimeWindow>(() => ({
    start: columnAtIndex(zoom, startIndex).start,
    end: columnAtIndex(zoom, startIndex + 13).end,
  }))
  const [firstVisible, setFirstVisible] = useState(startIndex)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [alignNonce, setAlignNonce] = useState(0)

  const extentRef = useRef(extent)
  const colWRef = useRef(colW)
  const zoomRef = useRef(zoom)
  extentRef.current = extent
  colWRef.current = colW
  zoomRef.current = zoom

  const prevMin = useRef(extent.min)
  const prevZoom = useRef(zoom)
  const prevColW = useRef(colW)
  const pendingAlign = useRef(true)
  const readyRef = useRef(false)
  const alignedAt = useRef(0)
  const slideRef = useRef(false)

  const columns = useMemo(() => columnsInExtent(zoom, extent.min, extent.max), [zoom, extent.min, extent.max])
  const canvasWidth = gutter + columns.length * colW
  const visibleCount = Math.max(8, Math.ceil(viewportPx / colW))

  const publishWindow = useCallback((el: HTMLElement) => {
    const { min, max } = extentRef.current
    const width = colWRef.current
    const z = zoomRef.current
    const sl = el.scrollLeft
    const count = Math.max(8, Math.ceil(visiblePx(el, gutterRef.current) / width))
    const i0 = Math.min(max, Math.max(min, min + Math.floor(sl / width)))
    const i1 = Math.min(max, Math.max(i0, i0 + count - 1))
    const start = columnAtIndex(z, i0).start
    const end = columnAtIndex(z, i1).end
    setFirstVisible((prev) => (prev === i0 ? prev : i0))
    setScrollLeft((prev) => (Math.abs(prev - sl) < 0.5 ? prev : sl))
    setViewWindow((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
    if (readyRef.current && !pendingAlign.current) {
      anchorRef.current = { iso: isoFromTs(start), offsetPx: sl - (i0 - min) * width }
    }
  }, [])

  const dateAtClientX = useCallback(
    (clientX: number) => {
      const el = scrollRef.current
      if (!el) return DEMO_TODAY
      const rect = el.getBoundingClientRect()
      const x = clientX - rect.left + el.scrollLeft - gutterRef.current
      return dateAtWorldX(zoom, extent.min, colW, x)
    },
    [scrollRef, zoom, extent.min, colW],
  )

  const dateAtViewportCenter = useCallback(() => {
    const el = scrollRef.current
    if (!el) return DEMO_TODAY
    const viewW = Math.min(el.clientWidth, window.innerWidth)
    const x = el.scrollLeft + Math.max(40, (viewW - gutterRef.current) / 2)
    return dateAtWorldX(zoom, extent.min, colW, x)
  }, [scrollRef, zoom, extent.min, colW])

  const boundIndexRange = useCallback(() => {
    const start = boundStartRef.current
    const end = boundEndRef.current
    if (modeRef.current !== 'extend' || !start || !end) return null
    const z = zoomRef.current
    return { min: columnIndexAt(z, utc(start)), max: columnIndexAt(z, utc(end)) }
  }, [])

  const expandToIndex = useCallback((index: number) => {
    setExtent((e) => {
      const bounds = boundIndexRange()
      if (bounds) {
        const next = {
          min: Math.max(bounds.min, Math.min(e.min, index)),
          max: Math.min(bounds.max, Math.max(e.max, index)),
        }
        if (next.min === e.min && next.max === e.max) return e
        return next
      }
      let { min, max } = e
      if (index < min) min = index - BUFFER_COLS
      if (index > max) max = index + BUFFER_COLS
      if (min === e.min && max === e.max) return e
      return { min, max }
    })
  }, [boundIndexRange])

  const slideByCols = useCallback((cols: number) => {
    if (!cols) return
    const bounds = boundIndexRange()
    setExtent((e) => {
      if (bounds) {
        const width = e.max - e.min
        let min = e.min + cols
        let max = e.max + cols
        if (min < bounds.min) {
          min = bounds.min
          max = min + width
        }
        if (max > bounds.max) {
          max = bounds.max
          min = max - width
        }
        if (min < bounds.min) min = bounds.min
        if (min === e.min && max === e.max) return e
        slideRef.current = true
        return { min, max }
      }
      slideRef.current = true
      return { min: e.min + cols, max: e.max + cols }
    })
  }, [boundIndexRange])

  const setAnchor = useCallback((iso: string, offsetPx: number) => {
    anchorRef.current = { iso, offsetPx }
  }, [])

  const jumpTo = useCallback(
    (iso: string, offsetPx = 0) => {
      anchorRef.current = { iso, offsetPx }
      pendingAlign.current = true
      readyRef.current = false
      setExtent(extentAround(zoom, iso))
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
      const before = el.scrollLeft
      el.scrollLeft += dx
      const moved = el.scrollLeft - before
      if (Math.abs(moved) < 1 && Math.abs(dx) > 1) {
        const cols = Math.max(1, Math.round(Math.abs(dx) / Math.max(1, colWRef.current)))
        slideByCols(Math.sign(dx) * cols)
      } else {
        alignedAt.current = el.scrollLeft
        const leftIdx = extentRef.current.min + Math.floor(el.scrollLeft / colWRef.current)
        expandToIndex(leftIdx)
        expandToIndex(leftIdx + Math.ceil(visiblePx(el, gutterRef.current) / colWRef.current))
      }
      publishWindow(el)
    },
    [scrollRef, expandToIndex, publishWindow, slideByCols],
  )

  const autoScrollFromPointer = useCallback(
    (clientX: number) => {
      const el = scrollRef.current
      if (!el) return 0
      const rect = el.getBoundingClientRect()
      const viewW = Math.min(el.clientWidth, window.innerWidth)
      const left = rect.left + gutterRef.current + EDGE_SCROLL_ZONE_PX
      const right = rect.left + viewW - EDGE_SCROLL_ZONE_PX
      let dx = 0
      if (clientX > right) {
        dx = Math.min(EDGE_SCROLL_MAX_PX, EDGE_SCROLL_MIN_PX + (clientX - right) / EDGE_SCROLL_GAIN)
      } else if (clientX < left) {
        dx = -Math.min(EDGE_SCROLL_MAX_PX, EDGE_SCROLL_MIN_PX + (left - clientX) / EDGE_SCROLL_GAIN)
      }
      if (dx) scrollBy(dx)
      return dx
    },
    [scrollRef, scrollBy],
  )

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => {
      const next = visiblePx(el, gutterRef.current)
      setViewportPx((prev) => (Math.abs(prev - next) < 2 ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [scrollRef])

  const prevMode = useRef(mode)
  useLayoutEffect(() => {
    const bounds =
      mode === 'extend' && boundStartIso && boundEndIso
        ? { min: columnIndexAt(zoom, utc(boundStartIso)), max: columnIndexAt(zoom, utc(boundEndIso)) }
        : null
    if (prevMode.current !== mode) {
      prevMode.current = mode
      pendingAlign.current = true
      readyRef.current = false
      setExtent(bounds ?? extentAround(zoom, anchorRef.current.iso))
      setAlignNonce((n) => n + 1)
      return
    }
    if (!bounds) return
    setExtent((e) => (e.min === bounds.min && e.max === bounds.max ? e : bounds))
  }, [mode, boundStartIso, boundEndIso, zoom])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let frames = 0
    let raf = 0

    if (prevZoom.current !== zoom) {
      prevZoom.current = zoom
      pendingAlign.current = true
      readyRef.current = false
      const bounds = boundIndexRange()
      const next = bounds ? { min: bounds.min, max: bounds.max } : extentAround(zoom, anchorRef.current.iso)
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
      prevColW.current = colW
      apply()
      return () => cancelAnimationFrame(raf)
    }

    if (prevColW.current !== colW) {
      prevColW.current = colW
      apply()
      return () => cancelAnimationFrame(raf)
    }

    const deltaCols = prevMin.current - extent.min
    if (deltaCols !== 0) {
      if (slideRef.current) {
        slideRef.current = false
      } else {
        el.scrollLeft += deltaCols * colW
      }
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
      if (modeRef.current === 'extend') return
      const width = colWRef.current
      const viewW = Math.min(el.clientWidth, window.innerWidth)
      const noOverflow = el.scrollWidth <= viewW + width
      if (Math.abs(el.scrollLeft - alignedAt.current) < 2 && !noOverflow) return
      alignedAt.current = el.scrollLeft
      if (noOverflow) return
      if (el.scrollLeft < width * 6) {
        setExtent((e) => ({ min: e.min - BUFFER_COLS, max: e.max }))
      } else if (el.scrollLeft + viewW > el.scrollWidth - width * 6) {
        setExtent((e) => ({ min: e.min, max: e.max + BUFFER_COLS }))
      }
    }

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return
      if (modeRef.current === 'extend') return
      const dx = event.shiftKey && Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      if (Math.abs(dx) < 2) return
      const viewW = Math.min(el.clientWidth, window.innerWidth)
      const noOverflow = el.scrollWidth <= viewW + 4
      const atStart = el.scrollLeft <= 2
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2
      if (dx < 0 && (atStart || noOverflow)) {
        if (noOverflow) slideByCols(-BUFFER_COLS)
        else setExtent((e) => ({ min: e.min - BUFFER_COLS, max: e.max }))
      } else if (dx > 0 && (atEnd || noOverflow)) {
        if (noOverflow) slideByCols(BUFFER_COLS)
        else setExtent((e) => ({ min: e.min, max: e.max + BUFFER_COLS }))
      }
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('wheel', onWheel)
    }
  }, [scrollRef, publishWindow, slideByCols])

  return {
    columns,
    colW,
    canvasWidth,
    extent,
    viewWindow,
    firstVisible,
    scrollLeft,
    viewportPx,
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
