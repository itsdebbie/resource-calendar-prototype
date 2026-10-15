import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { Zoom } from './data'
import type { ExtendEdge } from './interaction'
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
  worldXForDate,
  type TimeWindow,
} from './timeline'
import type { ScrollDemoMode } from './scrollDemo'

function visiblePx(el: HTMLElement, gutter: number) {
  return Math.min(2200, Math.max(320, Math.min(el.clientWidth, window.innerWidth) - gutter))
}

function boundsExtent(zoom: Zoom, startIso: string, endIso: string) {
  return { min: columnIndexAt(zoom, utc(startIso)), max: columnIndexAt(zoom, utc(endIso)) }
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
    onNeedBound?: (edge: ExtendEdge, iso: string) => void
  },
) {
  const gutter = options?.gutter ?? GUTTER
  const gutterRef = useRef(gutter)
  gutterRef.current = gutter
  const startIso = options?.initialIso ?? DEMO_TODAY
  const mode = options?.mode ?? 'extend'
  const modeRef = useRef(mode)
  modeRef.current = mode
  const boundStartIso = options?.boundStartIso
  const boundEndIso = options?.boundEndIso
  const boundStartRef = useRef(boundStartIso)
  const boundEndRef = useRef(boundEndIso)
  boundStartRef.current = boundStartIso
  boundEndRef.current = boundEndIso
  const onNeedBoundRef = useRef(options?.onNeedBound)
  onNeedBoundRef.current = options?.onNeedBound
  const [viewportPx, setViewportPx] = useState(980)
  const colW = columnWidth(zoom, viewportPx)
  const anchorRef = useRef({ iso: startIso, offsetPx: 0 })
  const [extent, setExtent] = useState(() =>
    boundStartIso && boundEndIso ? boundsExtent(zoom, boundStartIso, boundEndIso) : boundsExtent(zoom, startIso, startIso),
  )
  const startIndex = columnIndexAt(zoom, utc(startIso))
  const openingCount = zoom === 'days' ? DAY_VIEW_DAYS : 14
  const [viewWindow, setViewWindow] = useState<TimeWindow>(() => ({
    start: columnAtIndex(zoom, startIndex).start,
    end: columnAtIndex(zoom, startIndex + openingCount - 1).end,
  }))
  const [firstVisible, setFirstVisible] = useState(startIndex)
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

  const boundIndexRange = useCallback(() => {
    const start = boundStartRef.current
    const end = boundEndRef.current
    if (!start || !end) return null
    const z = zoomRef.current
    return boundsExtent(z, start, end)
  }, [])

  function extentForZoom(nextZoom: Zoom, iso: string) {
    const start = boundStartRef.current
    const end = boundEndRef.current
    if (start && end) return boundsExtent(nextZoom, start, end)
    const idx = columnIndexAt(nextZoom, utc(iso))
    return { min: idx, max: idx }
  }

  if (alignedZoom !== zoom) {
    setAlignedZoom(zoom)
    pendingAlign.current = true
    readyRef.current = false
    const { iso, offsetPx } = anchorRef.current
    const next = extentForZoom(zoom, iso)
    prevMin.current = next.min
    prevZoom.current = zoom
    setExtent((e) => (e.min === next.min && e.max === next.max ? e : next))
    if (Math.abs(offsetPx) < 1) {
      const idx = columnIndexAt(zoom, utc(iso))
      const count = Math.max(8, Math.ceil(viewportPx / columnWidth(zoom, viewportPx)))
      const start = columnAtIndex(zoom, idx).start
      const end = columnAtIndex(zoom, idx + count - 1).end
      setFirstVisible((prev) => (prev === idx ? prev : idx))
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

  const requestBound = useCallback((index: number) => {
    if (modeRef.current !== 'extend') return
    const z = zoomRef.current
    const iso = isoFromTs(columnAtIndex(z, index).start)
    const bounds = boundIndexRange()
    if (!bounds) return
    if (index > bounds.max) onNeedBoundRef.current?.('end', iso)
    else if (index < bounds.min) onNeedBoundRef.current?.('start', iso)
  }, [boundIndexRange])

  const expandToIndex = useCallback(
    (index: number) => {
      requestBound(index)
      setExtent((e) => {
        const bounds = boundIndexRange()
        if (bounds) {
          const next = {
            min: Math.max(bounds.min, Math.min(e.min, index, bounds.max)),
            max: Math.min(bounds.max, Math.max(e.max, index, bounds.min)),
          }
          if (next.min === e.min && next.max === e.max) return e
          return next
        }
        return e
      })
    },
    [boundIndexRange, requestBound],
  )

  const setAnchor = useCallback((iso: string, offsetPx: number) => {
    anchorRef.current = { iso, offsetPx }
  }, [])

  const jumpTo = useCallback(
    (iso: string, offsetPx = 0) => {
      anchorRef.current = { iso, offsetPx }
      pendingAlign.current = true
      readyRef.current = false
      setExtent(extentForZoom(zoom, iso))
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
      const leftIdx = extentRef.current.min + Math.floor(el.scrollLeft / Math.max(1, colWRef.current))
      const viewCols = Math.ceil(visiblePx(el, gutterRef.current) / Math.max(1, colWRef.current))
      if (Math.abs(moved) < 1 && Math.abs(dx) > 1) {
        requestBound(dx > 0 ? leftIdx + viewCols + 1 : leftIdx - 1)
      } else {
        alignedAt.current = el.scrollLeft
        expandToIndex(leftIdx)
        expandToIndex(leftIdx + viewCols)
      }
      publishWindow(el)
    },
    [scrollRef, expandToIndex, publishWindow, requestBound],
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
      boundStartIso && boundEndIso ? boundsExtent(zoom, boundStartIso, boundEndIso) : null
    if (prevMode.current !== mode) {
      prevMode.current = mode
      pendingAlign.current = true
      readyRef.current = false
      if (bounds) setExtent(bounds)
      setAlignNonce((n) => n + 1)
      return
    }
    if (!bounds) return
    setExtent((e) => {
      const next = {
        min: Math.min(e.min, bounds.min) < bounds.min ? bounds.min : Math.max(bounds.min, Math.min(e.min, bounds.max)),
        max: Math.max(e.max, bounds.max) > bounds.max ? bounds.max : Math.min(bounds.max, Math.max(e.max, bounds.min)),
      }
      next.min = bounds.min
      next.max = bounds.max
      if (next.min === e.min && next.max === e.max) return e
      return next
    })
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
      const iso = anchorRef.current.iso
      const idx = columnIndexAt(zoom, utc(iso))
      setFirstVisible((prev) => (prev === idx ? prev : idx))
      const count = Math.max(8, Math.ceil(viewportPx / columnWidth(zoom, viewportPx)))
      const start = columnAtIndex(zoom, idx).start
      const end = columnAtIndex(zoom, idx + count - 1).end
      setViewWindow((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
      const next = extentForZoom(zoom, iso)
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
      if (Math.abs(offsetPx) < 1 && !missed) {
        const idx = columnIndexAt(zoom, utc(iso))
        setFirstVisible((prev) => (prev === idx ? prev : idx))
        const count = Math.max(8, Math.ceil(visiblePx(el, gutterRef.current) / colW))
        const start = columnAtIndex(zoom, idx).start
        const end = columnAtIndex(zoom, idx + count - 1).end
        setViewWindow((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
      } else {
        publishWindow(el)
      }
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
  }, [zoom, extent.min, extent.max, colW, alignNonce, scrollRef, publishWindow, viewportPx, extent])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      publishWindow(el)
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
