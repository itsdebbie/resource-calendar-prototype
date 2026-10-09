import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  Avatar,
  Button,
  Card,
  Chip,
  Dialog,
  Flex,
  Icon,
  SearchField,
  SegmentedControl,
  Text,
  TextField,
  toast,
  Tooltip,
} from '@servicetitan/anvil2'
import {
  assignments,
  hoursCaption,
  hoursOver,
  people,
  personById,
  personHoursInWindow,
  phaseById,
  phases,
  projectById,
  projects,
  zoomBarLabel,
  type Assignment,
  type GroupBy,
  type Project,
  type Zoom,
} from './data'
import {
  DEMO_TODAY,
  GUTTER,
  isIsoDate,
  isoFromTs,
  activeSegments,
  barStyle,
  contextLabel as contextCaption,
  diffDays,
  emptySpan,
  formatDay,
  formatMoveRange,
  formatRange,
  isDayZoom,
  isEditableZoom,
  monthBands,
  moveOneDay,
  packLanes,
  resizeSpanEnd,
  segmentIsSliver,
  shiftSpan,
  worldXForDate,
  zoomStep,
  type Column,
  type Span,
  type TimeWindow,
} from './timeline'
import { useTimelineScroll } from './useTimelineScroll'
import { CheckIcon, DeleteIcon, EditIcon, ExpandMoreIcon, ZoomInIcon, ZoomOutIcon } from './icons'
import './calendar.css'

type Selection = string
type DragMode = 'move' | 'resize' | 'day'
type DragState = {
  mode: DragMode
  ids: string[]
  originDate: string
  fromDay: string
  snapshot: Record<string, Span>
  originX: number
  lastX: number
  lastY: number
  moved: boolean
}
type DragHint = {
  mode: DragMode
  x: number
  y: number
  label: string
  snapDay: string
}

const DEFAULT_OPEN = new Set(['summit', 'apex', 'david', 'unassigned'])

type GanttCtx = {
  zoom: Zoom
  columns: Column[]
  visColumns: Column[]
  colW: number
  viewWindow: TimeWindow
  selectedKeys: Set<string>
  dragIds: Set<string>
  editable: boolean
  weekGuideDay?: string
  resolve: (id: string, start: string, end: string, offDays?: string[]) => Span
  onBarClick: (id: string, additive?: boolean) => void
  onBarPointerDown: (event: ReactPointerEvent, id: string, span: Span, mode: DragMode) => void
}

const GanttContext = createContext<GanttCtx | null>(null)

function useGantt() {
  const ctx = useContext(GanttContext)
  if (!ctx) throw new Error('Gantt context missing')
  return ctx
}

