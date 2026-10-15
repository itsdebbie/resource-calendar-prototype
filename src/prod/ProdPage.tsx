import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  Avatar,
  Button,
  Checkbox,
  Chip,
  DateFieldSingle,
  Dialog,
  Icon,
  NumberField,
  SegmentedControl,
  Skeleton,
  Switch,
  Tab,
  Text,
  TextField,
  TimeField,
  toast,
} from '@servicetitan/anvil2'
import type { GroupBy, Zoom } from '../data'
import {
  addDays,
  clipBarToGutter,
  columnAtIndex,
  columnIndexAt,
  columnRenderBuffer,
  DAY_MS,
  diffDays,
  emptySpan,
  inTimeWindow,
  isoFromTs,
  monthBands,
  pickerAnchorStart,
  pickerLabel,
  visibleColumnRange,
  sliceVisibleColumns,
  utc,
  weekendsVisible,
  worldXForDate,
  yearBands,
  zoomStep,
  type Column,
  type Span,
} from '../timeline'
import { useTimelineScroll } from '../useTimelineScroll'
import { DateJumpPicker } from '../DateJumpPicker'
import { TimelineScrollbar } from '../TimelineScrollbar'
import { useWeekChunks } from '../useWeekChunks'
import { columnWeekLoading, fetchProdBarWeek, overlapsWeek, visibleRowWindow } from '../weekChunks'
import { extendBoundsAfterDrop, initialExtendBounds, snapDragIso, type ExtendEdge } from '../interaction'
import {
  CalendarIcon,
  ChevronRightIcon,
  DeleteIcon,
  DuplicateIcon,
  EditIcon,
  ExpandMoreIcon,
  RangeIcon,
  UnfoldLessIcon,
  UnfoldMoreIcon,
} from '../icons'
import {
  BAR_RADIUS,
  calendarProjectRows,
  calendarRows,
  firstLevelGroupIds,
  groupColorForRow,
  initialCalendarBars,
  initialScheduleBars,
  isDarkColor,
  PROD_TODAY,
  RC_GUTTER,
  RC_HEAD_H,
  ROW_H,
  rowHasChildren,
  rowHidden,
  rowLevel,
  SCHEDULE_GUTTER,
  SCHEDULE_HEAD_H,
  scheduleRows,
  stripColors,
  WORKDAY,
  type ProdBar,
  type ProdRow,
  type ProdView,
} from './prodData'
import './prod.css'

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_ABBR = ['SU', 'M', 'T', 'W', 'TH', 'F', 'SA']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const FIRST_LEVEL_IDS = firstLevelGroupIds()

function resizeStart(span: Span, next: string): Span {
  if (utc(next) > utc(span.end)) return { ...span, start: span.end }
  return { ...span, start: next }
}

function resizeEnd(span: Span, next: string): Span {
  if (utc(next) < utc(span.start)) return { ...span, end: span.start }
  return { ...span, end: next }
}

function shift(span: Span, days: number): Span {
  if (!days) return span
  return { start: addDays(span.start, days), end: addDays(span.end, days), offDays: [] }
}

function liveRangeLabel(start: string, end: string) {
  const a = new Date(utc(start))
  const b = new Date(utc(end))
  const n = diffDays(start, end) + 1
  return `${DAYS_SHORT[a.getUTCDay()]} ${MONTHS_SHORT[a.getUTCMonth()]} ${a.getUTCDate()} - ${DAYS_SHORT[b.getUTCDay()]} ${MONTHS_SHORT[b.getUTCMonth()]} ${b.getUTCDate()} (${n} day${n === 1 ? '' : 's'})`
}

function weekendsIn(start: string, end: string) {
  const out: string[] = []
  for (let t = utc(start); t <= utc(end); t += 86400000) {
    const day = new Date(t).getUTCDay()
    if (day === 0 || day === 6) out.push(isoFromTs(t))
  }
  return out
}

function barBox(start: string, end: string, minIndex: number, colW: number, colCount: number, zoom: Zoom) {
  const left = worldXForDate(zoom, minIndex, colW, start)
  const right = worldXForDate(zoom, minIndex, colW, addDays(end, 1))
  const canvasW = colCount * colW
  const visLeft = Math.max(left, 0)
  const visRight = Math.min(right, canvasW)
  if (visRight <= visLeft) return null
  return {
    left: visLeft,
    width: visRight - visLeft,
    visStart: columnIndexAt(zoom, utc(start)),
  }
}

function timeLine(bar: ProdBar) {
  return `${bar.startTime ?? WORKDAY.start} - ${bar.endTime ?? WORKDAY.end}`
}

function nextBarId() {
  return `bar-${Math.random().toString(36).slice(2, 10)}`
}

function eachDay(start: string, end: string) {
  const out: string[] = []
  for (let t = utc(start); t <= utc(end); t += 86400000) out.push(isoFromTs(t))
  return out
}

function cellId(barId: string, iso: string) {
  return `${barId}:${iso}`
}

function parseCell(id: string) {
  const i = id.indexOf(':')
  if (i < 0) return null
  return { barId: id.slice(0, i), iso: id.slice(i + 1) }
}

function clampIso(iso: string, start: string, end: string) {
  if (utc(iso) < utc(start)) return start
  if (utc(iso) > utc(end)) return end
  return iso
}

function barDays(bar: ProdBar) {
  return eachDay(bar.start, bar.end)
}

function keepCellsInRange(prev: Set<string>, ids: Set<string>, start: string, end: string) {
  const mapped = new Set<string>()
  for (const key of prev) {
    const parsed = parseCell(key)
    if (!parsed) continue
    if (!ids.has(parsed.barId)) mapped.add(key)
    else if (utc(parsed.iso) >= utc(start) && utc(parsed.iso) <= utc(end)) mapped.add(key)
  }
  return mapped
}

function removeDaysFromBar(bar: ProdBar, days: Set<string>): ProdBar[] {
  const remaining = barDays(bar).filter((iso) => !days.has(iso))
  if (!remaining.length) return []
  const spans: { start: string; end: string }[] = []
  let spanStart = remaining[0]!
  let prev = remaining[0]!
  for (let i = 1; i < remaining.length; i += 1) {
    const iso = remaining[i]!
    if (diffDays(prev, iso) === 1) {
      prev = iso
      continue
    }
    spans.push({ start: spanStart, end: prev })
    spanStart = iso
    prev = iso
  }
  spans.push({ start: spanStart, end: prev })
  return spans.map((span, index) => ({
    ...bar,
    id: index === 0 ? bar.id : nextBarId(),
    start: span.start,
    end: span.end,
  }))
}

