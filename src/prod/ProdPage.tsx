import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  Avatar,
  Button,
  Chip,
  DateFieldSingle,
  Drawer,
  Icon,
  Popover,
  Switch,
  Text,
  toast,
} from '@servicetitan/anvil2'
import {
  addDays,
  columnIndexAt,
  diffDays,
  emptySpan,
  isoFromTs,
  utc,
  type Column,
  type Span,
} from '../timeline'
import { useTimelineScroll } from '../useTimelineScroll'
import { CalendarCheckIcon, CalendarIcon, CloseIcon, ExpandMoreIcon } from '../icons'
import {
  BAR_RADIUS,
  calendarRows,
  EDGE_DELAY_MS,
  EDGE_ZONE,
  initialCalendarBars,
  initialScheduleBars,
  PROD_TODAY,
  RC_GUTTER,
  RC_HEAD_H,
  ROW_H,
  SCHEDULE_GUTTER,
  SCHEDULE_HEAD_H,
  scheduleRows,
  WORKDAY,
  type ProdBar,
  type ProdRow,
  type ProdView,
} from './prodData'
import './prod.css'

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const SCROLL_PX = 12

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
  const [selected, setSelected] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editStart, setEditStart] = useState(PROD_TODAY)
  const [editEnd, setEditEnd] = useState(PROD_TODAY)
  const [dragHint, setDragHint] = useState<{ x: number; y: number; label: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const undoRef = useRef<ProdBar[] | null>(null)
  const barsRef = useRef(bars)
  barsRef.current = bars
  const edgeDir = useRef(0)
  const edgeTimer = useRef(0)
  const edgeRaf = useRef(0)
  const timeline = useTimelineScroll('days', scrollRef, { gutter, initialIso: PROD_TODAY })
  const { columns, colW, canvasWidth, dateAtClientX, jumpTo, scrollBy, firstVisible } = timeline
  const dateAtClientXRef = useRef(dateAtClientX)
  dateAtClientXRef.current = dateAtClientX
  const scrollByRef = useRef(scrollBy)
  scrollByRef.current = scrollBy
  const minIndex = columns[0]?.index ?? 0
  const firstIso = columns.find((c) => c.index === firstVisible)?.id ?? PROD_TODAY

  useEffect(() => {
    setBars((isSchedule ? initialScheduleBars : initialCalendarBars).map((b) => ({ ...b })))
    setSelected(null)
    setEditId(null)
    setCollapsed(new Set())
    setDraggingId(null)
    setDragHint(null)
    dragRef.current = null
  }, [isSchedule])

  const visibleRows = useMemo(() => {
    if (!isSchedule) return rows
    return rows.filter((row) => !row.parentId || !collapsed.has(row.parentId))
  }, [rows, collapsed, isSchedule])

  const stopEdge = useCallback(() => {
    edgeDir.current = 0
    window.clearTimeout(edgeTimer.current)
    if (edgeRaf.current) cancelAnimationFrame(edgeRaf.current)
    edgeRaf.current = 0
  }, [])

  const applyDrag = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragRef.current
      if (!drag) return
      drag.lastX = clientX
      drag.lastY = clientY
      if (Math.abs(clientX - drag.originX) > 4 || Math.abs(clientY - drag.originY) > 4) {
        drag.moved = true
        setDraggingId(drag.id)
      }
      if (!drag.moved) return
      const date = dateAtClientXRef.current(clientX)
      let next = drag.snapshot
      if (drag.mode === 'move') next = shift(drag.snapshot, diffDays(drag.originDate, date))
      else if (drag.mode === 'resize-start') next = resizeStart(drag.snapshot, date)
      else next = resizeEnd(drag.snapshot, date)
      setBars((prev) =>
        prev.map((bar) => {
          if (bar.id !== drag.id) return bar
          let rowId = bar.rowId
          if (drag.mode === 'move') {
            const hit = rowAtPoint(clientY)
            if (!isSchedule) {
              if (hit) rowId = hit
            } else {
              const src = scheduleRows.find((r) => r.id === drag.originRow)
              const dst = scheduleRows.find((r) => r.id === hit)
              if (hit && dst?.kind === 'tech' && src?.parentId && dst.parentId === src.parentId) rowId = hit
            }
          }
          return { ...bar, rowId, start: next.start, end: next.end }
        }),
      )
      setDragHint({ x: clientX, y: clientY, label: liveRangeLabel(next.start, next.end) })
    },
    [isSchedule],
  )
  const applyDragRef = useRef(applyDrag)
  applyDragRef.current = applyDrag

  const updateEdge = useCallback(
    (clientX: number) => {
      const el = scrollRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const viewW = Math.min(el.clientWidth, window.innerWidth)
      const left = rect.left + gutter + EDGE_ZONE
      const right = rect.left + viewW - EDGE_ZONE
      let dir = 0
      if (clientX > right) dir = 1
      else if (clientX < left) dir = -1
      if (dir === edgeDir.current) return
      edgeDir.current = dir
      window.clearTimeout(edgeTimer.current)
      if (edgeRaf.current) cancelAnimationFrame(edgeRaf.current)
      edgeRaf.current = 0
      if (!dir) return
      edgeTimer.current = window.setTimeout(() => {
        const tick = () => {
          if (!edgeDir.current) return
          scrollByRef.current(edgeDir.current * SCROLL_PX)
          const drag = dragRef.current
          if (drag) applyDragRef.current(drag.lastX, drag.lastY)
          edgeRaf.current = requestAnimationFrame(tick)
        }
        tick()
      }, EDGE_DELAY_MS)
    },
    [gutter],
  )

  const endDrag = useCallback(() => {
    const drag = dragRef.current
    stopEdge()
    setDragHint(null)
    setDraggingId(null)
    document.body.classList.remove('prod-grabbing')
    if (!drag) return
    dragRef.current = null
    if (!drag.moved) {
      const current = barsRef.current.find((b) => b.id === drag.id)
      if (current && !current.readOnly) {
        setEditId(current.id)
        setEditStart(current.start)
        setEditEnd(current.end)
      }
      return
    }
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
  }, [isSchedule, stopEdge])

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragRef.current) return
      applyDragRef.current(event.clientX, event.clientY)
      updateEdge(event.clientX)
    }
    const onUp = () => {
      if (dragRef.current) endDrag()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [endDrag, updateEdge])

  function startDrag(event: ReactPointerEvent, bar: ProdBar, mode: DragMode) {
    if (bar.readOnly || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    setSelected(bar.id)
    undoRef.current = barsRef.current.map((b) => ({ ...b }))
    document.body.classList.add('prod-grabbing')
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

  const editBar = bars.find((b) => b.id === editId)

  const saveEdit = () => {
    if (!editBar) return
    if (utc(editStart) > utc(editEnd)) return
    const before = bars.map((b) => ({ ...b }))
    setBars((prev) => prev.map((b) => (b.id === editBar.id ? { ...b, start: editStart, end: editEnd } : b)))
    setEditId(null)
    toast.success({
      title: 'Schedule updated',
      message: 'Dates saved from the flyout.',
      actions: {
        primary: {
          label: 'Undo',
          onClick: () => setBars(before),
        },
      },
    })
  }

  return (
    <div className={`prod-page${isSchedule ? ' is-schedule' : ' is-calendar'}`}>
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
              icon={collapsed.size ? undefined : CloseIcon}
              onClick={() =>
                setCollapsed((prev) =>
                  prev.size ? new Set() : new Set(scheduleRows.filter((r) => r.kind !== 'tech').map((r) => r.id)),
                )
              }
            >
              {collapsed.size ? 'Expand All' : 'Collapse All'}
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
                  onSelect={setSelected}
                  onDragStart={startDrag}
                />
              ))}
            </div>
          </div>
        </div>
        {isSchedule ? <aside className="prod-side">Project Details</aside> : null}
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

      <Drawer open={Boolean(editBar)} onClose={() => setEditId(null)} size="small">
        <Drawer.Header>Edit schedule</Drawer.Header>
        <Drawer.Content>
          <div className="prod-flyout-fields">
            <Text>{editBar?.title}</Text>
            {editBar?.detail ? (
              <Text size="small" subdued>
                {editBar.detail}
              </Text>
            ) : (
              <Text size="small" subdued>
                {WORKDAY.start} – {WORKDAY.end}
              </Text>
            )}
            <DateFieldSingle label="Start date" value={editStart} onChange={(c) => c.date && c.isDateValid && setEditStart(c.date)} />
            <DateFieldSingle label="End date" value={editEnd} onChange={(c) => c.date && c.isDateValid && setEditEnd(c.date)} />
          </div>
        </Drawer.Content>
        <Drawer.Footer>
          <Drawer.CancelButton>Cancel</Drawer.CancelButton>
          <Button appearance="primary" onClick={saveEdit}>
            Save
          </Button>
        </Drawer.Footer>
      </Drawer>
    </div>
  )
}