function HoursReadout({
  scheduled,
  budget,
  actual,
  fallback,
}: {
  scheduled?: number
  budget?: number
  actual?: number
  fallback?: string
}) {
  if (scheduled == null || budget == null) {
    return fallback ? (
      <Text size="small" subdued>
        {fallback}
      </Text>
    ) : null
  }
  const over = hoursOver(scheduled, budget, actual)
  const pct = budget > 0 ? Math.min(100, (scheduled / budget) * 100) : 0
  return (
    <div className="rc-hours">
      {scheduled > 0 ? (
        <div className={`rc-meter${over ? ' is-over' : ''}`} aria-hidden>
          <span style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      <Text size="small" className={`rc-hours-label${over ? ' is-over' : ''}`} subdued={!over}>
        {hoursCaption(scheduled, budget)} · {actual ?? 0}h actual
      </Text>
    </div>
  )
}

export function ResourceCalendar() {
  const [groupBy, setGroupBy] = useState<GroupBy>('projects')
  const [zoom, setZoom] = useState<Zoom>('days')
  const [query, setQuery] = useState('')
  const [openIds, setOpenIds] = useState<Set<string>>(DEFAULT_OPEN)
  const [selected, setSelected] = useState<Selection[]>([])
  const [editOpen, setEditOpen] = useState(false)
  const [editHours, setEditHours] = useState('8')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [activeProjects, setActiveProjects] = useState<string[]>(['summit', 'apex', 'monolith'])
  const [spans, setSpans] = useState<Record<string, Span>>({})
  const [goTo, setGoTo] = useState(DEMO_TODAY)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const ignoreClick = useRef(false)
  const [dragIds, setDragIds] = useState<Set<string>>(new Set())
  const [dragHint, setDragHint] = useState<DragHint | null>(null)
  const zoomLock = useRef(0)
  const editable = isEditableZoom(zoom)

  const timeline = useTimelineScroll(zoom, scrollRef)
  const { columns, colW, viewWindow, dateAtClientX, jumpTo, autoScrollFromPointer, setAnchor } =
    timeline

  const visColumns = useMemo(() => {
    const minIndex = columns[0]?.index ?? timeline.firstVisible
    const maxIndex = columns[columns.length - 1]?.index ?? timeline.firstVisible
    const origin = Math.min(maxIndex, Math.max(minIndex, timeline.firstVisible))
    const start = origin - 4
    const end = origin + timeline.visibleCount + 6
    const slice = columns.filter((col) => col.index >= start && col.index <= end)
    return slice.length > 0 ? slice : columns.slice(0, Math.min(columns.length, 24))
  }, [columns, timeline.firstVisible, timeline.visibleCount])

  const q = query.trim().toLowerCase()
  const visibleAssignments = assignments.filter((a) => !hidden.has(a.id))
  const selectedKeys = new Set(selected)

  const resolve = useCallback(
    (id: string, start: string, end: string, offDays?: string[]) => spans[id] ?? emptySpan(start, end, offDays ?? []),
    [spans],
  )

  const spanById = useCallback(
    (id: string): Span | undefined => {
      if (spans[id]) return spans[id]
      const phase = phases.find((p) => p.id === id)
      if (phase) return emptySpan(phase.start, phase.end, phase.offDays ?? [])
      const row = assignments.find((a) => a.id === id)
      if (row) return emptySpan(row.start, row.end, row.offDays ?? [])
      if (id.startsWith('proj-')) {
        const project = projectById(id.slice(5))
        if (project) return emptySpan(project.start, project.end)
      }
      return undefined
    },
    [spans],
  )

  const changeZoom = useCallback(
    (next: Zoom, iso?: string, offsetPx?: number) => {
      if (next === zoom) return
      const date = iso ?? isoFromTs(viewWindow.start)
      setAnchor(date, offsetPx ?? 0)
      setZoom(next)
      setSelected([])
    },
    [zoom, viewWindow.start, setAnchor],
  )

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
      const iso = dateAtClientX(event.clientX)
      const offset = event.clientX - rect.left - GUTTER
      changeZoom(zoomStep(zoom, event.deltaY < 0 ? -1 : 1), iso, offset)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoom, dateAtClientX, changeZoom])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      const plus = event.key === '=' || event.key === '+'
      const minus = event.key === '-' || event.key === '_'
      if (!plus && !minus) return
      if (event.metaKey || event.ctrlKey || plus || minus) {
        event.preventDefault()
        changeZoom(zoomStep(zoom, plus ? -1 : 1), isoFromTs(viewWindow.start), 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom, changeZoom, viewWindow.start])

  useEffect(() => {
    if (selected.length === 0) return
    function onClickAway(event: Event) {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.rc-bar, .rc-bulk-bar, dialog, [role="dialog"]')) return
      setSelected([])
    }
    document.addEventListener('click', onClickAway, true)
    return () => document.removeEventListener('click', onClickAway, true)
  }, [selected.length])

  const applyDrag = useCallback(
    (clientX: number, clientY?: number) => {
      const drag = dragRef.current
      if (!drag) return
      if (Math.abs(clientX - drag.originX) > 5) drag.moved = true
      if (!drag.moved) return
      autoScrollFromPointer(clientX)
      const date = dateAtClientX(clientX)
      const delta = diffDays(drag.originDate, date)
      if (Math.abs(delta) > 0 || date !== drag.fromDay) drag.moved = true
      const next: Record<string, Span> = {}
      if (drag.mode === 'day') {
        const id = drag.ids[0]
        const snap = id ? drag.snapshot[id] : undefined
        if (id && snap) {
          next[id] = moveOneDay(snap, drag.fromDay, date)
        }
      } else if (drag.mode === 'resize') {
        const id = drag.ids[0]
        const snap = id ? drag.snapshot[id] : undefined
        if (id && snap) {
          next[id] = resizeSpanEnd(snap, date)
        }
      } else {
        for (const id of drag.ids) {
          const snap = drag.snapshot[id]
          if (!snap) continue
          next[id] = shiftSpan(snap, delta)
        }
      }
      if (Object.keys(next).length) setSpans((prev) => ({ ...prev, ...next }))
      const preview = Object.values(next)
      if (preview.length) {
        const start = preview.reduce((min, span) => (span.start < min ? span.start : min), preview[0]!.start)
        const end = preview.reduce((max, span) => (span.end > max ? span.end : max), preview[0]!.end)
        const label =
          drag.mode === 'move' ? formatMoveRange(start, end) : drag.mode === 'resize' ? formatDay(end) : formatDay(date)
        setDragHint({
          mode: drag.mode,
          x: clientX,
          y: clientY ?? drag.lastY,
          label,
          snapDay: drag.mode === 'resize' ? end : date,
        })
      }
    },
    [autoScrollFromPointer, dateAtClientX],
  )

  useEffect(() => {
    function onMove(event: PointerEvent) {
      if (!dragRef.current) return
      dragRef.current.lastX = event.clientX
      dragRef.current.lastY = event.clientY
      applyDrag(event.clientX, event.clientY)
    }
    function onUp() {
      if (!dragRef.current) return
      const drag = dragRef.current
      dragRef.current = null
      setDragIds(new Set())
      setDragHint(null)
      document.body.classList.remove('rc-grabbing')
      if (drag.moved) ignoreClick.current = true
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [applyDrag])

  useEffect(() => {
    if (dragIds.size === 0) return
    let frame = 0
    const tick = () => {
      const drag = dragRef.current
      if (drag) applyDrag(drag.lastX, drag.lastY)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [dragIds, applyDrag])

  function onBarClick(id: string, additive = false) {
    if (ignoreClick.current) {
      ignoreClick.current = false
      return
    }
    setSelected((prev) => {
      if (additive) return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      if (prev.length === 1 && prev[0] === id) return []
      return [id]
    })
  }

  function onBarPointerDown(event: ReactPointerEvent, id: string, span: Span, mode: DragMode) {
    if (!editable || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const originDate = dateAtClientX(event.clientX)
    const ids =
      mode === 'move' && selectedKeys.has(id) && selected.length > 1
        ? selected.filter((key) => spanById(key))
        : [id]
    const snapshot: Record<string, Span> = {}
    for (const key of ids) {
      const value = key === id ? span : spanById(key)
      if (value) snapshot[key] = value
    }
    dragRef.current = {
      mode,
      ids,
      originDate,
      fromDay: originDate,
      snapshot,
      originX: event.clientX,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    }
    setDragIds(new Set(ids))
    document.body.classList.add('rc-grabbing')
  }

  function toggleOpen(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const matches = (name: string) => !q || name.toLowerCase().includes(q)

  const projectList = projects.filter((p) => {
    if (p.leftover) return matches(p.name) || people.some((pe) => pe.leftover && matches(pe.name))
    if (!activeProjects.includes(p.id) && !p.leftover) return false
    return matches(p.name) || visibleAssignments.some((a) => a.projectId === p.id && personById(a.personId)?.name.toLowerCase().includes(q))
  })

  const personList = [
    { id: 'unassigned', name: 'Unassigned' },
    ...people,
  ].filter(
    (p) =>
      matches(p.name) ||
      visibleAssignments.some(
        (a) => a.personId === p.id && (projectById(a.projectId)?.name.toLowerCase().includes(q) ?? false),
      ),
  )

  const gantt: GanttCtx = {
    zoom,
    columns,
    visColumns,
    colW,
    viewWindow,
    selectedKeys,
    dragIds,
    editable,
    weekGuideDay: zoom === 'weeks' ? dragHint?.snapDay : undefined,
    resolve,
    onBarClick,
    onBarPointerDown,
  }

  const hintCopy =
    zoom === 'days'
      ? 'Click a bar · drag a day · Shift-click to add'
      : zoom === 'weeks'
        ? 'Click a bar · drag or resize · Shift-click to add'
        : 'Click a bar to select · editing is Days and Weeks only'

  const canZoomIn = zoom !== 'days'
  const canZoomOut = zoom !== 'year'

  return (
    <Flex direction="column" gap="3" className="rc-root">
      <Card padding="0" className="rc-card">
        <Flex direction="column" className="rc-body">
          <Flex direction="column" gap="2" className="rc-toolbar">
            <div className="rc-toolbar-row">
              <div className="rc-toolbar-cluster">
                <Text size="small" subdued>
                  Group by
                </Text>
                <SegmentedControl size="small" selected={groupBy} onChange={(value) => setGroupBy(value as GroupBy)}>
                  <SegmentedControl.Segment value="people">People</SegmentedControl.Segment>
                  <SegmentedControl.Segment value="projects">Projects</SegmentedControl.Segment>
                </SegmentedControl>
              </div>
              <div className="rc-toolbar-cluster">
                <Text size="small" subdued>
                  Zoom
                </Text>
                <Button size="small" icon={ZoomInIcon} disabled={!canZoomIn} onClick={() => changeZoom(zoomStep(zoom, -1))}>
                  In
                </Button>
                <SegmentedControl size="small" selected={zoom} onChange={(value) => changeZoom(value as Zoom)}>
                  <SegmentedControl.Segment value="days">Days</SegmentedControl.Segment>
                  <SegmentedControl.Segment value="weeks">Weeks</SegmentedControl.Segment>
                  <SegmentedControl.Segment value="months">Months</SegmentedControl.Segment>
                  <SegmentedControl.Segment value="quarters">Quarters</SegmentedControl.Segment>
                  <SegmentedControl.Segment value="year">Year</SegmentedControl.Segment>
                </SegmentedControl>
                <Button size="small" icon={ZoomOutIcon} disabled={!canZoomOut} onClick={() => changeZoom(zoomStep(zoom, 1))}>
                  Out
                </Button>
              </div>
              <div className="rc-toolbar-cluster">
                <Button
                  size="small"
                  onClick={() => {
                    setGoTo(DEMO_TODAY)
                    jumpTo(DEMO_TODAY, 0)
                  }}
                >
                  Today
                </Button>
                <label className="rc-date-jump">
                  <Text size="small" subdued>
                    Go to
                  </Text>
                  <input
                    type="date"
                    value={goTo}
                    onChange={(event) => {
                      const next = event.target.value
                      if (!isIsoDate(next)) return
                      setGoTo(next)
                      jumpTo(next, 0)
                    }}
                  />
                </label>
              </div>
              <div className="rc-toolbar-cluster">
                <SearchField
                  size="small"
                  placeholder="Filter people or projects"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onClear={() => setQuery('')}
                />
                <Button size="small" onClick={() => setOpenIds(new Set())}>
                  Collapse all
                </Button>
                <Button
                  size="small"
                  onClick={() =>
                    setOpenIds(new Set(['summit', 'apex', 'monolith', 'leftover', 'david', 'danny', 'kevin', 'chris', 'unassigned']))
                  }
                >
                  Expand all
                </Button>
              </div>
            </div>
            <div className="rc-toolbar-row">
              <Text size="small" subdued>
                Projects
              </Text>
              {projects
                .filter((p) => !p.leftover)
                .map((p) => (
                  <Chip
                    key={p.id}
                    size="small"
                    label={p.name.split(' ')[0] ?? p.name}
                    color={activeProjects.includes(p.id) ? p.color : undefined}
                    onClick={() =>
                      setActiveProjects((prev) => (prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id]))
                    }
                  />
                ))}
              <Chip size="small" label={hintCopy} />
            </div>
          </Flex>

          <div
            className={`rc-scroll${dragIds.size ? ' is-dragging' : ''}`}
            ref={scrollRef}
            style={
              {
                ['--rc-cols' as string]: String(columns.length),
                ['--rc-col-w' as string]: `${colW}px`,
              } as CSSProperties
            }
            onClick={(event) => {
              if (!(event.target instanceof Element)) return
              if (event.target.closest('.rc-bar, .rc-overlay')) return
              setSelected([])
            }}
          >
            <div className="rc-canvas" style={{ width: timeline.canvasWidth }}>
            <GanttContext.Provider value={gantt}>
              <div className="rc-grid-head">
                <div className="rc-gutter-head">
                  <Flex direction="column" gap="1">
                    <Text size="small">{groupBy === 'projects' ? 'Project · Hours' : 'Person · Hours'}</Text>
                    <Text size="small" className="rc-context-label">
                      {timeline.contextLabel || contextCaption(zoom, viewWindow)}
                    </Text>
                  </Flex>
                </div>
                <TimelineHeader zoom={zoom} columns={columns} visColumns={visColumns} colW={colW} weekGuideDay={gantt.weekGuideDay} />
              </div>

              {groupBy === 'projects'
                ? projectList.map((project) => (
                    <ProjectBlock
                      key={project.id}
                      project={project}
                      open={openIds.has(project.id)}
                      onToggle={() => toggleOpen(project.id)}
                      assignments={visibleAssignments.filter((a) => a.projectId === project.id)}
                    />
                  ))
                : personList.map((entry) => (
                    <PersonBlock
                      key={entry.id}
                      personId={entry.id}
                      open={openIds.has(entry.id)}
                      onToggle={() => toggleOpen(entry.id)}
                      assignments={visibleAssignments.filter((a) => a.personId === entry.id)}
                    />
                  ))}
            </GanttContext.Provider>
            </div>
          </div>
        </Flex>
      </Card>

      {zoom === 'weeks' && dragHint ? (
        <div className="rc-drag-tip" style={{ left: dragHint.x, top: dragHint.y }}>
          {dragHint.label}
        </div>
      ) : null}

      {selected.length > 0 ? (
        <div className="rc-bulk-bar">
          <div className="rc-bulk-bar-copy">
            <Text>
              <strong>{selected.length}</strong> bar{selected.length === 1 ? '' : 's'} selected
            </Text>
            <Button appearance="ghost" onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
          {editable ? (
            <div className="rc-bulk-bar-actions">
              <Button
                appearance="secondary"
                icon={DeleteIcon}
                onClick={() => {
                  const ids = new Set(
                    visibleAssignments
                      .filter((a) => selectedKeys.has(a.id) || (a.phaseId != null && selectedKeys.has(a.phaseId)) || selectedKeys.has(`proj-${a.projectId}`))
                      .map((a) => a.id),
                  )
                  setHidden((prev) => new Set([...prev, ...ids]))
                  setSelected([])
                  toast.danger({ title: 'Deleted', message: 'Selected assignments were removed from this prototype.' })
                }}
              >
                Delete
              </Button>
              <Button
                appearance="secondary"
                icon={EditIcon}
                onClick={() => {
                  setEditHours('8')
                  setEditOpen(true)
                }}
              >
                Edit
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <Dialog open={editOpen} onClose={() => setEditOpen(false)}>
        <Dialog.Header>{isDayZoom(zoom) ? 'Edit day' : 'Edit bar'}</Dialog.Header>
        <Dialog.Content>
          <Flex direction="column" gap="3">
            <Text subdued>
              {isDayZoom(zoom)
                ? 'Hours apply to the selected day. Switch to Weeks to move or resize the whole bar.'
                : 'Edits hours on the selected bar' + (selected.length === 1 ? '' : 's') + '. Month, Quarter, and Year are read-only.'}
            </Text>
            <TextField name="hours" label={isDayZoom(zoom) ? 'Hours this day' : 'Hours per day'} value={editHours} onChange={(e) => setEditHours(e.target.value)} />
          </Flex>
        </Dialog.Content>
        <Dialog.Footer>
          <Dialog.CancelButton>Cancel</Dialog.CancelButton>
          <Button
            appearance="primary"
            onClick={() => {
              setEditOpen(false)
              setSelected([])
              toast.success({ title: 'Updated', message: `Set ${editHours} hours on ${selected.length} bar${selected.length === 1 ? '' : 's'}.` })
            }}
          >
            Save
          </Button>
        </Dialog.Footer>
      </Dialog>
    </Flex>
  )
}

function TimelineHeader({
  zoom,
  columns,
  visColumns,
  colW,
  weekGuideDay,
}: {
  zoom: Zoom
  columns: Column[]
  visColumns: Column[]
  colW: number
  weekGuideDay?: string
}) {
  const showMonthBand = zoom === 'days' || zoom === 'weeks'
  const minIndex = columns[0]?.index ?? 0
  return (
    <div className="rc-head-timeline" style={{ ['--rc-cols' as string]: String(columns.length), ['--rc-col-w' as string]: `${colW}px` }}>
      {showMonthBand ? (
        <div className="rc-month-band">
          {monthBands(columns).map((band) => (
            <div
              className="rc-month-cell"
              key={band.id}
              style={{ left: (band.startIndex - minIndex) * colW, width: colW * band.span }}
            >
              <span>{band.label}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="rc-cols">
        {weekGuideDay ? (
          <div
            className="rc-day-guide"
            style={{
              left: worldXForDate(zoom, minIndex, colW, weekGuideDay),
              width: colW / 7,
            }}
          />
        ) : null}
        {visColumns.map((col) => (
          <div
            className={`rc-col${col.today ? ' is-today' : ''}${col.weekend ? ' is-weekend' : ''}`}
            data-col={col.id}
            key={col.id}
            style={{ ['--rc-i' as string]: col.index - minIndex }}
          >
            {zoom === 'days' ? (
              <>
                <Text size="small" subdued>
                  {col.sublabel}
                </Text>
                <Text size="small">{col.label}</Text>
              </>
            ) : (
              <>
                <Text size="small">{col.label}</Text>
                {col.sublabel ? (
                  <Text size="small" subdued>
                    {col.sublabel}
                  </Text>
                ) : null}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function durationBarLabel(project: Project) {
  return hoursCaption(project.scheduledHours, project.budgetHours)
}

function ProjectBlock({
  project,
  open,
  onToggle,
  assignments: rows,
}: {
  project: Project
  open: boolean
  onToggle: () => void
  assignments: Assignment[]
}) {
  const { viewWindow, resolve, selectedKeys } = useGantt()
  const projectPhases = phases.filter((p) => p.projectId === project.id)
  const techs = [...new Set(rows.filter((r) => r.personId !== 'unassigned').map((r) => r.personId))]
  const phaseSpans = projectPhases.map((phase) => ({ ...phase, ...resolve(phase.id, phase.start, phase.end, phase.offDays) }))
  const sparkline = packLanes(phaseSpans, viewWindow)
  const projectOver = hoursOver(project.scheduledHours, project.budgetHours, project.actualHours)
  const phaseHint = projectPhases
    .map((phase) => {
      const cap = hoursCaption(phase.scheduledHours, phase.budgetHours)
      return cap ? `${phase.name} · ${cap}` : phase.name
    })
    .join(' · ')
  const projectName = project.name.replace(' Tentative', '')
  const projectSpan = resolve(`proj-${project.id}`, project.start, project.end)

  return (
    <>
      <div className={`rc-row is-group${projectOver ? ' is-over' : ''}${sparkline.laneCount > 1 ? ' is-stacked' : ''}`}>
        <div className="rc-gutter">
          <button className={`rc-chevron ${open ? 'is-open' : ''}`} type="button" onClick={onToggle} aria-label={open ? 'Collapse' : 'Expand'}>
            <Icon svg={ExpandMoreIcon} size="small" inherit />
          </button>
          <Flex direction="column" className="rc-gutter-copy">
            <Flex alignItems="center" gap="2">
              {!open && phaseHint ? (
                <Tooltip openOnHover>
                  <Tooltip.Trigger>
                    <Text>{projectName}</Text>
                  </Tooltip.Trigger>
                  <Tooltip.Content>{phaseHint}</Tooltip.Content>
                </Tooltip>
              ) : (
                <Text>{projectName}</Text>
              )}
              {project.tentative ? <Chip size="small" label="Tentative" color="#ffbe00" /> : null}
            </Flex>
            <HoursReadout
              scheduled={project.scheduledHours}
              budget={project.budgetHours}
              actual={project.actualHours}
              fallback={open ? project.hours : project.collapsedHours}
            />
          </Flex>
        </div>
        <Timeline packed={projectPhases.length > 0 ? sparkline : undefined} thin={!open}>
          {project.leftover ? null : projectPhases.length > 0 ? (
            phaseSpans.map((phase) => {
              const cap = hoursCaption(phase.scheduledHours, phase.budgetHours)
              const over = hoursOver(phase.scheduledHours, phase.budgetHours, phase.actualHours)
              return (
                <SpanBar
                  key={phase.id}
                  id={phase.id}
                  span={phase}
                  color={phase.color}
                  label={open ? (cap ? `${phase.name} · ${cap}` : phase.name) : undefined}
                  thin={!open}
                  selected={selectedKeys.has(phase.id)}
                  lane={sparkline.laneById.get(phase.id) ?? 0}
                  hint={`${phase.name} · ${phase.scheduledHours} scheduled / ${phase.budgetHours} budget · ${phase.actualHours} actual${over ? ' · over budget' : ''}`}
                />
              )
            })
          ) : (
            <SpanBar
              id={`proj-${project.id}`}
              span={projectSpan}
              color={project.color}
              label={open ? durationBarLabel(project) : undefined}
              thin={!open}
              selected={selectedKeys.has(`proj-${project.id}`)}
            />
          )}
        </Timeline>
      </div>
      {open && !project.leftover ? <UnassignedRow rows={rows.filter((r) => r.kind === 'unassigned')} /> : null}
      {open && !project.leftover
        ? techs.map((personId) => <PersonAssignmentRow key={`${project.id}-${personId}`} personId={personId} projectId={project.id} rows={rows.filter((r) => r.personId === personId)} />)
        : null}
      {open && project.leftover
        ? people
            .filter((p) => p.leftover)
            .map((p) => (
              <div className="rc-row rc-nested" key={p.id}>
                <div className="rc-gutter">
                  <Avatar name={p.name} size="small" color={p.color} />
                  <Flex direction="column">
                    <Text>{p.name}</Text>
                    <Text size="small" subdued>
                      {p.role}
                    </Text>
                  </Flex>
                </div>
                <Timeline />
              </div>
            ))
        : null}
    </>
  )
}

function PersonBlock({
  personId,
  open,
  onToggle,
  assignments: rows,
}: {
  personId: string
  open: boolean
  onToggle: () => void
  assignments: Assignment[]
}) {
  const { viewWindow, zoom, resolve, selectedKeys } = useGantt()
  const person = personId === 'unassigned' ? undefined : personById(personId)
  const meta =
    personId === 'unassigned'
      ? { text: 'No technician', detail: rows.map((r) => r.label).join(' + '), over: false }
      : personHoursInWindow(
          personId,
          assignments.map((row) => ({ ...row, ...resolve(row.id, row.start, row.end, row.offDays) })),
          viewWindow,
        )
  const grouped = projects
    .filter((p) => !p.leftover && rows.some((r) => r.projectId === p.id))
    .map((p) => ({ project: p, rows: rows.filter((r) => r.projectId === p.id) }))
  const resolvedRows = rows.map((row) => ({ ...row, ...resolve(row.id, row.start, row.end, row.offDays) }))
  const packed = packLanes(resolvedRows, viewWindow)

  return (
    <>
      <div className={`rc-row is-group ${meta.over ? 'is-over' : ''}${packed.laneCount > 1 ? ' is-stacked' : ''}`}>
        <div className="rc-gutter">
          <button className={`rc-chevron ${open ? 'is-open' : ''}`} type="button" onClick={onToggle} aria-label={open ? 'Collapse' : 'Expand'}>
            <Icon svg={ExpandMoreIcon} size="small" inherit />
          </button>
          {person ? <Avatar name={person.name} size="small" color={person.color} /> : <Avatar name="Unassigned" size="small" />}
          <Flex direction="column" className="rc-gutter-copy">
            <Text>{person?.name ?? 'Unassigned'}</Text>
            <HoursMeta text={meta.text} detail={meta.detail} danger={meta.over} />
          </Flex>
        </div>
        <Timeline packed={packed} thin={open}>
          {resolvedRows.map((row) => (
            <SpanBar
              key={row.id}
              id={row.id}
              span={row}
              color={assignmentColor(row, projectById(row.projectId)?.color ?? '#8b8b8b')}
              label={open ? undefined : zoomBarLabel(zoom, row)}
              thin={open}
              confirmed={row.confirmed}
              unassigned={row.kind === 'unassigned'}
              selected={selectedKeys.has(row.id)}
              lane={packed.laneById.get(row.id) ?? 0}
            />
          ))}
        </Timeline>
      </div>
      {open
        ? grouped.map(({ project, rows: projectRows }) => {
            const nestedRows = projectRows.map((row) => ({ ...row, ...resolve(row.id, row.start, row.end, row.offDays) }))
            const nested = packLanes(nestedRows, viewWindow)
            return (
              <div className={`rc-row rc-nested${nested.laneCount > 1 ? ' is-stacked' : ''}`} key={project.id}>
                <div className="rc-gutter">
                  <Flex direction="column" className="rc-gutter-copy">
                    <Text>{project.name.replace(' Tentative', '')}</Text>
                    <Text size="small" subdued>
                      {projectRows.map((r) => r.label).join(' + ')}
                    </Text>
                  </Flex>
                </div>
                <Timeline packed={nested}>
                  {nestedRows.map((row) => (
                    <SpanBar
                      key={row.id}
                      id={row.id}
                      span={row}
                      color={assignmentColor(row, project.color)}
                      label={zoomBarLabel(zoom, row)}
                      confirmed={row.confirmed}
                      unassigned={row.kind === 'unassigned'}
                      selected={selectedKeys.has(row.id)}
                      lane={nested.laneById.get(row.id) ?? 0}
                    />
                  ))}
                </Timeline>
              </div>
            )
          })
        : null}
    </>
  )
}

function HoursMeta({ text, detail, danger }: { text: string; detail?: string; danger?: boolean }) {
  if (danger && detail) {
    return (
      <Tooltip openOnHover>
        <Tooltip.Trigger>
          <Text size="small" className="a2-c-danger">
            {text}
          </Text>
        </Tooltip.Trigger>
        <Tooltip.Content>{detail}</Tooltip.Content>
      </Tooltip>
    )
  }
  return (
    <Tooltip openOnHover>
      <Tooltip.Trigger>
        <Text size="small" className={danger ? 'a2-c-danger' : undefined} subdued={!danger}>
          {text}
        </Text>
      </Tooltip.Trigger>
      <Tooltip.Content>{detail || text}</Tooltip.Content>
    </Tooltip>
  )
}

function assignmentColor(row: Assignment, fallback: string) {
  return phaseById(row.phaseId)?.color ?? fallback
}

function UnassignedRow({ rows }: { rows: Assignment[] }) {
  const { viewWindow, zoom, resolve, selectedKeys } = useGantt()
  const resolvedRows = rows.map((row) => ({ ...row, ...resolve(row.id, row.start, row.end, row.offDays) }))
  const packed = packLanes(resolvedRows, viewWindow)
  if (rows.length === 0) return null
  return (
    <div className={`rc-row rc-nested${packed.laneCount > 1 ? ' is-stacked' : ''}`}>
      <div className="rc-gutter">
        <Avatar name="Unassigned" size="small" />
        <Flex direction="column" className="rc-gutter-copy">
          <Text>Unassigned</Text>
          <Text size="small" subdued>
            No technician · {rows.map((r) => r.label).join(' + ')}
          </Text>
        </Flex>
      </div>
      <Timeline packed={packed}>
        {resolvedRows.map((row) => (
          <SpanBar
            key={row.id}
            id={row.id}
            span={row}
            color={assignmentColor(row, '#e8e8e8')}
            label={zoomBarLabel(zoom, row)}
            unassigned
            selected={selectedKeys.has(row.id)}
            lane={packed.laneById.get(row.id) ?? 0}
          />
        ))}
      </Timeline>
    </div>
  )
}

function PersonAssignmentRow({
  personId,
  projectId,
  rows,
}: {
  personId: string
  projectId: string
  rows: Assignment[]
}) {
  const { viewWindow, zoom, resolve, selectedKeys } = useGantt()
  const person = personById(personId)
  const meta = personHoursInWindow(
    personId,
    assignments.map((row) => ({ ...row, ...resolve(row.id, row.start, row.end, row.offDays) })),
    viewWindow,
  )
  const resolvedRows = rows.map((row) => ({ ...row, ...resolve(row.id, row.start, row.end, row.offDays) }))
  const packed = packLanes(resolvedRows, viewWindow)
  if (!person) return null
  return (
    <div className={`rc-row rc-nested ${meta.over ? 'is-over' : ''}${packed.laneCount > 1 ? ' is-stacked' : ''}`}>
      <div className="rc-gutter">
        <Avatar name={person.name} size="small" color={person.color} />
        <Flex direction="column" className="rc-gutter-copy">
          <Text>{person.name}</Text>
          <HoursMeta text={meta.text} detail={meta.detail} danger={meta.over} />
        </Flex>
      </div>
      <Timeline packed={packed}>
        {resolvedRows.map((row) => (
          <SpanBar
            key={row.id}
            id={row.id}
            span={row}
            color={assignmentColor(row, projectById(projectId)?.color ?? person.color)}
            label={zoomBarLabel(zoom, row)}
            confirmed={row.confirmed}
            selected={selectedKeys.has(row.id)}
            lane={packed.laneById.get(row.id) ?? 0}
          />
        ))}
      </Timeline>
    </div>
  )
}

function Timeline({
  packed,
  thin,
  children,
}: {
  packed?: { laneCount: number }
  thin?: boolean
  children?: ReactNode
}) {
  const { columns, visColumns, colW, zoom, weekGuideDay } = useGantt()
  const minIndex = columns[0]?.index ?? 0
  const style = {
    ['--rc-lanes' as string]: String(packed?.laneCount ?? 1),
    ['--rc-cols' as string]: String(columns.length),
    ['--rc-col-w' as string]: `${colW}px`,
  } as CSSProperties
  return (
    <div className={`rc-timeline${thin ? ' is-thin' : ''}${(packed?.laneCount ?? 1) <= 1 ? ' is-single' : ''}`} style={style}>
      {visColumns.map((col) => (
        <div
          className={`rc-cell${col.weekend ? ' is-weekend' : ''}${col.today ? ' is-today' : ''}`}
          key={col.id}
          style={{ ['--rc-i' as string]: col.index - minIndex }}
        />
      ))}
      {weekGuideDay ? (
        <div
          className="rc-day-guide"
          style={{
            left: worldXForDate(zoom, minIndex, colW, weekGuideDay),
            width: colW / 7,
          }}
        />
      ) : null}
      {children}
    </div>
  )
}

function SpanBar({
  id,
  span,
  color,
  label,
  thin,
  confirmed,
  unassigned,
  selected,
  lane = 0,
  hint,
}: {
  id: string
  span: Span
  color: string
  label?: string
  thin?: boolean
  confirmed?: boolean
  unassigned?: boolean
  selected?: boolean
  lane?: number
  hint?: string
}) {
  const { zoom, columns, dragIds, editable, onBarClick, onBarPointerDown } = useGantt()
  const segs = activeSegments(span.start, span.end, span.offDays)
  const wholeBar = zoom === 'weeks'
  return (
    <>
      {segs.map((seg) => (
        <BarSegment
          key={`${id}-${seg.start}`}
          id={id}
          span={span}
          seg={seg}
          color={color}
          label={label}
          thin={thin}
          confirmed={confirmed}
          unassigned={unassigned}
          selected={selected}
          lane={lane}
          hint={hint}
          columns={columns}
          zoom={zoom}
          wholeBar={wholeBar}
          editable={editable}
          dragging={dragIds.has(id)}
          onBarClick={onBarClick}
          onBarPointerDown={onBarPointerDown}
        />
      ))}
    </>
  )
}

function BarSegment({
  id,
  span,
  seg,
  color,
  label,
  thin,
  confirmed,
  unassigned,
  selected,
  lane,
  hint,
  columns,
  zoom,
  wholeBar,
  editable,
  dragging,
  onBarClick,
  onBarPointerDown,
}: {
  id: string
  span: Span
  seg: { start: string; end: string }
  color: string
  label?: string
  thin?: boolean
  confirmed?: boolean
  unassigned?: boolean
  selected?: boolean
  lane: number
  hint?: string
  columns: Column[]
  zoom: Zoom
  wholeBar: boolean
  editable: boolean
  dragging: boolean
  onBarClick: (id: string, additive?: boolean) => void
  onBarPointerDown: (event: ReactPointerEvent, id: string, span: Span, mode: DragMode) => void
}) {
  const style = barStyle(seg.start, seg.end, columns)
  if (!style.visible) return null
  const sliver = segmentIsSliver(seg.start, seg.end, zoom)
  const title = hint ?? `${label ?? ''} ${formatRange(seg.start, seg.end)}`.trim()
  const tooltip = sliver
    ? `${label ? `${label} · ` : ''}${formatRange(seg.start, seg.end)}${seg.start === seg.end ? ' · 1 day' : ''}`
    : title

  return (
    <div
      role="button"
      tabIndex={-1}
      className={`rc-bar${thin ? ' is-thin' : ''}${unassigned ? ' is-unassigned' : ''}${selected ? ' is-selected' : ''}${sliver ? ' is-sliver' : ''}${dragging ? ' is-dragging' : ''}${editable ? '' : ' is-readonly'}`}
      style={
        {
          left: `calc(${style.left} + 3px)`,
          width: `calc(${style.width} - 6px)`,
          background: unassigned ? undefined : color,
          color: unassigned ? undefined : contrastText(color),
          '--rc-lane': lane,
          '--rc-bar-color': color,
        } as CSSProperties
      }
      title={tooltip}
      onClick={(event) => {
        event.stopPropagation()
        if (!dragging) onBarClick(id, event.shiftKey)
      }}
      onPointerDown={(event) => {
        if (!editable || event.button !== 0) return
        onBarPointerDown(event, id, span, wholeBar ? 'move' : 'day')
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onBarClick(id)
        }
      }}
    >
      {(confirmed || selected) && !thin && !sliver ? <Icon svg={CheckIcon} size="small" inherit /> : null}
      {!thin && label && !sliver ? <span className="rc-bar-label">{label}</span> : null}
      {editable && wholeBar && !thin ? (
        <span
          className="rc-bar-handle"
          onPointerDown={(event) => {
            event.stopPropagation()
            onBarPointerDown(event, id, span, 'resize')
          }}
        />
      ) : null}
    </div>
  )
}

function contrastText(bg: string) {
  const hex = bg.replace('#', '')
  if (hex.length !== 6) return '#040404'
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 160 ? '#040404' : '#ffffff'
}
