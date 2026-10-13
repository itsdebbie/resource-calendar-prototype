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
  Calendar,
  Checkbox,
  Chip,
  DateFieldSingle,
  Dialog,
  Icon,
  Popover,
  Switch,
  Tab,
  Text,
  TextField,
  TimeField,
  toast,
} from '@servicetitan/anvil2'
import {
  addDays,
  columnIndexAt,
  diffDays,
  emptySpan,
  isoFromTs,
  monthBands,
  utc,
  type Column,
  type Span,
} from '../timeline'
import { useTimelineScroll } from '../useTimelineScroll'
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
  calendarRows,
  EDGE_DELAY_MS,
  EDGE_ZONE,
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
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
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
const SCROLL_PX = 8
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

function pickerLabel(iso: string) {
  const d = new Date(utc(iso))
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${DAYS_LONG[d.getUTCDay()]}, ${mm}/${dd}/${d.getUTCFullYear()}`
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

function barBox(start: string, end: string, minIndex: number, colW: number, colCount: number) {
  const startIdx = columnIndexAt('days', utc(start))
  const endIdx = columnIndexAt('days', utc(end))
  const visStart = Math.max(startIdx, minIndex)
  const visEnd = Math.min(endIdx, minIndex + colCount - 1)
  if (visEnd < visStart) return null
  return {
    left: (visStart - minIndex) * colW,
    width: (visEnd - visStart + 1) * colW,
    visStart,
  }
}

function timeLine(bar: ProdBar) {
  return `${bar.startTime ?? WORKDAY.start} - ${bar.endTime ?? WORKDAY.end}`
}

function nextBarId() {
  return `bar-${Math.random().toString(36).slice(2, 10)}`
}

function toDayIso(value: string) {
  const iso = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : ''
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
type ClickMods = { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }

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
  const isSchedule = view === 'schedule'
  const gutter = isSchedule ? SCHEDULE_GUTTER : RC_GUTTER
  const headH = isSchedule ? SCHEDULE_HEAD_H : RC_HEAD_H
  const rows = isSchedule ? scheduleRows : calendarRows
  const [bars, setBars] = useState<ProdBar[]>(() => (isSchedule ? initialScheduleBars : initialCalendarBars).map((b) => ({ ...b })))
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [showWeekends, setShowWeekends] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editStart, setEditStart] = useState(PROD_TODAY)
  const [editEnd, setEditEnd] = useState(PROD_TODAY)
  const [editStartTime, setEditStartTime] = useState(WORKDAY.start)
  const [editEndTime, setEditEndTime] = useState(WORKDAY.end)
  const [editNotes, setEditNotes] = useState('')
  const [fullWorkday, setFullWorkday] = useState(true)
  const [dragHint, setDragHint] = useState<{ x: number; y: number; label: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const undoRef = useRef<ProdBar[] | null>(null)
  const barsRef = useRef(bars)
  barsRef.current = bars
  const ignoreClick = useRef(false)
  const selectAnchor = useRef<string | null>(null)
  const edgeDir = useRef(0)
  const edgeSince = useRef(0)
  const timeline = useTimelineScroll('days', scrollRef, { gutter, initialIso: PROD_TODAY })
  const { columns, colW, canvasWidth, dateAtClientX, jumpTo, scrollBy, firstVisible, scrollLeft } = timeline
  const dateAtClientXRef = useRef(dateAtClientX)
  dateAtClientXRef.current = dateAtClientX
  const scrollByRef = useRef(scrollBy)
  scrollByRef.current = scrollBy
  const minIndex = columns[0]?.index ?? 0
  const firstIso = columns.find((c) => c.index === firstVisible)?.id ?? PROD_TODAY

  useEffect(() => {
    setBars((isSchedule ? initialScheduleBars : initialCalendarBars).map((b) => ({ ...b })))
    setSelected(new Set())
    setEditOpen(false)
    setConfirmDelete(false)
    setCollapsed(new Set())
    setDraggingId(null)
    setDragHint(null)
    dragRef.current = null
    selectAnchor.current = null
    jumpTo(PROD_TODAY)
  }, [isSchedule, jumpTo])

  const visibleRows = useMemo(() => {
    if (!isSchedule) return rows
    return rows.filter((row) => !rowHidden(row, collapsed))
  }, [rows, collapsed, isSchedule])

  const orderedIds = useMemo(() => {
    const ids: string[] = []
    for (const row of visibleRows) {
      for (const bar of bars) {
        if (bar.rowId === row.id && !bar.readOnly) ids.push(bar.id)
      }
    }
    return ids
  }, [visibleRows, bars])

  const selectedBars = useMemo(() => bars.filter((bar) => selected.has(bar.id) && !bar.readOnly), [bars, selected])
  const selectedCount = selectedBars.length

  const stopEdge = useCallback(() => {
    edgeDir.current = 0
    edgeSince.current = 0
  }, [])

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
      const date = dateAtClientXRef.current(clientX)
      let next = drag.snapshot
      if (drag.mode === 'move') next = shift(drag.snapshot, diffDays(drag.originDate, date))
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
      setBars((prev) => {
        const current = prev.find((bar) => bar.id === drag.id)
        if (current && current.start === next.start && current.end === next.end && current.rowId === nextRow) return prev
        return prev.map((bar) => (bar.id === drag.id ? { ...bar, rowId: nextRow, start: next.start, end: next.end } : bar))
      })
      const label = liveRangeLabel(next.start, next.end)
      setDragHint((prev) =>
        prev && prev.x === clientX && prev.y === clientY && prev.label === label ? prev : { x: clientX, y: clientY, label },
      )
    },
    [isSchedule],
  )
  const applyDragRef = useRef(applyDrag)
  applyDragRef.current = applyDrag

  const endDrag = useCallback(() => {
    const drag = dragRef.current
    stopEdge()
    setDragHint(null)
    setDraggingId(null)
    document.body.classList.remove('prod-grabbing')
    if (!drag) return
    dragRef.current = null
    if (!drag.moved) return
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
      }
    }
    window.setTimeout(() => {
      toast.success({
        title: 'Schedule updated',
        message: 'Drop saved. Undo restores the previous dates.',
        actions: {
          primary: {
            label: 'Undo',
            onClick: () => {
              if (before) setBars(before)
            },
          },
        },
      })
    }, 0)
  }, [isSchedule, stopEdge])

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
      const el = scrollRef.current
      if (drag && el) {
        const rect = el.getBoundingClientRect()
        const x = drag.lastX
        let dir = 0
        if (x >= rect.right - EDGE_ZONE) dir = 1
        else if (x <= rect.left + gutter + EDGE_ZONE) dir = -1
        const now = performance.now()
        if (dir !== edgeDir.current) {
          edgeDir.current = dir
          edgeSince.current = dir ? now : 0
        }
        if (dir && edgeSince.current && now - edgeSince.current >= EDGE_DELAY_MS) {
          scrollByRef.current(dir * SCROLL_PX)
        }
        applyDragRef.current(drag.lastX, drag.lastY)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [draggingId, gutter])

  function startDrag(event: ReactPointerEvent, bar: ProdBar, mode: DragMode) {
    if (bar.readOnly) return
    if (event.button > 0) return
    if (mode === 'move' && (event.shiftKey || event.ctrlKey || event.metaKey)) return
    event.preventDefault()
    event.stopPropagation()
    undoRef.current = barsRef.current.map((b) => ({ ...b }))
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

  function onBarClick(id: string, mods: ClickMods = {}) {
    if (ignoreClick.current) {
      ignoreClick.current = false
      return
    }
    const additive = Boolean(mods.metaKey || mods.ctrlKey)
    const range = Boolean(mods.shiftKey)
    setSelected((prev) => {
      if (range && selectAnchor.current) {
        const a = orderedIds.indexOf(selectAnchor.current)
        const b = orderedIds.indexOf(id)
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a]
          return new Set(orderedIds.slice(lo, hi + 1))
        }
      }
      if (additive) {
        selectAnchor.current = id
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }
      selectAnchor.current = id
      return new Set([id])
    })
  }

  function clearSelection() {
    setSelected(new Set())
    selectAnchor.current = null
    setEditOpen(false)
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
    setEditOpen(true)
  }

  function saveEdit() {
    if (!selectedBars.length) return
    if (utc(editStart) > utc(editEnd)) return
    const ids = new Set(selectedBars.map((bar) => bar.id))
    const before = bars.map((b) => ({ ...b }))
    setBars((prev) =>
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
    setEditOpen(false)
    toast.success({
      title: 'Schedule updated',
      message: 'Dates saved from the panel.',
      actions: {
        primary: {
          label: 'Undo',
          onClick: () => setBars(before),
        },
      },
    })
  }

  function duplicateSelected() {
    if (!selectedBars.length) return
    const clones = selectedBars.map((bar) => ({
      ...bar,
      id: nextBarId(),
      color: isSchedule ? groupColorForRow(bar.rowId) : bar.color,
    }))
    setBars((prev) => [...prev, ...clones])
    toast.success({ title: 'Schedule duplicated' })
  }

  function selectRange() {
    if (!selectedBars.length) return
    let min = selectedBars[0]!.start
    let max = selectedBars[0]!.end
    for (const bar of selectedBars) {
      if (utc(bar.start) < utc(min)) min = bar.start
      if (utc(bar.end) > utc(max)) max = bar.end
    }
    const next = new Set<string>()
    for (const bar of bars) {
      if (bar.readOnly) continue
      if (utc(bar.end) < utc(min) || utc(bar.start) > utc(max)) continue
      next.add(bar.id)
    }
    setSelected(next)
  }

  function confirmRemove() {
    const ids = new Set(selectedBars.map((bar) => bar.id))
    const before = bars.map((b) => ({ ...b }))
    setBars((prev) => prev.filter((bar) => !ids.has(bar.id)))
    clearSelection()
    toast.success({
      title: 'Schedule deleted',
      actions: {
        primary: {
          label: 'Undo',
          onClick: () => setBars(before),
        },
      },
    })
  }

  const allFirstCollapsed = FIRST_LEVEL_IDS.length > 0 && FIRST_LEVEL_IDS.every((id) => collapsed.has(id))
  const collapseDisabled = FIRST_LEVEL_IDS.length === 0

  useEffect(() => {
    if (selectedCount === 0) {
      setEditOpen(false)
      setConfirmDelete(false)
    }
  }, [selectedCount])

  return (
    <div className={`prod-page${isSchedule ? ' is-schedule' : ' is-calendar'}${editOpen ? ' has-panel' : ''}`}>
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
          <Button size="small" appearance="secondary" onClick={() => jumpTo(PROD_TODAY)}>
            Today
          </Button>
          <DatePicker value={firstIso} onChange={(iso) => jumpTo(iso)} />
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
                gutter={gutter}
                headH={headH}
                columns={columns}
                colW={colW}
                minIndex={minIndex}
                showWeekends={showWeekends}
                scrollLeft={scrollLeft}
              />
              {visibleRows.map((row) => (
                <DataRow
                  key={row.id}
                  row={row}
                  isSchedule={isSchedule}
                  gutter={gutter}
                  columns={columns}
                  colW={colW}
                  minIndex={minIndex}
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
                  bars={bars.filter((b) => b.rowId === row.id)}
                  selected={selected}
                  draggingId={draggingId}
                  onClear={clearSelection}
                  onBarClick={onBarClick}
                  onDragStart={startDrag}
                />
              ))}
            </div>
          </div>
          {selectedCount > 0 ? (
            <div className="prod-action">
              <span className="prod-action-count">
                <strong>{selectedCount}</strong> selected
              </span>
              <Button size="small" appearance="ghost" onClick={clearSelection}>
                Clear Selection
              </Button>
              <Button size="small" appearance="secondary" icon={RangeIcon} onClick={selectRange}>
                Select Range
              </Button>
              <Button size="small" appearance="secondary" icon={DuplicateIcon} onClick={duplicateSelected}>
                Duplicate
              </Button>
              <Button size="small" appearance="secondary" icon={DeleteIcon} onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
              <Button size="small" appearance="primary" icon={EditIcon} onClick={openEdit}>
                {selectedCount > 1 ? 'Bulk Edit' : 'Edit'}
              </Button>
            </div>
          ) : null}
        </div>
        {editOpen ? (
          <aside className="prod-edit" aria-label={selectedCount > 1 ? 'Bulk Edit' : 'Edit schedule'}>
            <div className="prod-edit-head">
              <Text size="large">{selectedCount > 1 ? 'Bulk Edit' : 'Edit schedule'}</Text>
              <Button size="small" appearance="ghost" onClick={() => setEditOpen(false)}>
                Close
              </Button>
            </div>
            <div className="prod-edit-body">
              <Tab defaultIndex={0}>
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
                    <DateFieldSingle label="Start date" value={editStart} onChange={(c) => c.date && c.isDateValid && setEditStart(c.date)} />
                    <DateFieldSingle label="End date" value={editEnd} onChange={(c) => c.date && c.isDateValid && setEditEnd(c.date)} />
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
        ) : isSchedule ? (
          <aside className="prod-side">Project Details</aside>
        ) : null}
      </div>
      {!isSchedule ? (
        <div className="prod-tray">
          <span>Schedule Resources</span>
          <span className="prod-tray-pill" />
          <span className="prod-tray-end">↗ ⌃</span>
        </div>
      ) : null}

      {dragHint ? (
        <div className="prod-drag-tip" style={{ left: dragHint.x, top: dragHint.y }}>
          {dragHint.label}
        </div>
      ) : null}

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <Dialog.Header>Delete schedule?</Dialog.Header>
        <Dialog.Content>
          <Text>
            Remove {selectedCount} selected schedule{selectedCount === 1 ? '' : 's'}? This can be undone.
          </Text>
        </Dialog.Content>
        <Dialog.Footer>
          <Dialog.CancelButton>Cancel</Dialog.CancelButton>
          <Button appearance="primary" onClick={confirmRemove}>
            Delete
          </Button>
        </Dialog.Footer>
      </Dialog>
    </div>
  )
}

function DatePicker({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onClose={() => setOpen(false)} placement="bottom-start" disableCaret>
      <Popover.Trigger>
        {(props) => (
          <button
            type="button"
            className="prod-date-btn"
            {...props}
            onClick={() => setOpen((current) => !current)}
          >
            <Icon svg={CalendarIcon} size="small" inherit />
            {pickerLabel(value)}
            <span className="prod-date-caret" aria-hidden>
              ▾
            </span>
          </button>
        )}
      </Popover.Trigger>
      <Popover.Content>
        <div className="prod-date-pop">
          <Calendar
            value={value}
            defaultFocusedDate={value}
            onSelection={({ value: next }) => {
              if (typeof next !== 'string' || !next) return
              const iso = toDayIso(next)
              if (!iso) return
              onChange(iso)
              setOpen(false)
            }}
          />
        </div>
      </Popover.Content>
    </Popover>
  )
}

function HeadRow({
  isSchedule,
  gutter,
  headH,
  columns,
  colW,
  minIndex,
  showWeekends,
  scrollLeft,
}: {
  isSchedule: boolean
  gutter: number
  headH: number
  columns: Column[]
  colW: number
  minIndex: number
  showWeekends: boolean
  scrollLeft: number
}) {
  const months = monthBands(columns)
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
          <span>Technicians</span>
        )}
      </div>
      <div className="prod-days" style={{ width: columns.length * colW, height: headH }}>
        {months.map((band) => {
          const [yearStr, monthStr] = band.id.split('-')
          const month = Number(monthStr)
          const year = Number(yearStr)
          const sameYear = year === new Date(utc(PROD_TODAY)).getUTCFullYear()
          const left = (band.startIndex - minIndex) * colW
          const width = band.span * colW
          const clipped = left < scrollLeft - 1 && left + width > scrollLeft
          const shiftPx = clipped ? Math.min(Math.max(0, scrollLeft - left), Math.max(0, width - 64)) : 0
          return (
            <div key={band.id} className="prod-month" style={{ left, width }}>
              <span style={{ transform: `translateX(${shiftPx}px)` }}>
                {MONTHS_LONG[month] ?? band.label}
                {sameYear ? '' : ` ${year}`}
              </span>
            </div>
          )
        })}
        {columns.map((col) => {
          const isToday = col.id === PROD_TODAY
          const weekend = Boolean(col.weekend && showWeekends)
          const day = new Date(col.start).getUTCDay()
          return (
            <div
              key={col.id}
              className={`prod-day${weekend ? ' is-weekend' : ''}`}
              style={{ left: (col.index - minIndex) * colW, width: colW }}
            >
              <div className="prod-day-label">
                <span className={`prod-day-num${isToday ? ' is-today' : ''}`}>{col.label}</span>
                <span className="prod-day-wd">{DAYS_ABBR[day]}</span>
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
  isSchedule,
  gutter,
  columns,
  colW,
  minIndex,
  showWeekends,
  scrollLeft,
  collapsed,
  onToggle,
  bars,
  selected,
  draggingId,
  onClear,
  onBarClick,
  onDragStart,
}: {
  row: ProdRow
  isSchedule: boolean
  gutter: number
  columns: Column[]
  colW: number
  minIndex: number
  showWeekends: boolean
  scrollLeft: number
  collapsed: boolean
  onToggle: () => void
  bars: ProdBar[]
  selected: Set<string>
  draggingId: string | null
  onClear: () => void
  onBarClick: (id: string, mods?: ClickMods) => void
  onDragStart: (event: ReactPointerEvent, bar: ProdBar, mode: DragMode) => void
}) {
  const level = isSchedule ? rowLevel(row) : 0
  const group = row.kind !== 'tech'
  const topGroup = isSchedule && group && level === 0
  const colors = isSchedule ? stripColors(row) : []
  const canToggle = isSchedule && rowHasChildren(row.id)
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
          ) : isSchedule ? (
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
        style={{ width: columns.length * colW, height: ROW_H }}
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest('.prod-handle, .prod-bar')) return
          const rect = event.currentTarget.getBoundingClientRect()
          const x = event.clientX - rect.left
          const hit = bars.find((bar) => {
            if (bar.readOnly) return false
            const box = barBox(bar.start, bar.end, minIndex, colW, columns.length)
            return Boolean(box && x >= box.left && x <= box.left + box.width)
          })
          if (hit) onDragStart(event, hit, 'move')
        }}
      >
        {columns.map((col) => (
          <div
            key={col.id}
            className={`prod-day${col.weekend && showWeekends ? ' is-weekend' : ''}`}
            style={{ left: (col.index - minIndex) * colW, width: colW }}
            onClick={onClear}
          />
        ))}
        {bars.map((bar) => (
          <BarView
            key={bar.id}
            bar={bar}
            colW={colW}
            minIndex={minIndex}
            colCount={columns.length}
            showWeekends={showWeekends}
            scrollLeft={scrollLeft}
            selected={selected.has(bar.id)}
            dragging={draggingId === bar.id}
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
  colW,
  minIndex,
  colCount,
  showWeekends,
  scrollLeft,
  selected,
  dragging,
  onBarClick,
  onDragStart,
}: {
  bar: ProdBar
  colW: number
  minIndex: number
  colCount: number
  showWeekends: boolean
  scrollLeft: number
  selected: boolean
  dragging: boolean
  onBarClick: (id: string, mods?: ClickMods) => void
  onDragStart: (event: ReactPointerEvent, bar: ProdBar, mode: DragMode) => void
}) {
  const box = barBox(bar.start, bar.end, minIndex, colW, colCount)
  if (!box) return null
  const hatches = showWeekends ? weekendsIn(bar.start, bar.end) : []
  const leftPx = box.left + 2
  const widthPx = Math.max(8, box.width - 4)
  const viewLeft = scrollLeft
  const clipped = leftPx < viewLeft - 1 && leftPx + widthPx > viewLeft
  const shiftPx = clipped ? Math.min(Math.max(0, viewLeft - leftPx), Math.max(0, widthPx - 12)) : 0
  const ink = isDarkColor(bar.color) ? '#fff' : '#040404'
  const detail = bar.notes || bar.detail
  return (
    <div
      className={`prod-bar${bar.thin ? ' is-thin' : ''}${detail && !bar.thin ? ' is-rc' : ''}${bar.readOnly ? ' is-readonly' : ''}${selected ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}`}
      style={
        {
          left: leftPx,
          width: widthPx,
          background: bar.color,
          borderRadius: BAR_RADIUS,
          color: ink,
          '--prod-label-shift': `${shiftPx}px`,
        } as CSSProperties
      }
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation()
        if (bar.readOnly) return
        onBarClick(bar.id, { shiftKey: event.shiftKey, metaKey: event.metaKey, ctrlKey: event.ctrlKey })
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
        const idx = columnIndexAt('days', utc(iso))
        if (idx < box.visStart || idx > box.visStart + Math.round(box.width / colW) - 1) return null
        return <span key={iso} className="prod-bar-hatch" style={{ left: (idx - box.visStart) * colW - 2, width: colW }} />
      })}
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
