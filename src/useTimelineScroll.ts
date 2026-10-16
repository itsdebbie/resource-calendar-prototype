import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { Zoom } from './data'
import { padColumns, wheelPanDelta, type ExtendEdge } from './interaction'
import {
  DAY_VIEW_DAYS,
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
  visibleFitCount,
  worldXForDate,
  type TimeWindow,
} from './timeline'

function visiblePx(el: HTMLElement, gutter: number) {
  return Math.min(2200, Math.max(320, Math.min(el.clientWidth, window.innerWidth) - gutter))
}

function growCols(zoom: Zoom, fit: number) {
  return Math.max(8, padColumns(zoom), fit)
}

function extentAround(
  zoom: Zoom,
  iso: string,
  viewportPx: number,
  colW: number,
  seedStart?: string,
  seedEnd?: string,
) {
  const idx = columnIndexAt(zoom, utc(iso))
  const pad = growCols(zoom, visibleFitCount(viewportPx, colW))
  const fit = zoom === 'days' ? Math.max(DAY_VIEW_DAYS, visibleFitCount(viewportPx, colW)) : visibleFitCount(viewportPx, colW)
  let min = idx - pad
  let max = idx + fit - 1 + pad
  if (seedStart) min = Math.min(min, columnIndexAt(zoom, utc(seedStart)))
  if (seedEnd) max = Math.max(max, columnIndexAt(zoom, utc(seedEnd)))
  return { min, max }
}