type DragMode = 'move' | 'resize-start' | 'resize-end'
type DragState = {
  mode: DragMode
  id: string
  originDate: string
  snapshot: Span
  originRow: string
  originX: number
  originY: number
  lastX: number
  lastY: number
  moved: boolean
}
type ClickMods = { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; wholeBar?: boolean }

function rowAtPoint(clientY: number) {
  const nodes = document.querySelectorAll<HTMLElement>('[data-prod-row]')
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]
    if (!node) continue
    const rect = node.getBoundingClientRect()
    if (clientY >= rect.top && clientY < rect.bottom) return node.dataset.prodRow
  }
  return undefined
}

export function ProdPage({ view }: { view: ProdView }) {
  return <ProdGrid key={view} view={view} />
}

function ProdGrid({ view }: { view: ProdView }) {
  const isSchedule = view === 'schedule'
  const gutter = isSchedule ? SCHEDULE_GUTTER : RC_GUTTER
  const headH = isSchedule ? SCHEDULE_HEAD_H : RC_HEAD_H
  const [zoom, setZoom] = useState<Zoom>('days')
  const [groupBy, setGroupBy] = useState<GroupBy>('people')
  const [pinnedIso, setPinnedIso] = useState<string | null>(PROD_TODAY)
  const zoomLock = useRef(0)
  const rows = isSchedule ? scheduleRows : groupBy === 'projects' ? calendarProjectRows : calendarRows
  const hierarchical = isSchedule || groupBy === 'projects'
  const [bars, setBars] = useState<ProdBar[]>([])
  const dirtyIds = useRef(new Set<string>())
  const removedIds = useRef(new Set<string>())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [showWeekends, setShowWeekends] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [dupOpen, setDupOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editStart, setEditStart] = useState(PROD_TODAY)
  const [editEnd, setEditEnd] = useState(PROD_TODAY)
  const [editStartTime, setEditStartTime] = useState(WORKDAY.start)
  const [editEndTime, setEditEndTime] = useState(WORKDAY.end)
  const [editNotes, setEditNotes] = useState('')
  const [fullWorkday, setFullWorkday] = useState(true)
  const [editTab, setEditTab] = useState(0)
  const [shiftDays, setShiftDays] = useState<number | null>(0)
  const [dupStart, setDupStart] = useState(PROD_TODAY)
  const [dupEnd, setDupEnd] = useState(PROD_TODAY)
  const [dragHint, setDragHint] = useState<{ x: number; y: number; label: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const undoRef = useRef<ProdBar[] | null>(null)
  const barsRef = useRef(bars)
  barsRef.current = bars
  const ignoreClick = useRef(false)
  const selectAnchor = useRef<string | null>(null)
  const dragCellsRef = useRef<string[]>([])
  const seedBars = isSchedule ? initialScheduleBars : initialCalendarBars
  const seedBounds = useMemo(() => initialExtendBounds(PROD_TODAY, seedBars), [seedBars])
  const hitEdgeRef = useRef<ExtendEdge | null>(null)
  const onEdge = useCallback((edge: ExtendEdge) => {
    hitEdgeRef.current = edge
  }, [])
  const timeline = useTimelineScroll(zoom, scrollRef, {
    gutter,
    initialIso: PROD_TODAY,
    seedStartIso: seedBounds.start,
    seedEndIso: seedBounds.end,
    onEdge,
  })
  const {
    columns,
    colW,
    canvasWidth,
    dateAtClientX,
    jumpTo,
    firstVisible,
    lastVisible,
    scrollLeft,
    viewWindow,
    visibleCount,
    extent,
    autoScrollFromPointer,
    setAnchor,
    includeRange,
  } = timeline
  const viewWindowRef = useRef(viewWindow)
  viewWindowRef.current = viewWindow
  const extentRef = useRef(extent)
  extentRef.current = extent
  const includeRangeRef = useRef(includeRange)
  includeRangeRef.current = includeRange
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const visColumns = useMemo(
    () => sliceVisibleColumns(columns, firstVisible, visibleCount, columnRenderBuffer(zoom)),
    [columns, firstVisible, visibleCount, zoom],
  )
  const headerCols = useMemo(
    () => sliceVisibleColumns(columns, firstVisible, visibleCount, Math.max(31, columnRenderBuffer(zoom))),
    [columns, firstVisible, visibleCount, zoom],
  )
  const firstVisibleIso = isoFromTs(columnAtIndex(zoom, firstVisible).start)
  const pickerStart = pickerAnchorStart(zoom, firstVisibleIso, pinnedIso)
  const visibleRange = visibleColumnRange(zoom, firstVisible, lastVisible)
  const pickerText = pickerLabel(zoom, visibleRange.start, visibleRange.end)
  const changeZoom = useCallback(
    (next: Zoom, iso?: string, offsetPx?: number) => {
      if (next === zoom) return
      setAnchor(iso ?? firstVisibleIso, offsetPx ?? 0)
      if (next !== 'days' && next !== 'weeks') setPinnedIso(null)
      setZoom(next)
    },
    [zoom, firstVisibleIso, setAnchor],
  )
  const pickDate = useCallback(
    (iso: string) => {
      setPinnedIso(iso)
      jumpTo(iso, 0)
    },
    [jumpTo],
  )
  const fetchWeek = useCallback(
    (week: string) => fetchProdBarWeek(isSchedule ? initialScheduleBars : initialCalendarBars, week),
    [isSchedule],
  )
  const chunks = useWeekChunks(viewWindow, fetchWeek, {
    resetKey: view,
  })
  const setBarsUser = useCallback((action: ProdBar[] | ((prev: ProdBar[]) => ProdBar[])) => {
    setBars((prev) => {
      const next = typeof action === 'function' ? action(prev) : action
      const nextIds = new Set(next.map((bar) => bar.id))
      for (const bar of prev) {
        if (!nextIds.has(bar.id)) removedIds.current.add(bar.id)
      }
      for (const bar of next) {
        const old = prev.find((item) => item.id === bar.id)
        if (
          !old ||
          old.start !== bar.start ||
          old.end !== bar.end ||
          old.rowId !== bar.rowId ||
          old.notes !== bar.notes ||
          old.startTime !== bar.startTime ||
          old.endTime !== bar.endTime
        ) {
          dirtyIds.current.add(bar.id)
        }
      }
      return next
    })
  }, [])
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(480)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const sync = () => {
      setScrollTop(el.scrollTop)
      setViewportH(el.clientHeight)
    }
    sync()
    el.addEventListener('scroll', sync, { passive: true })
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', sync)
      ro.disconnect()
    }
  }, [])
  const dateAtClientXRef = useRef(dateAtClientX)
  dateAtClientXRef.current = dateAtClientX
  const autoScrollRef = useRef(autoScrollFromPointer)
  autoScrollRef.current = autoScrollFromPointer
  const minIndex = columns[0]?.index ?? 0

  useEffect(() => {
    dirtyIds.current = new Set()
    removedIds.current = new Set()
    setBars([])
    setSelected(new Set())
    setEditOpen(false)
    setDupOpen(false)
    setConfirmDelete(false)
    setCollapsed(new Set())
    setDraggingId(null)
    setDragHint(null)
    dragRef.current = null
    selectAnchor.current = null
    jumpTo(PROD_TODAY)
  }, [isSchedule, jumpTo])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const now = performance.now()
      if (now - zoomLock.current < 160) return
      zoomLock.current = now
      const rect = el.getBoundingClientRect()
      changeZoom(zoomStep(zoom, event.deltaY < 0 ? -1 : 1), dateAtClientX(event.clientX), event.clientX - rect.left - gutter)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoom, dateAtClientX, changeZoom, gutter])

  useEffect(() => {
    const loaded = chunks.loadedWeeks
    const fetched = chunks.items
    const dirty = dirtyIds.current
    const removed = removedIds.current
    setBars((prev) => {
      const map = new Map<string, ProdBar>()
      for (const bar of prev) map.set(bar.id, bar)
      for (const bar of fetched) {
        if (removed.has(bar.id) || dirty.has(bar.id)) continue
        if (!map.has(bar.id)) map.set(bar.id, bar)
      }
      for (const [id, bar] of [...map]) {
        if (dirty.has(id)) continue
        if (removed.has(id) || (loaded.length > 0 && !loaded.some((week) => overlapsWeek(bar.start, bar.end, week)))) {
          map.delete(id)
        }
      }
      const next = [...map.values()]
      if (next.length === prev.length && next.every((bar, i) => bar === prev[i])) return prev
      return next
    })
  }, [chunks.items, chunks.loadedWeeks])

  const visibleRows = useMemo(() => {
    if (!hierarchical) return rows
    return rows.filter((row) => !rowHidden(row, collapsed, rows))
  }, [rows, collapsed, hierarchical])

  const rowSlice = useMemo(
    () => visibleRowWindow(visibleRows.length, Math.max(0, scrollTop - headH), Math.max(ROW_H, viewportH - headH), ROW_H),
    [visibleRows.length, scrollTop, viewportH, headH],
  )
  const shownRows = visibleRows.slice(rowSlice.start, rowSlice.end + 1)
  const visRange = {
    start: visColumns[0]?.start ?? viewWindow.start,
    end: visColumns[visColumns.length - 1]?.end ?? viewWindow.end,
  }

  const orderedCells = useMemo(() => {
    const cells: string[] = []
    for (const row of visibleRows) {
      for (const bar of bars) {
        if (bar.rowId !== row.id || bar.readOnly) continue
        for (const iso of barDays(bar)) cells.push(cellId(bar.id, iso))
      }
    }
    return cells
  }, [visibleRows, bars])

  const selectedBarIds = useMemo(() => {
    const ids = new Set<string>()
    for (const key of selected) {
      const parsed = parseCell(key)
      if (parsed) ids.add(parsed.barId)
    }
    return ids
  }, [selected])

  const selectedBars = useMemo(
    () => bars.filter((bar) => selectedBarIds.has(bar.id) && !bar.readOnly),
    [bars, selectedBarIds],
  )
  const selectedCount = selected.size
  const selectedScheduleCount = selectedBars.length

  const applyDrag = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragRef.current
      if (!drag) return
      drag.lastX = clientX
      drag.lastY = clientY
      if (Math.abs(clientX - drag.originX) > 4 || Math.abs(clientY - drag.originY) > 4) {
        drag.moved = true
        ignoreClick.current = true
        setDraggingId(drag.id)
        document.body.classList.add('prod-grabbing')
      }
      if (!drag.moved) return
      const raw = dateAtClientXRef.current(clientX)
      const snapEdge = drag.mode === 'resize-start' ? 'start' : drag.mode === 'resize-end' ? 'end' : 'point'
      const date = snapDragIso(zoom, raw, snapEdge)
      const origin = snapDragIso(zoom, drag.originDate, 'point')
      let next = drag.snapshot
      if (drag.mode === 'move') next = shift(drag.snapshot, diffDays(origin, date))
      else if (drag.mode === 'resize-start') next = resizeStart(drag.snapshot, date)
      else next = resizeEnd(drag.snapshot, date)
      let nextRow = drag.originRow
      if (drag.mode === 'move') {
        const hit = rowAtPoint(clientY)
        if (!isSchedule) {
          if (hit) nextRow = hit
        } else {
          const src = scheduleRows.find((r) => r.id === drag.originRow)
          const dst = scheduleRows.find((r) => r.id === hit)
          if (hit && dst?.kind === 'tech' && src?.parentId && dst.parentId === src.parentId) nextRow = hit
        }
      }
      setBarsUser((prev) => {
        const current = prev.find((bar) => bar.id === drag.id)
        if (current && current.start === next.start && current.end === next.end && current.rowId === nextRow) return prev
        return prev.map((bar) => (bar.id === drag.id ? { ...bar, rowId: nextRow, start: next.start, end: next.end } : bar))
      })
      const current = barsRef.current.find((bar) => bar.id === drag.id)
      if (!current || current.start !== next.start || current.end !== next.end) {
        setSelected((prev) => {
          const mapped = new Set<string>()
          if (drag.mode === 'move') {
            const delta = diffDays(drag.snapshot.start, next.start)
            for (const key of prev) {
              const parsed = parseCell(key)
              if (!parsed || parsed.barId !== drag.id) mapped.add(key)
            }
            for (const key of dragCellsRef.current) {
              const parsed = parseCell(key)
              if (!parsed) continue
              mapped.add(cellId(parsed.barId, addDays(parsed.iso, delta)))
            }
          } else {
            for (const key of prev) {
              const parsed = parseCell(key)
              if (!parsed) continue
              if (parsed.barId !== drag.id) {
                mapped.add(key)
                continue
              }
              if (utc(parsed.iso) >= utc(next.start) && utc(parsed.iso) <= utc(next.end)) mapped.add(key)
            }
          }
          return mapped
        })
      }
      const label = liveRangeLabel(next.start, next.end)
      setDragHint((prev) =>
        prev && prev.x === clientX && prev.y === clientY && prev.label === label ? prev : { x: clientX, y: clientY, label },
      )
    },
    [isSchedule, setBarsUser, zoom],
  )
  const applyDragRef = useRef(applyDrag)
  applyDragRef.current = applyDrag

  const endDrag = useCallback(() => {
    const drag = dragRef.current
    setDragHint(null)
    setDraggingId(null)
    document.body.classList.remove('prod-grabbing')
    if (!drag) return
    dragRef.current = null
    if (!drag.moved) return
    const bar = barsRef.current.find((item) => item.id === drag.id)
    if (bar) {
      const z = zoomRef.current
      const ext = extentRef.current
      const next = extendBoundsAfterDrop(
        bar.start,
        bar.end,
        isoFromTs(columnAtIndex(z, ext.min).start),
        isoFromTs(columnAtIndex(z, ext.max).end - DAY_MS),
        z,
        viewWindowRef.current,
        hitEdgeRef.current,
      )
      includeRangeRef.current(next.start, next.end)
    }
    hitEdgeRef.current = null
    const before = undoRef.current
    undoRef.current = null
    if (drag.mode === 'move' && isSchedule) {
      const hit = rowAtPoint(drag.lastY)
      const src = scheduleRows.find((r) => r.id === drag.originRow)
      const dst = scheduleRows.find((r) => r.id === hit)
      if (hit && dst && src?.parentId && dst.parentId !== src.parentId) {
        toast.danger({
          title: "Can't move schedule here",
          message: 'You can only move a schedule within the same task or group.',
        })
        return
      }
    }
    window.setTimeout(() => {
      toast.success({
        title: drag.mode === 'move' ? 'Schedule moved' : 'Schedule updated',
        actions: {
          primary: {
            label: 'Undo',
            onClick: () => {
              if (before) setBarsUser(before)
            },
          },
        },
      })
    }, 0)
  }, [isSchedule, setBarsUser])

  useEffect(() => {
    const onMove = (event: PointerEvent | MouseEvent) => {
      if (!dragRef.current) return
      applyDragRef.current(event.clientX, event.clientY)
    }
    const onUp = () => {
      if (dragRef.current) endDrag()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [endDrag])

  useEffect(() => {
    if (!draggingId) return
    let raf = 0
    const tick = () => {
      const drag = dragRef.current
      if (drag) {
        autoScrollRef.current(drag.lastX)
        applyDragRef.current(drag.lastX, drag.lastY)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [draggingId])

  function startDrag(event: ReactPointerEvent, bar: ProdBar, mode: DragMode) {
    if (bar.readOnly) return
    if (event.button > 0) return
    if (mode === 'move' && (event.shiftKey || event.ctrlKey || event.metaKey)) return
    event.preventDefault()
    event.stopPropagation()
    undoRef.current = barsRef.current.map((b) => ({ ...b }))
    dragCellsRef.current = [...selected].filter((key) => parseCell(key)?.barId === bar.id)
    dragRef.current = {
      mode,
      id: bar.id,
      originDate: dateAtClientXRef.current(event.clientX),
      snapshot: emptySpan(bar.start, bar.end),
      originRow: bar.rowId,
      originX: event.clientX,
      originY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    }
  }

  function onBarClick(id: string, iso: string, mods: ClickMods = {}) {
    if (ignoreClick.current) {
      ignoreClick.current = false
      return
    }
    const bar = barsRef.current.find((item) => item.id === id)
    if (!bar || bar.readOnly) return
    const clicked = cellId(id, clampIso(iso, bar.start, bar.end))
    const additive = Boolean(mods.metaKey || mods.ctrlKey)
    const range = Boolean(mods.shiftKey)
    const whole = Boolean(mods.wholeBar)
    const barCells = barDays(bar).map((day) => cellId(bar.id, day))
    setSelected((prev) => {
      if (range && selectAnchor.current) {
        const a = orderedCells.indexOf(selectAnchor.current)
        const b = orderedCells.indexOf(clicked)
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a]
          return new Set(orderedCells.slice(lo, hi + 1))
        }
      }
      if (whole) {
        selectAnchor.current = clicked
        if (additive) {
          const next = new Set(prev)
          const allOn = barCells.every((cell) => next.has(cell))
          if (allOn) for (const cell of barCells) next.delete(cell)
          else for (const cell of barCells) next.add(cell)
          return next
        }
        return new Set(barCells)
      }
      if (additive) {
        selectAnchor.current = clicked
        const next = new Set(prev)
        if (next.has(clicked)) next.delete(clicked)
        else next.add(clicked)
        return next
      }
      selectAnchor.current = clicked
      return new Set([clicked])
    })
  }

  function clearSelection() {
    setSelected(new Set())
    selectAnchor.current = null
    setEditOpen(false)
    setDupOpen(false)
    setConfirmDelete(false)
  }

  function openEdit() {
    const first = selectedBars[0]
    if (!first) return
    setEditStart(first.start)
    setEditEnd(first.end)
    setEditStartTime(first.startTime ?? WORKDAY.start)
    setEditEndTime(first.endTime ?? WORKDAY.end)
    setEditNotes(first.notes ?? '')
    const startT = first.startTime ?? WORKDAY.start
    const endT = first.endTime ?? WORKDAY.end
    setFullWorkday(startT === WORKDAY.start && endT === WORKDAY.end)
    setEditTab(0)
    setShiftDays(0)
    setDupOpen(false)
    setEditOpen(true)
  }

  function applyChangeTime(ids: Set<string>) {
    if (utc(editStart) > utc(editEnd)) return false
    setBarsUser((prev) =>
      prev.map((bar) =>
        ids.has(bar.id)
          ? {
              ...bar,
              start: editStart,
              end: editEnd,
              startTime: editStartTime,
              endTime: editEndTime,
              notes: editNotes,
            }
          : bar,
      ),
    )
    return true
  }

  function saveEdit() {
    if (!selectedBars.length) return
    const ids = new Set(selectedBars.map((bar) => bar.id))
    const before = bars.map((b) => ({ ...b }))
    if (editTab === 1) {
      const n = shiftDays ?? 0
      if (n) {
        setBarsUser((prev) =>
          prev.map((bar) =>
            ids.has(bar.id) ? { ...bar, start: addDays(bar.start, n), end: addDays(bar.end, n) } : bar,
          ),
        )
        setSelected((prev) => {
          const mapped = new Set<string>()
          for (const key of prev) {
            const parsed = parseCell(key)
            if (!parsed) continue
            if (!ids.has(parsed.barId)) mapped.add(key)
            else mapped.add(cellId(parsed.barId, addDays(parsed.iso, n)))
          }
          return mapped
        })
      } else if (!applyChangeTime(ids)) {
        return
      } else {
        setSelected((prev) => keepCellsInRange(prev, ids, editStart, editEnd))
      }
    } else if (!applyChangeTime(ids)) {
      return
    } else {
      setSelected((prev) => keepCellsInRange(prev, ids, editStart, editEnd))
    }
    setEditOpen(false)
    toast.success({
      title: 'Schedule updated',
      actions: {
        primary: {
          label: 'Undo',
          onClick: () => setBarsUser(before),
        },
      },
    })
  }

  function openDuplicate() {
    const first = selectedBars[0]
    if (!first) return
    setDupStart(first.start)
    setDupEnd(first.end)
    setEditOpen(false)
    setDupOpen(true)
  }

  function confirmDuplicate() {
    if (!selectedBars.length) return
    if (utc(dupStart) > utc(dupEnd)) return
    const clones = selectedBars.map((bar) => ({
      ...bar,
      id: nextBarId(),
      start: dupStart,
      end: dupEnd,
      color: isSchedule ? groupColorForRow(bar.rowId) : bar.color,
    }))
    setBarsUser((prev) => [...prev, ...clones])
    setDupOpen(false)
    toast.success({ title: 'Schedule duplicated' })
  }

  function selectRange() {
    if (!selectedBars.length) return
    const next = new Set<string>()
    for (const bar of selectedBars) {
      for (const iso of barDays(bar)) next.add(cellId(bar.id, iso))
    }
    setSelected(next)
  }

  function confirmRemove() {
    const daysByBar = new Map<string, Set<string>>()
    for (const key of selected) {
      const parsed = parseCell(key)
      if (!parsed) continue
      let days = daysByBar.get(parsed.barId)
      if (!days) {
        days = new Set()
        daysByBar.set(parsed.barId, days)
      }
      days.add(parsed.iso)
    }
    setBarsUser((prev) => {
      const next: ProdBar[] = []
      for (const bar of prev) {
        const days = daysByBar.get(bar.id)
        if (!days) next.push(bar)
        else next.push(...removeDaysFromBar(bar, days))
      }
      return next
    })
    clearSelection()
  }

  const allFirstCollapsed = FIRST_LEVEL_IDS.length > 0 && FIRST_LEVEL_IDS.every((id) => collapsed.has(id))
  const collapseDisabled = FIRST_LEVEL_IDS.length === 0

  useEffect(() => {
    if (selectedCount === 0) {
      setEditOpen(false)
      setDupOpen(false)
      setConfirmDelete(false)
    }
  }, [selectedCount])

  return (
    <div className={`prod-page${isSchedule ? ' is-schedule' : ' is-calendar'}${editOpen || dupOpen ? ' has-panel' : ''}`}>
      <div className="prod-chrome">
        {isSchedule ? (
          <>
            <div className="prod-title-row">
              <h1 className="prod-title">Project Plan</h1>
              <span className="prod-title-menu" aria-hidden />
            </div>
            <div className="prod-tabs">
              <button type="button">Table</button>
              <button type="button">Gantt</button>
              <button type="button" className="is-on">
                Schedule
              </button>
            </div>
          </>
        ) : (
          <div className="prod-rc-nav">
            <button type="button">Project</button>
            <button type="button">Tasks</button>
            <button type="button">Backlog</button>
            <button type="button" className="is-on">
              Resource Calendar
            </button>
          </div>
        )}
        <div className="prod-toolbar">
          {isSchedule ? (
            <Button
              size="small"
              appearance="secondary"
              icon={allFirstCollapsed ? UnfoldMoreIcon : UnfoldLessIcon}
              disabled={collapseDisabled}
              onClick={() =>
                setCollapsed((prev) => {
                  if (allFirstCollapsed) {
                    const next = new Set(prev)
                    for (const id of FIRST_LEVEL_IDS) next.delete(id)
                    return next
                  }
                  const next = new Set(prev)
                  for (const id of FIRST_LEVEL_IDS) next.add(id)
                  return next
                })
              }
            >
              {allFirstCollapsed ? 'Expand All' : 'Collapse All'}
            </Button>
          ) : null}
          <Button size="small" appearance="secondary" onClick={() => pickDate(PROD_TODAY)}>
            Today
          </Button>
          <DateJumpPicker zoom={zoom} value={pickerStart} label={pickerText} onPick={pickDate} />
          {!isSchedule ? (
            <SegmentedControl size="small" selected={groupBy} onChange={(value) => setGroupBy(value as GroupBy)}>
              <SegmentedControl.Segment value="people">People</SegmentedControl.Segment>
              <SegmentedControl.Segment value="projects">Projects</SegmentedControl.Segment>
            </SegmentedControl>
          ) : null}
          <SegmentedControl size="small" selected={zoom} onChange={(value) => changeZoom(value as Zoom)}>
            <SegmentedControl.Segment value="days">Day</SegmentedControl.Segment>
            <SegmentedControl.Segment value="weeks">Week</SegmentedControl.Segment>
            <SegmentedControl.Segment value="months">Month</SegmentedControl.Segment>
            <SegmentedControl.Segment value="quarters">Quarter</SegmentedControl.Segment>
            <SegmentedControl.Segment value="year">Year</SegmentedControl.Segment>
          </SegmentedControl>
          <div className="prod-toolbar-end">
            {!isSchedule ? (
              <Switch label="Show Weekends" checked={showWeekends} onChange={(_, state) => setShowWeekends(state.checked)} />
            ) : null}
            <span className="prod-hint">SHIFT + click Range &nbsp; ⌘ / CTRL + click Multiple</span>
          </div>
        </div>
        {!isSchedule ? (
          <div className="prod-filters">
            <button type="button" className="prod-filter">
              Project ▾
            </button>
            <button type="button" className="prod-filter">
              Business Units ▾
            </button>
            <button type="button" className="prod-filter">
              Skills ▾
            </button>
          </div>
        ) : null}
      </div>

      <div className="prod-body">
        <div className="prod-board">
          <div className="prod-scroll" ref={scrollRef}>
            <div className="prod-canvas" style={{ width: canvasWidth }}>
              <HeadRow
                isSchedule={isSchedule}
                groupBy={groupBy}
                zoom={zoom}
                gutter={gutter}
                headH={headH}
                columns={headerCols}
                colW={colW}
                minIndex={minIndex}
                showWeekends={showWeekends}
                scrollLeft={scrollLeft}
                loadingWeeks={chunks.loadingSet}
                canvasCols={columns.length}
              />
              {rowSlice.padTop > 0 ? <div className="prod-virt-pad" style={{ height: rowSlice.padTop }} aria-hidden /> : null}
              {shownRows.map((row) => (
                <DataRow
                  key={row.id}
                  row={row}
                  rows={rows}
                  hierarchical={hierarchical}
                  zoom={zoom}
                  isSchedule={isSchedule}
                  gutter={gutter}
                  columns={visColumns}
                  colW={colW}
                  minIndex={minIndex}
                  canvasCols={columns.length}
                  showWeekends={showWeekends}
                  scrollLeft={scrollLeft}
                  collapsed={collapsed.has(row.id)}
                  onToggle={() =>
                    setCollapsed((prev) => {
                      const next = new Set(prev)
                      if (next.has(row.id)) next.delete(row.id)
                      else next.add(row.id)
                      return next
                    })
                  }
                  bars={bars.filter(
                    (b) =>
                      b.rowId === row.id &&
                      (b.id === draggingId || inTimeWindow(b.start, b.end, visRange)),
                  )}
                  selected={selected}
                  draggingId={draggingId}
                  dateAtClientX={dateAtClientX}
                  onClear={clearSelection}
                  onBarClick={onBarClick}
                  onDragStart={startDrag}
                  loadingWeeks={chunks.loadingSet}
                />
              ))}
              {rowSlice.padBottom > 0 ? <div className="prod-virt-pad" style={{ height: rowSlice.padBottom }} aria-hidden /> : null}
            </div>
          </div>
          <TimelineScrollbar scrollRef={scrollRef} />
          {selectedCount > 0 ? (
            <div className="prod-action">
              <span className="prod-action-count">
                <strong>{selectedCount}</strong> items selected
              </span>
              <Button size="small" appearance="ghost" onClick={clearSelection}>
                Clear Selection
              </Button>
              <Button size="small" appearance="secondary" icon={RangeIcon} onClick={selectRange}>
                Select Range
              </Button>
              <Button size="small" appearance="secondary" icon={DuplicateIcon} onClick={openDuplicate}>
                Duplicate
              </Button>
              <Button size="small" appearance="secondary" icon={DeleteIcon} onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
              <Button size="small" appearance="primary" icon={EditIcon} onClick={openEdit}>
                {selectedScheduleCount > 1 ? 'Bulk Edit' : 'Edit'}
              </Button>
            </div>
          ) : null}
        </div>
        {editOpen ? (
          <aside className="prod-edit" aria-label={selectedScheduleCount > 1 ? 'Bulk Edit' : 'Edit schedule'}>
            <div className="prod-edit-head">
              <Text size="large">{selectedScheduleCount > 1 ? 'Bulk Edit' : 'Edit schedule'}</Text>
              <Button size="small" appearance="ghost" onClick={() => setEditOpen(false)}>
                Close
              </Button>
            </div>
            <div className="prod-edit-body">
              <Tab index={editTab} onIndexChange={setEditTab}>
                <Tab.List>
                  <Tab.Button id="prod-tab-time" controls="prod-panel-time">
                    Change Time
                  </Tab.Button>
                  <Tab.Button id="prod-tab-shift" controls="prod-panel-shift">
                    Shift Dates
                  </Tab.Button>
                </Tab.List>
                <Tab.Panel id="prod-panel-time">
                  <div className="prod-edit-fields">
                    <DateFieldSingle label="Start date" value={editStart} onChange={(c) => c.date && c.isDateValid && setEditStart(c.date)} />
                    <DateFieldSingle label="End date" value={editEnd} onChange={(c) => c.date && c.isDateValid && setEditEnd(c.date)} />
                    <TimeField
                      label="Start time"
                      format={12}
                      value={editStartTime}
                      onChange={(c) => {
                        if (c.time && c.isInputValid) {
                          setEditStartTime(c.time)
                          setFullWorkday(c.time === WORKDAY.start && editEndTime === WORKDAY.end)
                        }
                      }}
                    />
                    <TimeField
                      label="End time"
                      format={12}
                      value={editEndTime}
                      onChange={(c) => {
                        if (c.time && c.isInputValid) {
                          setEditEndTime(c.time)
                          setFullWorkday(editStartTime === WORKDAY.start && c.time === WORKDAY.end)
                        }
                      }}
                    />
                    <TextField label="Notes" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
                    <Checkbox
                      label="Full workday"
                      checked={fullWorkday}
                      onChange={(_, state) => {
                        const checked = Boolean(state?.checked)
                        setFullWorkday(checked)
                        if (checked) {
                          setEditStartTime(WORKDAY.start)
                          setEditEndTime(WORKDAY.end)
                        }
                      }}
                    />
                  </div>
                </Tab.Panel>
                <Tab.Panel id="prod-panel-shift">
                  <div className="prod-edit-fields">
                    <NumberField
                      label="Shift by N days"
                      value={shiftDays}
                      onChange={setShiftDays}
                      step={1}
                    />
                  </div>
                </Tab.Panel>
              </Tab>
            </div>
            <div className="prod-edit-foot">
              <Button appearance="secondary" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button appearance="primary" onClick={saveEdit}>
                Save
              </Button>
            </div>
          </aside>
        ) : dupOpen ? (
          <aside className="prod-edit" aria-label="Duplicate">
            <div className="prod-edit-head">
              <Text size="large">Duplicate</Text>
              <Button size="small" appearance="ghost" onClick={() => setDupOpen(false)}>
                Close
              </Button>
            </div>
            <div className="prod-edit-body">
              <div className="prod-edit-fields">
                <DateFieldSingle label="Start date" value={dupStart} onChange={(c) => c.date && c.isDateValid && setDupStart(c.date)} />
                <DateFieldSingle label="End date" value={dupEnd} onChange={(c) => c.date && c.isDateValid && setDupEnd(c.date)} />
              </div>
            </div>
            <div className="prod-edit-foot">
              <Button appearance="secondary" onClick={() => setDupOpen(false)}>
                Cancel
              </Button>
              <Button appearance="primary" onClick={confirmDuplicate}>
                Duplicate
              </Button>
            </div>
          </aside>
        ) : null}
      </div>
      {!isSchedule ? (
        <div className="prod-tray">
          <span>Schedule Resources</span>
        </div>
      ) : null}

      {dragHint ? (
        <div className="prod-drag-tip" style={{ left: dragHint.x, top: dragHint.y }}>
          {dragHint.label}
        </div>
      ) : null}

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <Dialog.Header>Delete selection?</Dialog.Header>
        <Dialog.Content>
          <Text>
            This will permanently delete {selectedCount} block{selectedCount === 1 ? '' : 's'} across{' '}
            {selectedScheduleCount} schedule{selectedScheduleCount === 1 ? '' : 's'}. This cannot be undone.
          </Text>
        </Dialog.Content>
        <Dialog.Footer>
          <Dialog.CancelButton>Cancel</Dialog.CancelButton>
          <Button appearance="danger" onClick={confirmRemove}>
            Delete
          </Button>
        </Dialog.Footer>
      </Dialog>
    </div>
  )
}

function HeadRow({
  isSchedule,
  groupBy,
  zoom,
  gutter,
  headH,
  columns,
  colW,
  minIndex,
  showWeekends,
  scrollLeft,
  loadingWeeks,
  canvasCols,
}: {
  isSchedule: boolean
  groupBy: GroupBy
  zoom: Zoom
  gutter: number
  headH: number
  columns: Column[]
  colW: number
  minIndex: number
  showWeekends: boolean
  scrollLeft: number
  loadingWeeks: Set<string>
  canvasCols: number
}) {
  const showMonthBand = zoom === 'days' || zoom === 'weeks'
  const bands = showMonthBand ? monthBands(columns) : yearBands(columns)
  const today = utc(PROD_TODAY)
  return (
    <div
      className="prod-head"
      style={{
        gridTemplateColumns: `${gutter}px max-content`,
        height: headH,
      }}
    >
      <div className="prod-gutter" style={{ width: gutter, height: headH }}>
        {isSchedule ? (
          <>
            <span className="prod-wbs">WBS</span>
            <span>Name</span>
          </>
        ) : (
          <span>{groupBy === 'projects' ? 'Projects' : 'Technicians'}</span>
        )}
      </div>
      <div className="prod-days" style={{ width: canvasCols * colW, height: headH }}>
        {bands.map((band) => {
          const left = (band.startIndex - minIndex) * colW
          const width = band.span * colW
          const clipped = left < scrollLeft - 1 && left + width > scrollLeft
          const shiftPx = clipped ? Math.min(Math.max(0, scrollLeft - left), Math.max(0, width - 64)) : 0
          let text = band.label
          if (showMonthBand) {
            const [yearStr, monthStr] = band.id.split('-')
            const month = Number(monthStr)
            const year = Number(yearStr)
            const sameYear = year === new Date(today).getUTCFullYear()
            text = `${MONTHS_LONG[month] ?? band.label}${sameYear ? '' : ` ${year}`}`
          }
          return (
            <div key={band.id} className="prod-month" style={{ left, width }}>
              <span style={{ transform: `translateX(${shiftPx}px)` }}>{text}</span>
            </div>
          )
        })}
        {columns.map((col) => {
          const isToday = today >= col.start && today < col.end
          const weekend = Boolean(col.weekend && weekendsVisible(zoom, showWeekends))
          const day = new Date(col.start).getUTCDay()
          const sub = zoom === 'days' ? DAYS_ABBR[day] : col.sublabel
          return (
            <div
              key={col.id}
              className={`prod-day${weekend ? ' is-weekend' : ''}`}
              style={{ left: (col.index - minIndex) * colW, width: colW }}
            >
              {columnWeekLoading(col.start, col.end, loadingWeeks) ? (
                <Skeleton.Rectangle className="prod-week-skel is-head" height="100%" aria-hidden aria-label="" />
              ) : null}
              <div className="prod-day-label">
                <span className={`prod-day-num${isToday ? ' is-today' : ''}`}>{col.label}</span>
                {sub ? <span className="prod-day-wd">{sub}</span> : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DataRow({
  row,
  rows,
  hierarchical,
  zoom,
  isSchedule,
  gutter,
  columns,
  colW,
  minIndex,
  canvasCols,
  showWeekends,
  scrollLeft,
  collapsed,
  onToggle,
  bars,
  selected,
  draggingId,
  dateAtClientX,
  onClear,
  onBarClick,
  onDragStart,
  loadingWeeks,
}: {
  row: ProdRow
  rows: ProdRow[]
  hierarchical: boolean
  zoom: Zoom
  isSchedule: boolean
  gutter: number
  columns: Column[]
  colW: number
  minIndex: number
  canvasCols: number
  showWeekends: boolean
  scrollLeft: number
  collapsed: boolean
  onToggle: () => void
  bars: ProdBar[]
  selected: Set<string>
  draggingId: string | null
  dateAtClientX: (clientX: number) => string
  onClear: () => void
  onBarClick: (id: string, iso: string, mods?: ClickMods) => void
  onDragStart: (event: ReactPointerEvent, bar: ProdBar, mode: DragMode) => void
  loadingWeeks: Set<string>
}) {
  const level = hierarchical ? rowLevel(row, rows) : 0
  const group = row.kind !== 'tech'
  const topGroup = hierarchical && group && level === 0
  const colors = hierarchical ? stripColors(row, rows) : []
  const canToggle = hierarchical && rowHasChildren(row.id, rows)
  return (
    <div
      className={`prod-row${group ? ' is-group' : ''}${topGroup ? ' is-top' : ''}`}
      data-prod-row={row.kind === 'tech' ? row.id : undefined}
      style={{
        gridTemplateColumns: `${gutter}px max-content`,
        height: ROW_H,
      }}
    >
      <div
        className={`prod-gutter${group ? ' is-group' : ''}${level > 0 ? ' is-nested' : ''}${topGroup ? ' is-top' : ''}`}
        style={{
          width: gutter,
          height: ROW_H,
          boxShadow: colors.length
            ? [...colors]
                .reverse()
                .map((color, index, list) => `inset ${4 * (list.length - index)}px 0 0 ${color}`)
                .join(', ')
            : undefined,
        }}
      >
        {isSchedule && row.wbs != null ? <span className="prod-wbs">{row.wbs}</span> : null}
        <div className="prod-name-cell" style={{ paddingLeft: level * 20 }}>
          {canToggle ? (
            <button type="button" className="prod-chevron" onClick={onToggle} aria-label={collapsed ? 'Expand' : 'Collapse'}>
              <Icon svg={collapsed ? ChevronRightIcon : ExpandMoreIcon} size="small" inherit />
            </button>
          ) : hierarchical ? (
            <span className="prod-chevron-spacer" />
          ) : null}
          {!isSchedule && row.initials ? <Avatar name={row.name} size="small" /> : null}
          <div className="prod-person">
            <span className="prod-name" title={row.name}>
              {row.name}
            </span>
            {row.role ? <Chip size="small" label={row.role} /> : null}
          </div>
        </div>
        {isSchedule ? (
          <button type="button" className="prod-cal-btn" aria-label="Schedule technicians">
            <Icon svg={CalendarIcon} size="small" inherit />
          </button>
        ) : null}
      </div>
      <div
        className={`prod-days${topGroup ? ' is-top' : ''}`}
        style={{ width: canvasCols * colW, height: ROW_H }}
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest('.prod-handle, .prod-bar')) return
          const rect = event.currentTarget.getBoundingClientRect()
          const x = event.clientX - rect.left
          const hit = bars.find((bar) => {
            if (bar.readOnly) return false
            const box = barBox(bar.start, bar.end, minIndex, colW, canvasCols, zoom)
            return Boolean(box && x >= box.left && x <= box.left + box.width)
          })
          if (hit) onDragStart(event, hit, 'move')
        }}
      >
        {columns.map((col) => (
          <div
            key={col.id}
            className={`prod-day${col.weekend && weekendsVisible(zoom, showWeekends) ? ' is-weekend' : ''}`}
            style={{ left: (col.index - minIndex) * colW, width: colW }}
            onClick={onClear}
          >
            {columnWeekLoading(col.start, col.end, loadingWeeks) ? (
              <Skeleton.Rectangle className="prod-week-skel" height="100%" aria-hidden aria-label="" />
            ) : null}
          </div>
        ))}
        {bars.map((bar) => (
          <BarView
            key={bar.id}
            bar={bar}
            zoom={zoom}
            colW={colW}
            minIndex={minIndex}
            colCount={canvasCols}
            showWeekends={showWeekends}
            scrollLeft={scrollLeft}
            selected={selected}
            dragging={draggingId === bar.id}
            dateAtClientX={dateAtClientX}
            onBarClick={onBarClick}
            onDragStart={onDragStart}
          />
        ))}
      </div>
    </div>
  )
}

function BarView({
  bar,
  zoom,
  colW,
  minIndex,
  colCount,
  showWeekends,
  scrollLeft,
  selected,
  dragging,
  dateAtClientX,
  onBarClick,
  onDragStart,
}: {
  bar: ProdBar
  zoom: Zoom
  colW: number
  minIndex: number
  colCount: number
  showWeekends: boolean
  scrollLeft: number
  selected: Set<string>
  dragging: boolean
  dateAtClientX: (clientX: number) => string
  onBarClick: (id: string, iso: string, mods?: ClickMods) => void
  onDragStart: (event: ReactPointerEvent, bar: ProdBar, mode: DragMode) => void
}) {
  const box = barBox(bar.start, bar.end, minIndex, colW, colCount, zoom)
  if (!box) return null
  const days = barDays(bar)
  const selectedDays = days.filter((iso) => selected.has(cellId(bar.id, iso)))
  const allSelected = selectedDays.length > 0 && selectedDays.length === days.length
  const hatches = weekendsVisible(zoom, showWeekends) ? weekendsIn(bar.start, bar.end) : []
  const leftPx = box.left + 2
  const widthPx = Math.max(8, box.width - 4)
  const viewLeft = scrollLeft
  const clippedBox = clipBarToGutter(leftPx, widthPx, viewLeft)
  if (!clippedBox) return null
  const shiftPx = clippedBox.overflowLeft
  const ink = isDarkColor(bar.color) ? '#fff' : '#040404'
  const detail = bar.notes || bar.detail
  const hatchW = zoom === 'days' ? colW : Math.max(4, colW / 7)
  return (
    <div
      className={`prod-bar-wrap${bar.thin ? ' is-thin' : ''}${detail && !bar.thin ? ' is-rc' : ''}${allSelected ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}`}
      style={{ left: clippedBox.left, width: clippedBox.width }}
    >
      {allSelected ? <span className="prod-bar-select-ring" aria-hidden /> : null}
      <div
        className={`prod-bar${bar.thin ? ' is-thin' : ''}${detail && !bar.thin ? ' is-rc' : ''}${bar.readOnly ? ' is-readonly' : ''}${allSelected ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}`}
        style={
          {
            background: bar.color,
            borderRadius: BAR_RADIUS,
            color: ink,
            left: shiftPx ? -shiftPx : 0,
            width: widthPx,
            '--prod-label-shift': `${shiftPx}px`,
          } as CSSProperties
        }
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
        onClick={(event) => {
          event.stopPropagation()
          if (bar.readOnly) return
          const rect = event.currentTarget.getBoundingClientRect()
          const wholeBar = zoom !== 'days' || event.detail >= 2 || event.clientY - rect.top <= 8
          onBarClick(bar.id, clampIso(dateAtClientX(event.clientX), bar.start, bar.end), {
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
            wholeBar,
          })
        }}
        onDoubleClick={(event) => {
          event.stopPropagation()
          if (bar.readOnly) return
          onBarClick(bar.id, clampIso(dateAtClientX(event.clientX), bar.start, bar.end), {
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
            wholeBar: true,
          })
        }}
        onPointerDown={(event) => onDragStart(event, bar, 'move')}
      >
        {!bar.thin ? (
          <span className="prod-bar-label">
            <span className="prod-bar-title">{timeLine(bar)}</span>
            {detail ? <span className="prod-bar-detail">{detail}</span> : null}
          </span>
        ) : null}
        {hatches.map((iso) => {
          const x = worldXForDate(zoom, minIndex, colW, iso)
          if (x + hatchW < leftPx || x > leftPx + widthPx) return null
          return <span key={iso} className="prod-bar-hatch" style={{ left: x - leftPx, width: hatchW }} />
        })}
        {!allSelected
          ? selectedDays.map((iso) => {
              const x = worldXForDate(zoom, minIndex, colW, iso)
              const w = zoom === 'days' ? colW : hatchW
              if (x + w < leftPx || x > leftPx + widthPx) return null
              return <span key={`sel-${iso}`} className="prod-bar-cell is-on" style={{ left: x - leftPx, width: w }} />
            })
          : null}
      </div>
      {!bar.readOnly ? (
        <>
          <span
            className="prod-handle is-start"
            onPointerDown={(event) => {
              event.stopPropagation()
              onDragStart(event, bar, 'resize-start')
            }}
          />
          <span
            className="prod-handle is-end"
            onPointerDown={(event) => {
              event.stopPropagation()
              onDragStart(event, bar, 'resize-end')
            }}
          />
        </>
      ) : null}
    </div>
  )
}