function DatePicker({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  return (
    <Popover placement="bottom-start">
      <Popover.Trigger>
        {(props) => (
          <button type="button" className="prod-date-btn" {...props}>
            <Icon svg={CalendarIcon} size="small" inherit />
            {pickerLabel(value)}
            <span className="prod-date-caret" aria-hidden>
              ▾
            </span>
          </button>
        )}
      </Popover.Trigger>
      <Popover.Content>
        <DateFieldSingle value={value} disableHint onChange={(c) => c.date && c.isDateValid && onChange(c.date)} />
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
}: {
  isSchedule: boolean
  gutter: number
  headH: number
  columns: Column[]
  colW: number
  minIndex: number
  showWeekends: boolean
}) {
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
        {columns.map((col) => {
          const isToday = col.id === PROD_TODAY
          const weekend = Boolean(col.weekend && showWeekends)
          return (
            <div
              key={col.id}
              className={`prod-day${weekend ? ' is-weekend' : ''}${isToday && isSchedule ? ' is-today' : ''}`}
              style={{ left: (col.index - minIndex) * colW, width: colW }}
            >
              {isSchedule ? (
                <div className="prod-day-label">
                  <span className="prod-day-num">{col.label}</span>
                  <span className="prod-day-wd">{col.sublabel.slice(0, 1)}</span>
                </div>
              ) : (
                <div className="prod-rc-label">
                  <b>{col.sublabel}</b>
                  <span>
                    {MONTHS_SHORT[new Date(col.start).getUTCMonth()]} {String(new Date(col.start).getUTCDate()).padStart(2, '0')}
                  </span>
                </div>
              )}
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
  collapsed,
  onToggle,
  bars,
  selected,
  draggingId,
  onSelect,
  onDragStart,
}: {
  row: ProdRow
  isSchedule: boolean
  gutter: number
  columns: Column[]
  colW: number
  minIndex: number
  showWeekends: boolean
  collapsed: boolean
  onToggle: () => void
  bars: ProdBar[]
  selected: string | null
  draggingId: string | null
  onSelect: (id: string) => void
  onDragStart: (event: ReactPointerEvent, bar: ProdBar, mode: DragMode) => void
}) {
  const nested = Boolean(row.parentId)
  const group = row.kind !== 'tech'
  return (
    <div
      className={`prod-row${group ? ' is-group' : ''}`}
      data-prod-row={row.kind === 'tech' ? row.id : undefined}
      style={{
        gridTemplateColumns: `${gutter}px max-content`,
        height: ROW_H,
      }}
    >
      <div className={`prod-gutter${group ? ' is-group' : ''}${nested ? ' is-nested' : ''}`} style={{ width: gutter, height: ROW_H }}>
        {isSchedule && row.wbs != null ? <span className="prod-wbs">{row.wbs}</span> : null}
        {row.kind === 'group' ? (
          <button type="button" className={`prod-chevron${collapsed ? ' is-closed' : ''}`} onClick={onToggle} aria-label={collapsed ? 'Expand' : 'Collapse'}>
            <Icon svg={ExpandMoreIcon} size="small" inherit />
          </button>
        ) : null}
        {!isSchedule && row.initials ? <Avatar name={row.name} size="small" /> : null}
        <div className="prod-person">
          <span className="prod-name" title={row.name}>
            {row.name}
          </span>
          {row.role ? <Chip size="small" label={row.role} /> : null}
        </div>
        {isSchedule && group ? (
          <span className="prod-cal-btn" aria-hidden>
            <Icon svg={CalendarCheckIcon} size="small" inherit />
          </span>
        ) : null}
      </div>
      <div className="prod-days" style={{ width: columns.length * colW, height: ROW_H }}>
        {columns.map((col) => (
          <div
            key={col.id}
            className={`prod-day${col.weekend && showWeekends ? ' is-weekend' : ''}`}
            style={{ left: (col.index - minIndex) * colW, width: colW }}
            onClick={() => onSelect('')}
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
            selected={selected === bar.id}
            dragging={draggingId === bar.id}
            onSelect={onSelect}
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
  selected,
  dragging,
  onSelect,
  onDragStart,
}: {
  bar: ProdBar
  colW: number
  minIndex: number
  colCount: number
  showWeekends: boolean
  selected: boolean
  dragging: boolean
  onSelect: (id: string) => void
  onDragStart: (event: ReactPointerEvent, bar: ProdBar, mode: DragMode) => void
}) {
  const box = barBox(bar.start, bar.end, minIndex, colW, colCount)
  if (!box) return null
  const hatches = showWeekends ? weekendsIn(bar.start, bar.end) : []
  const dark = bar.color === '#1360d9'
  return (
    <div
      className={`prod-bar${bar.thin ? ' is-thin' : ''}${bar.detail ? ' is-rc' : ''}${bar.readOnly ? ' is-readonly' : ''}${selected ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}`}
      style={{
        left: box.left + 2,
        width: Math.max(8, box.width - 4),
        background: bar.color,
        borderRadius: BAR_RADIUS,
        color: dark ? '#fff' : '#040404',
      }}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(bar.id)
      }}
      onPointerDown={(event) => onDragStart(event, bar, 'move')}
    >
      {!bar.thin ? (
        <>
          <span className="prod-bar-title">{bar.title}</span>
          {bar.detail ? <span className="prod-bar-detail">{bar.detail}</span> : null}
        </>
      ) : null}
      {hatches.map((iso) => {
        const idx = columnIndexAt('days', utc(iso))
        if (idx < box.visStart || idx > box.visStart + Math.round(box.width / colW) - 1) return null
        return (
          <span
            key={iso}
            className="prod-bar-hatch"
            style={{ left: (idx - box.visStart) * colW - 2, width: colW }}
          />
        )
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