export function useTimelineScroll(
  zoom: Zoom,
  scrollRef: RefObject<HTMLDivElement | null>,
  options?: {
    gutter?: number
    initialIso?: string
    seedStartIso?: string
    seedEndIso?: string
    onEdge?: (edge: ExtendEdge) => void
  },
) {
  const gutter = options?.gutter ?? GUTTER
  const gutterRef = useRef(gutter)
  gutterRef.current = gutter
  const startIso = options?.initialIso ?? DEMO_TODAY
  const seedStartIso = options?.seedStartIso
  const seedEndIso = options?.seedEndIso
  const onEdgeRef = useRef(options?.onEdge)
  onEdgeRef.current = options?.onEdge
  const [viewportPx, setViewportPx] = useState(980)
  const colW = columnWidth(zoom, viewportPx)
  const anchorRef = useRef({ iso: startIso, offsetPx: 0 })
  const [extent, setExtent] = useState(() => extentAround(zoom, startIso, 980, columnWidth(zoom, 980), seedStartIso, seedEndIso))
  const startIndex = columnIndexAt(zoom, utc(startIso))
  const openingCount = zoom === 'days' ? DAY_VIEW_DAYS : 14
  const [viewWindow, setViewWindow] = useState<TimeWindow>(() => ({
    start: columnAtIndex(zoom, startIndex).start,
    end: columnAtIndex(zoom, startIndex + openingCount - 1).end,
  }))
  const [firstVisible, setFirstVisible] = useState(startIndex)
  const [lastVisible, setLastVisible] = useState(startIndex + openingCount - 1)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [alignNonce, setAlignNonce] = useState(0)
  const [alignedZoom, setAlignedZoom] = useState(zoom)

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

  function rebuildExtent(nextZoom: Zoom, iso: string) {
    return extentAround(nextZoom, iso, viewportPx, columnWidth(nextZoom, viewportPx), seedStartIso, seedEndIso)
  }

  if (alignedZoom !== zoom) {
    setAlignedZoom(zoom)
    pendingAlign.current = true
    readyRef.current = false
    const { iso, offsetPx } = anchorRef.current
    const next = rebuildExtent(zoom, iso)
    prevMin.current = next.min
    prevZoom.current = zoom
    setExtent((e) => (e.min === next.min && e.max === next.max ? e : next))
    if (Math.abs(offsetPx) < 1) {
      const idx = columnIndexAt(zoom, utc(iso))
      const count = Math.max(8, Math.ceil(viewportPx / columnWidth(zoom, viewportPx)))
      const start = columnAtIndex(zoom, idx).start
      const end = columnAtIndex(zoom, idx + count - 1).end
      setFirstVisible((prev) => (prev === idx ? prev : idx))
      setLastVisible((prev) => (prev === idx + count - 1 ? prev : idx + count - 1))
      setViewWindow((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
    }
  }

  const columns = useMemo(() => columnsInExtent(zoom, extent.min, extent.max), [zoom, extent.min, extent.max])
  const canvasWidth = gutter + columns.length * colW
  const visibleCount = Math.max(8, Math.ceil(viewportPx / colW))

  const publishWindow = useCallback((el: HTMLElement) => {
    const { min, max } = extentRef.current
    const width = colWRef.current
    const z = zoomRef.current
    const sl = el.scrollLeft
    const viewW = visiblePx(el, gutterRef.current)
    const i0 = Math.min(max, Math.max(min, min + Math.floor(sl / Math.max(1, width))))
    const i1 = Math.min(max, Math.max(i0, min + Math.floor((sl + viewW - 1) / Math.max(1, width))))
    const start = columnAtIndex(z, i0).start
    const end = columnAtIndex(z, i1).end
    setFirstVisible((prev) => (prev === i0 ? prev : i0))
    setLastVisible((prev) => (prev === i1 ? prev : i1))
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

  const expandToIndex = useCallback((index: number) => {
    setExtent((e) => {
      const z = zoomRef.current
      const el = scrollRef.current
      const fit = el ? visibleFitCount(visiblePx(el, gutterRef.current), colWRef.current) : 8
      const pad = growCols(z, fit)
      let { min, max } = e
      if (index < min) {
        min = index - pad
        onEdgeRef.current?.('start')
      }
      if (index > max) {
        max = index + pad
        onEdgeRef.current?.('end')
      }
      if (min === e.min && max === e.max) return e
      return { min, max }
    })
  }, [scrollRef])

  const slideByCols = useCallback((cols: number) => {
    if (!cols) return
    slideRef.current = true
    if (cols < 0) onEdgeRef.current?.('start')
    else onEdgeRef.current?.('end')
    setExtent((e) => ({ min: e.min + cols, max: e.max + cols }))
  }, [])

  const growAtEdge = useCallback((edge: ExtendEdge) => {
    const z = zoomRef.current
    const el = scrollRef.current
    const fit = el ? visibleFitCount(visiblePx(el, gutterRef.current), colWRef.current) : 8
    const pad = growCols(z, fit)
    onEdgeRef.current?.(edge)
    setExtent((e) => (edge === 'start' ? { min: e.min - pad, max: e.max } : { min: e.min, max: e.max + pad }))
  }, [scrollRef])

  const includeRange = useCallback((startIso: string, endIso: string) => {
    const z = zoomRef.current
    const a = columnIndexAt(z, utc(startIso))
    const b = columnIndexAt(z, utc(endIso))
    setExtent((e) => {
      const min = Math.min(e.min, a)
      const max = Math.max(e.max, b)
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
      setExtent(rebuildExtent(zoom, iso))
      setAlignNonce((n) => n + 1)
    },
    [zoom, viewportPx, seedStartIso, seedEndIso],
  )

  const ensureDate = useCallback(
    (iso: string) => {
      expandToIndex(columnIndexAt(zoom, utc(iso)))
    },
    [expandToIndex, zoom],
  )

  const fillAndGrow = useCallback(
    (el: HTMLElement, dx: number) => {
      const width = Math.max(1, colWRef.current)
      const viewW = Math.min(el.clientWidth, window.innerWidth)
      const noOverflow = el.scrollWidth <= viewW + width
      const pad = growCols(zoomRef.current, visibleFitCount(visiblePx(el, gutterRef.current), width))
      if (noOverflow) {
        slideByCols(Math.sign(dx || 1) * pad)
        return
      }
      if (dx < 0 && el.scrollLeft < width * pad) growAtEdge('start')
      else if (dx > 0 && el.scrollLeft + viewW > el.scrollWidth - width * pad) growAtEdge('end')
    },
    [growAtEdge, slideByCols],
  )

  const scrollBy = useCallback(
    (dx: number) => {
      const el = scrollRef.current
      if (!el) return
      fillAndGrow(el, dx)
      const before = el.scrollLeft
      el.scrollLeft += dx
      const moved = el.scrollLeft - before
      const leftIdx = extentRef.current.min + Math.floor(el.scrollLeft / Math.max(1, colWRef.current))
      const viewCols = Math.ceil(visiblePx(el, gutterRef.current) / Math.max(1, colWRef.current))
      if (Math.abs(moved) < 1 && Math.abs(dx) > 1) {
        const pad = growCols(zoomRef.current, viewCols)
        slideByCols(Math.sign(dx) * pad)
      } else {
        alignedAt.current = el.scrollLeft
        expandToIndex(leftIdx)
        expandToIndex(leftIdx + viewCols)
      }
      publishWindow(el)
    },
    [scrollRef, expandToIndex, publishWindow, slideByCols, fillAndGrow],
  )

  const autoScrollFromPointer = useCallback(
    (clientX: number, allow: { left?: boolean; right?: boolean } = {}) => {
      const el = scrollRef.current
      if (!el) return 0
      const allowLeft = allow.left !== false
      const allowRight = allow.right !== false
      const rect = el.getBoundingClientRect()
      const viewW = Math.min(el.clientWidth, window.innerWidth)
      const left = rect.left + gutterRef.current + EDGE_SCROLL_ZONE_PX
      const right = rect.left + viewW - EDGE_SCROLL_ZONE_PX
      let dx = 0
      if (allowRight && clientX > right) {
        dx = Math.min(EDGE_SCROLL_MAX_PX, EDGE_SCROLL_MIN_PX + (clientX - right) / EDGE_SCROLL_GAIN)
      } else if (allowLeft && clientX < left) {
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

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let frames = 0
    let raf = 0

    if (prevZoom.current !== zoom) {
      prevZoom.current = zoom
      pendingAlign.current = true
      readyRef.current = false
      const iso = anchorRef.current.iso
      const idx = columnIndexAt(zoom, utc(iso))
      setFirstVisible((prev) => (prev === idx ? prev : idx))
      const count = Math.max(8, Math.ceil(viewportPx / columnWidth(zoom, viewportPx)))
      const start = columnAtIndex(zoom, idx).start
      const end = columnAtIndex(zoom, idx + count - 1).end
      setViewWindow((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
      const next = rebuildExtent(zoom, iso)
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
      const missed = Math.abs(el.scrollLeft - target) > 2
      const canGrow = el.scrollWidth <= el.clientWidth + 4 && target > 2
      if (missed && frames < 24 && (canGrow || el.scrollLeft < 2)) {
        frames += 1
        raf = requestAnimationFrame(apply)
        return
      }
      alignedAt.current = el.scrollLeft
      prevMin.current = extent.min
      pendingAlign.current = false
      readyRef.current = true
      if (el.scrollWidth <= el.clientWidth + colW) {
        growAtEdge('end')
        growAtEdge('start')
      }
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
  }, [zoom, extent.min, extent.max, colW, alignNonce, scrollRef, publishWindow, viewportPx, extent, growAtEdge])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const onScroll = () => {
      publishWindow(el)
      if (!readyRef.current || pendingAlign.current) return
      const width = Math.max(1, colWRef.current)
      const viewW = Math.min(el.clientWidth, window.innerWidth)
      const pad = growCols(zoomRef.current, visibleFitCount(visiblePx(el, gutterRef.current), width))
      const noOverflow = el.scrollWidth <= viewW + width
      if (noOverflow) {
        growAtEdge('end')
        growAtEdge('start')
        return
      }
      if (Math.abs(el.scrollLeft - alignedAt.current) < 2) return
      alignedAt.current = el.scrollLeft
      if (el.scrollLeft < width * pad) growAtEdge('start')
      else if (el.scrollLeft + viewW > el.scrollWidth - width * pad) growAtEdge('end')
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [scrollRef, publishWindow, growAtEdge])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return
      const target = event.target
      if (!(target instanceof Element)) return
      const pane = el.parentElement
      if (!pane?.contains(target)) return
      const treatY = Boolean(target.closest('.rc-grid-head, .prod-head, .gantt-hscroll, .gantt-hscroll-thumb'))
      const dx = wheelPanDelta(event, treatY)
      if (Math.abs(dx) < 2) return
      const noOverflow = el.scrollWidth <= el.clientWidth + 4
      if (event.shiftKey || treatY || noOverflow) {
        event.preventDefault()
        scrollBy(dx)
      }
    }
    window.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => window.removeEventListener('wheel', onWheel, { capture: true })
  }, [scrollRef, scrollBy])

  return {
    columns,
    colW,
    canvasWidth,
    extent,
    viewWindow,
    firstVisible,
    lastVisible,
    scrollLeft,
    viewportPx,
    visibleCount,
    contextLabel: contextLabel(zoom, viewWindow),
    dateAtClientX,
    dateAtViewportCenter,
    jumpTo,
    ensureDate,
    includeRange,
    scrollBy,
    autoScrollFromPointer,
    setAnchor,
  }
}
