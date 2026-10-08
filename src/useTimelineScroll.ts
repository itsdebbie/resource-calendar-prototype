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

function extentAround(zoom: Zoom, iso: string, extra = 18) {
  const idx = columnIndexAt(zoom, utc(iso))
  return { min: idx - BUFFER_COLS, max: idx + BUFFER_COLS + extra }
}

export function useTimelineScroll(zoom: Zoom, scrollRef: RefObject<HTMLDivElement | null>) {
  const [viewportPx, setViewportPx] = useState(980)
  const colW = columnWidth(zoom, viewportPx)
  const anchorRef = useRef({ iso: DEMO_TODAY, offsetPx: 0 })
  const [extent, setExtent] = useState(() => extentAround(zoom, DEMO_TODAY))
  const [viewWindow, setViewWindow] = useState<TimeWindow>(() => {
    const idx = columnIndexAt(zoom, utc(DEMO_TODAY))
    return { start: columnAtIndex(zoom, idx).start, end: columnAtIndex(zoom, idx + 13).end }
  })
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

  const columns = useMemo(() => columnsInExtent(zoom, extent.min, extent.max), [zoom, extent.min, extent.max])

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
        if (idx >= e.min + 10 && idx <= e.max - 10) return e
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
      const leftIdx = extentRef.current.min + Math.floor(el.scrollLeft / colWRef.current)
      expandToIndex(leftIdx)
      expandToIndex(leftIdx + Math.ceil((el.clientWidth - GUTTER) / colWRef.current))
    },
    [scrollRef, expandToIndex],
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
      const visible = Math.min(el.clientWidth, el.getBoundingClientRect().width, window.innerWidth)
      const next = Math.min(2200, Math.max(400, visible - GUTTER))
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

    if (prevZoom.current !== zoom) {
      prevZoom.current = zoom
      pendingAlign.current = true
      readyRef.current = false
      const next = extentAround(zoom, anchorRef.current.iso)
      prevMin.current = next.min
      prevColW.current = colW
      if (next.min !== extent.min || next.max !== extent.max) {
        setExtent(next)
        return
      }
    } else if (prevColW.current !== colW && readyRef.current) {
      const iso = dateAtWorldX(zoom, extent.min, prevColW.current, el.scrollLeft)
      anchorRef.current = { iso, offsetPx: 0 }
      pendingAlign.current = true
      prevColW.current = colW
    } else {
      prevColW.current = colW
    }

    if (pendingAlign.current) {
      const { iso, offsetPx } = anchorRef.current
      el.scrollLeft = Math.max(0, worldXForDate(zoom, extent.min, colW, iso) - offsetPx)
      prevMin.current = extent.min
      pendingAlign.current = false
      readyRef.current = true
      const sl = el.scrollLeft
      const visible = Math.max(colW, el.clientWidth - GUTTER)
      const i0 = extent.min + Math.max(0, Math.floor(sl / colW))
      const i1 = extent.min + Math.max(i0, Math.ceil((sl + visible) / colW) - 1)
      const start = columnAtIndex(zoom, i0).start
      const end = columnAtIndex(zoom, i1).end
      setViewWindow((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
      return
    }

    const deltaCols = prevMin.current - extent.min
    if (deltaCols !== 0) {
      el.scrollLeft += deltaCols * colW
      prevMin.current = extent.min
    }
  }, [zoom, extent.min, extent.max, colW, alignNonce, scrollRef])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const readWindow = () => {
      const { min, max } = extentRef.current
      const width = colWRef.current
      const z = zoomRef.current
      const sl = el.scrollLeft
      const visible = Math.max(width, el.clientWidth - GUTTER)
      const i0 = min + Math.max(0, Math.floor(sl / width))
      const i1 = min + Math.max(i0, Math.ceil((sl + visible) / width) - 1)
      const start = columnAtIndex(z, i0).start
      const end = columnAtIndex(z, i1).end
      setViewWindow((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))

      if (!readyRef.current || pendingAlign.current) return
      const lead = i0 - min
      const trail = max - i1
      if (lead < 14) {
        setExtent((e) => (e.min === min - BUFFER_COLS ? e : { min: e.min - BUFFER_COLS, max: e.max }))
      } else if (trail < 14) {
        setExtent((e) => (e.max === max + BUFFER_COLS ? e : { min: e.min, max: e.max + BUFFER_COLS }))
      }
    }

    readWindow()
    el.addEventListener('scroll', readWindow, { passive: true })
    window.addEventListener('resize', readWindow)
    return () => {
      el.removeEventListener('scroll', readWindow)
      window.removeEventListener('resize', readWindow)
    }
  }, [scrollRef])

  return {
    columns,
    colW,
    extent,
    viewWindow,
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
