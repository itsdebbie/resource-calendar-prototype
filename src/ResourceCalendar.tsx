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
  Popover,
  SearchField,
  SegmentedControl,
  Switch,
  Text,
  TextField,
  toast,
  Tooltip,
} from '@servicetitan/anvil2'
import {
  assignmentAddress,
  assignmentLabel,
  assignments,
  clockLabel,
  collectIssues,
  displayHours,
  hoursOver,
  hoursTooltipLine,
  hoursTotal,
  overCapacityAssignmentIds,
  people,
  personById,
  personHoursInWindow,
  phases,
  projectById,
  projects,
  zoomBarLabel,
  zoomBarParts,
  type Assignment,
  type CalendarIssue,
  type GroupBy,
  type IssueKind,
  type Project,
  type Zoom,
} from './data'
import {
  CREW_PANEL_KEY,
  DEMO_TODAY,
  GUTTER,
  SHORT_BAR_PX,
  addDays,
  barPixelBox,
  isIsoDate,
  isoFromTs,
  activeSegments,
  barStyle,
  diffDays,
  emptySpan,
  formatDay,
  formatMoveRange,
  formatRange,
  formatWindowCaption,
  isDayZoom,
  isEditableZoom,
  monthBands,
  moveOneDay,
  packLanes,
  periodPinLabel,
  resizeSpanEnd,
  segmentIsSliver,
  shiftSpan,
  todayMarkerX,
  mondayOf,
  weekIndexOf,
  weekendSlices,
  worldXForDate,
  yearBands,
  zoomStep,
  type Column,
  type Span,
  type TimeWindow,
} from './timeline'
import { useTimelineScroll } from './useTimelineScroll'
import { tintFill } from './palette'
import { buildCrewRows, crewOnVisibleCount, snapshotCrewHours } from './crew'
import { CrewPanel } from './CrewPanel'
import {
  CalendarCheckIcon,
  DeleteIcon,
  EditIcon,
  ExpandMoreIcon,
  PersonQuestionIcon,
  WarningIcon,
} from './icons'
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
const ALL_OPEN = new Set(['summit', 'apex', 'monolith', 'leftover', 'david', 'danny', 'kevin', 'chris', 'unassigned'])

function isTextEntryTarget(target: EventTarget | null) {
  if (target instanceof HTMLTextAreaElement) return true
  if (target instanceof HTMLElement && target.isContentEditable) return true
  if (!(target instanceof HTMLInputElement)) return false
  return target.type !== 'radio' && target.type !== 'checkbox' && target.type !== 'button' && target.type !== 'submit'
}

function readCrewOpen() {
  try {
    return localStorage.getItem(CREW_PANEL_KEY) === '1'
  } catch {
    return false
  }
}

type ClickMods = { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }

type GanttCtx = {
  zoom: Zoom
  columns: Column[]
  visColumns: Column[]
  colW: number
  viewWindow: TimeWindow
  clipLeft: number
  viewPx: number
  selectedKeys: Set<string>
  dragIds: Set<string>
  editable: boolean
  showWeekends: boolean
  weekGuideDay?: string
  resolve: (id: string, start: string, end: string, offDays?: string[]) => Span
  onBarClick: (id: string, mods?: ClickMods) => void
  onBarPointerDown: (event: ReactPointerEvent, id: string, span: Span, mode: DragMode, extraIds?: string[]) => void
  onEditInWeek: (span: Span) => void
}

const GanttContext = createContext<GanttCtx | null>(null)

function useGantt() {
  const ctx = useContext(GanttContext)
  if (!ctx) throw new Error('Gantt context missing')
  return ctx
}

function Name({ children, title }: { children: string; title?: string }) {
  const full = title ?? children
  return (
    <Tooltip openOnHover delay={400}>
      <Tooltip.Trigger>
        <Text className="rc-truncate">{children}</Text>
      </Tooltip.Trigger>
      <Tooltip.Content>{full}</Tooltip.Content>
    </Tooltip>
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
  const [showWeekends, setShowWeekends] = useState(false)
  const [crewOpen, setCrewOpen] = useState(readCrewOpen)
  const [showAllCrew, setShowAllCrew] = useState(false)
  const [finder, setFinder] = useState<{ kind: IssueKind; index: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const ignoreClick = useRef(false)
  const selectAnchor = useRef<string | null>(null)
  const [dragIds, setDragIds] = useState<Set<string>>(new Set())
  const [dragHint, setDragHint] = useState<DragHint | null>(null)
  const [hoursBefore, setHoursBefore] = useState<Record<string, number> | null>(null)
  const zoomLock = useRef(0)
  const editable = isEditableZoom(zoom)

  const timeline = useTimelineScroll(zoom, scrollRef)
  const { columns, colW, viewWindow, dateAtClientX, jumpTo, autoScrollFromPointer, setAnchor, scrollLeft, viewportPx } =
    timeline

  const visColumns = useMemo(() => {
    const minIndex = columns[0]?.index ?? timeline.firstVisible
    const maxIndex = columns[columns.length - 1]?.index ?? timeline.firstVisible
    const origin = Math.min(maxIndex, Math.max(minIndex, timeline.firstVisible))
    const start = origin
    const end = origin + timeline.visibleCount + 6
    const slice = columns.filter((col) => col.index >= start && col.index <= end)
    return slice.length > 0 ? slice : columns.slice(0, Math.min(columns.length, 24))
  }, [columns, timeline.firstVisible, timeline.visibleCount])

  const q = query.trim().toLowerCase()
  const visibleAssignments = useMemo(
    () => assignments.filter((a) => !hidden.has(a.id)),
    [hidden],
  )
  const selectedKeys = new Set(selected)

  const resolve = useCallback(
    (id: string, start: string, end: string, offDays?: string[]) => spans[id] ?? emptySpan(start, end, offDays ?? []),
    [spans],
  )

  const resolvedAssignments = useMemo(
    () => visibleAssignments.map((row) => ({ ...row, ...resolve(row.id, row.start, row.end, row.offDays) })),
    [visibleAssignments, resolve],
  )

  const [crewAssignments, setCrewAssignments] = useState(resolvedAssignments)
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setCrewAssignments(resolvedAssignments.map((row) => ({ ...row })))
    })
    return () => cancelAnimationFrame(frame)
  }, [resolvedAssignments])

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
      if (isTextEntryTarget(target)) return
      if (finder) {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault()
          stepFinder(event.key === 'ArrowDown' ? 1 : -1)
          return
        }
        if (event.key === 'Escape') {
          setFinder(null)
          return
        }
      }
      const plus = event.key === '=' || event.key === '+'
      const minus = event.key === '-' || event.key === '_'
      if (!plus && !minus) return
      event.preventDefault()
      changeZoom(zoomStep(zoom, plus ? -1 : 1), isoFromTs(viewWindow.start), 0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (selected.length === 0) return
    function onClickAway(event: Event) {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.rc-bar, .rc-bulk-bar, .rc-chip-item, .rc-finder, .rc-issue-chip, dialog, [role="dialog"]')) return
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
      setHoursBefore(null)
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

  const orderedIds = useMemo(() => {
    const ids: string[] = []
    if (groupBy === 'projects') {
      for (const project of projectList) {
        ids.push(`proj-${project.id}`)
        for (const phase of phases.filter((p) => p.projectId === project.id)) ids.push(phase.id)
        for (const row of visibleAssignments.filter((a) => a.projectId === project.id)) ids.push(row.id)
      }
    } else {
      for (const entry of personList) {
        for (const row of visibleAssignments.filter((a) => a.personId === entry.id)) ids.push(row.id)
      }
    }
    return ids
  }, [groupBy, projectList, personList, visibleAssignments])

  function onBarClick(id: string, mods: ClickMods = {}) {
    if (ignoreClick.current) {
      ignoreClick.current = false
      return
    }
    const additive = Boolean(mods.metaKey || mods.ctrlKey)
    const range = Boolean(mods.shiftKey)
    setSelected((prev) => {
      if (range && selectAnchor.current) {
        const order = orderedIds
        const a = order.indexOf(selectAnchor.current)
        const b = order.indexOf(id)
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a]
          return order.slice(lo, hi + 1)
        }
      }
      if (additive) {
        selectAnchor.current = id
        return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      }
      selectAnchor.current = id
      if (prev.length === 1 && prev[0] === id) return []
      return [id]
    })
  }

  function onBarPointerDown(event: ReactPointerEvent, id: string, span: Span, mode: DragMode, extraIds?: string[]) {
    if (!editable || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    setHoursBefore(snapshotCrewHours(crewRows))
    const originDate = dateAtClientX(event.clientX)
    const ids =
      extraIds && extraIds.length > 1
        ? extraIds
        : mode === 'move' && selectedKeys.has(id) && selected.length > 1
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

  const onEditInWeek = useCallback(
    (span: Span) => {
      const mid = addDays(span.start, Math.floor(diffDays(span.start, span.end) / 2))
      changeZoom('weeks', mid, Math.round(viewportPx / 2))
    },
    [changeZoom, viewportPx],
  )

  const issues = useMemo(
    () => collectIssues(crewAssignments, activeProjects, showWeekends),
    [crewAssignments, activeProjects, showWeekends],
  )

  const crewRows = useMemo(
    () => buildCrewRows(people, crewAssignments, visColumns, showWeekends, showAllCrew, activeProjects),
    [crewAssignments, visColumns, showWeekends, showAllCrew, activeProjects],
  )

  const crewCounts = useMemo(
    () => crewOnVisibleCount(people, crewAssignments, activeProjects),
    [crewAssignments, activeProjects],
  )

  function focusIssue(issue: CalendarIssue) {
    setOpenIds((prev) => {
      const next = new Set(prev)
      next.add(issue.projectId)
      if (issue.personId) next.add(issue.personId)
      return next
    })
    setCrewOpen(true)
    try {
      localStorage.setItem(CREW_PANEL_KEY, '1')
    } catch {
      /* ignore */
    }
    setSelected([issue.targetId])
    selectAnchor.current = issue.targetId
    jumpTo(issue.date, Math.round(viewportPx / 3))
    requestAnimationFrame(() => {
      document.querySelector(`[data-span="${issue.targetId}"]`)?.scrollIntoView({ block: 'center', inline: 'nearest' })
    })
  }

  function openFinder(kind: IssueKind) {
    const list = issues[kind]
    if (list.length === 0) return
    setFinder({ kind, index: 0 })
    const first = list[0]
    if (first) focusIssue(first)
  }

  function stepFinder(delta: number) {
    setFinder((prev) => {
      if (!prev) return prev
      const list = issues[prev.kind]
      if (list.length === 0) return null
      const index = (prev.index + delta + list.length) % list.length
      const issue = list[index]
      if (issue) focusIssue(issue)
      return { ...prev, index }
    })
  }

  const gantt: GanttCtx = {
    zoom,
    columns,
    visColumns,
    colW,
    viewWindow,
    clipLeft: scrollLeft,
    viewPx: viewportPx,
    selectedKeys,
    dragIds,
    editable,
    showWeekends,
    weekGuideDay: zoom === 'weeks' ? dragHint?.snapDay : undefined,
    resolve,
    onBarClick,
    onBarPointerDown,
    onEditInWeek,
  }

  const [zoomTipOpen, setZoomTipOpen] = useState<boolean | undefined>(undefined)
  const zoomTip = useMemo(() => {
    const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)
    return mac
      ? 'Zoom with pinch, ⌘ + scroll, or + / −'
      : 'Zoom with pinch, Ctrl + scroll, or + / −'
  }, [])

  const draggingPersonId = useMemo(() => {
    const id = [...dragIds][0]
    if (!id) return undefined
    return assignments.find((row) => row.id === id)?.personId
  }, [dragIds])

  function persistCrew(next: boolean) {
    setCrewOpen(next)
    try {
      localStorage.setItem(CREW_PANEL_KEY, next ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  return (
    <Flex direction="column" gap="3" className={`rc-root ${groupBy === 'people' ? 'rc-is-people' : 'rc-is-projects'}`}>
      <Card padding="0" className="rc-card">
        <Flex direction="column" className="rc-body">
          <Flex direction="column" gap="2" className="rc-toolbar">
            <div className="rc-toolbar-row">
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
                <SegmentedControl size="small" selected={groupBy} onChange={(value) => setGroupBy(value as GroupBy)}>
                  <SegmentedControl.Segment value="people">People</SegmentedControl.Segment>
                  <SegmentedControl.Segment value="projects">Projects</SegmentedControl.Segment>
                </SegmentedControl>
              </div>
              <div className="rc-toolbar-cluster">
                <Tooltip openOnHover delay={600} placement="top" open={zoomTipOpen}>
                  <Tooltip.Trigger
                    onPointerDown={() => setZoomTipOpen(false)}
                    onClick={() => setZoomTipOpen(false)}
                    onMouseLeave={() => setZoomTipOpen(undefined)}
                  >
                    <SegmentedControl size="small" selected={zoom} onChange={(value) => changeZoom(value as Zoom)}>
                      <SegmentedControl.Segment value="days">Day</SegmentedControl.Segment>
                      <SegmentedControl.Segment value="weeks">Week</SegmentedControl.Segment>
                      <SegmentedControl.Segment value="months">Month</SegmentedControl.Segment>
                      <SegmentedControl.Segment value="quarters">Quarter</SegmentedControl.Segment>
                      <SegmentedControl.Segment value="year">Year</SegmentedControl.Segment>
                    </SegmentedControl>
                  </Tooltip.Trigger>
                  <Tooltip.Content>{zoomTip}</Tooltip.Content>
                </Tooltip>
              </div>
              <div className="rc-toolbar-cluster rc-toolbar-end">
                <Switch
                  label="Show Weekends"
                  checked={showWeekends}
                  onChange={(_, state) => setShowWeekends(state.checked)}
                />
              </div>
            </div>
            <div className="rc-toolbar-row">
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
              <SearchField
                size="small"
                placeholder="Filter people or projects"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onClear={() => setQuery('')}
              />
              <KeyPopover />
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
              if (event.target.closest('.rc-bar, .rc-overlay, .rc-crew, .rc-chip-item')) return
              setSelected([])
            }}
          >
            <div className="rc-canvas" style={{ width: timeline.canvasWidth }}>
            <GanttContext.Provider value={gantt}>
              <div className="rc-grid-head">
                <div className="rc-gutter-head">
                  <div className="rc-gutter-copy">
                    <Text>{groupBy === 'projects' ? 'Projects' : 'People'}</Text>
                    <button
                      type="button"
                      className="rc-link-btn"
                      onClick={() => setOpenIds((prev) => (prev.size > 2 ? new Set() : new Set(ALL_OPEN)))}
                    >
                      {openIds.size > 2 ? 'Collapse all' : 'Expand all'}
                    </button>
                  </div>
                  {groupBy === 'projects' ? (
                    <div className="rc-gutter-nums">
                      <span>Budget</span>
                      <span>Sched.</span>
                      <span>Actual</span>
                    </div>
                  ) : null}
                </div>
                <TimelineHeader
                  zoom={zoom}
                  columns={columns}
                  visColumns={visColumns}
                  colW={colW}
                  firstVisible={timeline.firstVisible}
                  weekGuideDay={gantt.weekGuideDay}
                  showWeekends={showWeekends}
                />
              </div>

              {groupBy === 'projects'
                ? projectList.map((project) => (
                    <ProjectBlock
                      key={project.id}
                      project={project}
                      open={openIds.has(project.id)}
                      onToggle={() => toggleOpen(project.id)}
                      assignments={visibleAssignments.filter((a) => a.projectId === project.id)}
                      includeWeekends={showWeekends}
                    />
                  ))
                : personList.map((entry) => (
                    <PersonBlock
                      key={entry.id}
                      personId={entry.id}
                      open={openIds.has(entry.id)}
                      onToggle={() => toggleOpen(entry.id)}
                      assignments={visibleAssignments.filter((a) => a.personId === entry.id)}
                      includeWeekends={showWeekends}
                    />
                  ))}
            </GanttContext.Provider>
            </div>
          </div>
              {groupBy === 'projects' ? (
                <CrewPanel
                  open={crewOpen}
                  onToggle={() => persistCrew(!crewOpen)}
                  previewing={dragIds.size > 0}
                  showAll={showAllCrew}
                  onShowAll={() => setShowAllCrew((v) => !v)}
                  crew={crewRows}
                  visColumns={visColumns}
                  columns={columns}
                  colW={colW}
                  scrollLeft={scrollLeft}
                  draggingPersonId={draggingPersonId}
                  hoursBefore={hoursBefore}
                  issues={issues}
                  finder={finder}
                  onIssueClick={openFinder}
                  onFinderNav={stepFinder}
                  onFinderClose={() => setFinder(null)}
                  shown={showAllCrew ? people.length : crewCounts.shown}
                  total={crewCounts.total}
                />
              ) : null}
        </Flex>
      </Card>

      {zoom === 'weeks' && dragHint ? (
        <div className="rc-drag-tip" style={{ left: dragHint.x, top: dragHint.y }}>
          {dragHint.label}
        </div>
      ) : null}

      {editable && selected.length > 0 ? (
        <div className="rc-bulk-bar">
          <div className="rc-bulk-bar-copy">
            <Text>
              <strong>{selected.length}</strong> bar{selected.length === 1 ? '' : 's'} selected
            </Text>
            <Button appearance="ghost" onClick={() => setSelected([])}>
              Clear Selection
            </Button>
          </div>
          <div className="rc-bulk-bar-actions">
            <Button
              appearance="secondary"
              icon={EditIcon}
              onClick={() => {
                setEditHours('8')
                setEditOpen(true)
              }}
            >
              Edit hours
            </Button>
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
          </div>
        </div>
      ) : null}

      <Dialog open={editOpen} onClose={() => setEditOpen(false)}>
        <Dialog.Header>{isDayZoom(zoom) ? 'Edit day' : 'Edit bar'}</Dialog.Header>
        <Dialog.Content>
          <Flex direction="column" gap="3">
            <Text subdued>
              {isDayZoom(zoom)
                ? 'Hours apply to the selected day. Switch to Week to move or resize the whole bar.'
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

function KeyPopover() {
  return (
    <Popover placement="bottom-end">
      <Popover.Trigger>
        {(props) => (
          <Button size="small" appearance="ghost" {...props}>
            Key
          </Button>
        )}
      </Popover.Trigger>
      <Popover.Content>
        <div className="rc-key">
          <Text>Key</Text>
          <div className="rc-key-row">
            <Icon svg={CalendarCheckIcon} size="small" inherit />
            Confirmed
          </div>
          <div className="rc-key-row">
            <span className="rc-key-swatch" style={{ background: '#fff', border: '1px solid #005132' }} />
            Unassigned · Needs a tech
          </div>
          <div className="rc-key-row">
            <Icon svg={WarningIcon} size="small" inherit />
            Over capacity / conflict
          </div>
          <div className="rc-key-row">
            <span style={{ color: '#d62100', fontWeight: 600 }}>Over budget</span>
          </div>
          <Text size="small" subdued>
            Project colors
          </Text>
          <div className="rc-key-swatches">
            {projects
              .filter((p) => !p.leftover)
              .map((p) => (
                <Tooltip openOnHover key={p.id}>
                  <Tooltip.Trigger>
                    <span className="rc-key-swatch" style={{ background: tintFill(p.color), border: `1px solid ${p.ink}` }} />
                  </Tooltip.Trigger>
                  <Tooltip.Content>{p.name}</Tooltip.Content>
                </Tooltip>
              ))}
          </div>
          <div className="rc-key-row">
            <span
              className="rc-key-swatch"
              style={{
                backgroundImage: 'repeating-linear-gradient(-45deg, rgba(112,112,112,.2) 0 1px, transparent 1px 6px)',
              }}
            />
            Weekend
          </div>
        </div>
      </Popover.Content>
    </Popover>
  )
}

function TimelineHeader({
  zoom,
  columns,
  visColumns,
  colW,
  firstVisible,
  weekGuideDay,
  showWeekends,
}: {
  zoom: Zoom
  columns: Column[]
  visColumns: Column[]
  colW: number
  firstVisible: number
  weekGuideDay?: string
  showWeekends: boolean
}) {
  const minIndex = columns[0]?.index ?? 0
  const todayX = todayMarkerX(zoom, minIndex, colW)
  const showMonthBand = zoom === 'days' || zoom === 'weeks'
  const bands = showMonthBand ? monthBands(columns) : yearBands(columns)
  const pinCol = visColumns.find((col) => col.index >= firstVisible) ?? visColumns[0]
  const pin = pinCol ? periodPinLabel(zoom, { start: pinCol.start, end: pinCol.end }) : ''
  const hatch = zoom !== 'days' && showWeekends

  return (
    <div className="rc-head-timeline" style={{ ['--rc-cols' as string]: String(columns.length), ['--rc-col-w' as string]: `${colW}px` }}>
      <div className="rc-month-band">
        {bands.map((band) => (
          <div
            className="rc-month-cell"
            key={band.id}
            style={{ left: (band.startIndex - minIndex) * colW, width: colW * band.span }}
          />
        ))}
        <div className="rc-period-pin">{pin}</div>
      </div>
      <div className={`rc-cols${zoom === 'days' || zoom === 'weeks' ? ' is-dayweek' : ''}`}>
        {hatch
          ? visColumns.flatMap((col) =>
              weekendSlices(col, minIndex, colW).map((slice) => (
                <div key={`${col.id}-h-${slice.left}`} className="rc-hatch" style={{ left: slice.left, width: slice.width }} />
              )),
            )
          : null}
        <div className="rc-today-line" style={{ left: todayX }} />
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
            className={`rc-col${zoom === 'days' && col.weekend ? ' is-weekend' : ''}`}
            data-col={col.id}
            key={col.id}
            style={{ ['--rc-i' as string]: col.index - minIndex }}
          >
            {zoom === 'days' ? (
              <>
                <Text size="small" subdued className="rc-col-dow">
                  {col.sublabel}
                </Text>
                {col.today ? (
                  <span className="rc-today-pill">{col.label}</span>
                ) : (
                  <Text size="small" className="rc-col-num">
                    {col.label}
                  </Text>
                )}
              </>
            ) : zoom === 'weeks' ? (
              <>
                <Text size="small" subdued className="rc-col-dow">
                  {col.sublabel}
                </Text>
                {col.today ? (
                  <span className="rc-today-pill">{col.label}</span>
                ) : (
                  <Text size="small" className="rc-col-num">
                    {col.label}
                  </Text>
                )}
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
        {zoom === 'months' || zoom === 'quarters' || zoom === 'year' ? (
          <span className="rc-today-chip rc-today-mark" style={{ left: todayX }}>
            Today
          </span>
        ) : null}
      </div>
    </div>
  )
}

function BudgetNums({
  budget,
  scheduled,
  actual,
}: {
  budget?: number
  scheduled?: number
  actual?: number
}) {
  const over = hoursOver(scheduled, budget, actual)
  return (
    <div className="rc-gutter-nums">
      <span className={over ? 'is-over' : undefined}>{displayHours(budget)}</span>
      <span className={over ? 'is-over' : undefined}>{displayHours(scheduled)}</span>
      <span className={over ? 'is-over' : undefined}>{displayHours(actual)}</span>
    </div>
  )
}

function ProjectBlock({
  project,
  open,
  onToggle,
  assignments: rows,
  includeWeekends,
}: {
  project: Project
  open: boolean
  onToggle: () => void
  assignments: Assignment[]
  includeWeekends: boolean
}) {
  const { resolve, selectedKeys } = useGantt()
  const projectPhases = phases.filter((p) => p.projectId === project.id)
  const techs = [...new Set(rows.filter((r) => r.personId !== 'unassigned').map((r) => r.personId))]
  const projectOver = hoursOver(project.scheduledHours, project.budgetHours, project.actualHours)
  const projectSpan = resolve(`proj-${project.id}`, project.start, project.end)
  const barHours = project.scheduledHours ? `${project.scheduledHours}h` : undefined

  return (
    <>
      <div className={`rc-row is-group${projectOver ? ' is-over' : ''}`}>
        <div className="rc-gutter">
          <button className={`rc-chevron ${open ? 'is-open' : ''}`} type="button" onClick={onToggle} aria-label={open ? 'Collapse' : 'Expand'}>
            <Icon svg={ExpandMoreIcon} size="small" inherit />
          </button>
          <div className="rc-gutter-copy">
            <Name title={project.name}>{project.name}</Name>
            {projectOver ? <div className="rc-over-line">Over budget</div> : null}
            {project.leftover && project.hours ? (
              <Text size="small" subdued>
                {project.hours}
              </Text>
            ) : null}
          </div>
          {project.leftover ? null : (
            <BudgetNums budget={project.budgetHours} scheduled={project.scheduledHours} actual={project.actualHours} />
          )}
        </div>
        <Timeline>
          {project.leftover ? null : (
            <SpanBar
              id={`proj-${project.id}`}
              span={projectSpan}
              color={project.color}
              ink={project.ink}
              name={project.name}
              hours={barHours}
              scheduled={project.scheduledHours}
              budget={project.budgetHours}
              actual={project.actualHours}
              selected={selectedKeys.has(`proj-${project.id}`)}
            />
          )}
        </Timeline>
      </div>
      {open
        ? projectPhases.map((phase) => {
            const span = resolve(phase.id, phase.start, phase.end, phase.offDays)
            const over = hoursOver(phase.scheduledHours, phase.budgetHours, phase.actualHours)
            const hours = phase.scheduledHours ? `${phase.scheduledHours}h` : undefined
            return (
              <div className={`rc-row rc-nested${over ? ' is-over' : ''}`} key={phase.id}>
                <div className="rc-gutter">
                  <div className="rc-gutter-copy">
                    <Name>{phase.name}</Name>
                    {over ? <div className="rc-over-line">Over budget</div> : null}
                  </div>
                  <BudgetNums budget={phase.budgetHours} scheduled={phase.scheduledHours} actual={phase.actualHours} />
                </div>
                <Timeline>
                  <SpanBar
                    id={phase.id}
                    span={span}
                    color={project.color}
                    ink={project.ink}
                    name={phase.name}
                    hours={hours}
                    scheduled={phase.scheduledHours}
                    budget={phase.budgetHours}
                    actual={phase.actualHours}
                    selected={selectedKeys.has(phase.id)}
                  />
                </Timeline>
              </div>
            )
          })
        : null}
      {open && !project.leftover ? <UnassignedRow rows={rows.filter((r) => r.kind === 'unassigned')} /> : null}
      {open && !project.leftover
        ? techs.map((personId) => (
            <PersonAssignmentRow
              key={`${project.id}-${personId}`}
              personId={personId}
              projectId={project.id}
              rows={rows.filter((r) => r.personId === personId)}
              includeWeekends={includeWeekends}
            />
          ))
        : null}
      {open && project.leftover
        ? people
            .filter((p) => p.leftover)
            .map((p) => (
              <div className="rc-row rc-nested" key={p.id}>
                <div className="rc-gutter">
                  <Avatar name={p.name} size="small" color={p.color} />
                  <div className="rc-gutter-copy">
                    <Name>{p.name}</Name>
                    <Text size="small" subdued>
                      {p.role}
                    </Text>
                  </div>
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
  includeWeekends,
}: {
  personId: string
  open: boolean
  onToggle: () => void
  assignments: Assignment[]
  includeWeekends: boolean
}) {
  const { viewWindow, resolve, zoom } = useGantt()
  const rangeLabel = formatWindowCaption(viewWindow)
  const person = personId === 'unassigned' ? undefined : personById(personId)
  const resolved = assignments.map((row) => ({ ...row, ...resolve(row.id, row.start, row.end, row.offDays) }))
  const meta =
    personId === 'unassigned'
      ? { text: 'No technician', detail: rows.map((r) => r.label).join(' + '), over: false }
      : personHoursInWindow(personId, resolved, viewWindow, rangeLabel, includeWeekends)
  const grouped = projects
    .filter((p) => !p.leftover && rows.some((r) => r.projectId === p.id))
    .map((p) => ({ project: p, rows: rows.filter((r) => r.projectId === p.id) }))

  return (
    <>
      <div className={`rc-row is-group is-packed${meta.over ? ' is-capacity' : ''}`}>
        <div className="rc-gutter">
          <button className={`rc-chevron ${open ? 'is-open' : ''}`} type="button" onClick={onToggle} aria-label={open ? 'Collapse' : 'Expand'}>
            <Icon svg={ExpandMoreIcon} size="small" inherit />
          </button>
          {person ? (
            <Avatar name={person.name} size="small" color={person.color} />
          ) : (
            <span className="rc-person-unknown">
              <Icon svg={PersonQuestionIcon} size="small" inherit />
            </span>
          )}
          <div className="rc-gutter-copy">
            <Name>{person?.name ?? 'Unassigned'}</Name>
            <HoursMeta text={meta.text} detail={meta.detail} warn={meta.over} />
          </div>
        </div>
        <PackedPersonBars rows={rows} personId={personId} showLabels={!open} />
      </div>
      {open
        ? grouped.map(({ project, rows: projectRows }) =>
            projectRows.map((row) => {
              const span = resolve(row.id, row.start, row.end, row.offDays)
              return (
                <div className="rc-row rc-nested" key={row.id}>
                  <div className="rc-gutter">
                    <div className="rc-gutter-copy">
                      <Name>{project.name}</Name>
                      <Text size="small" subdued className="rc-truncate" title={zoomBarLabel(zoom, row)}>
                        {zoomBarLabel(zoom, row)}
                      </Text>
                    </div>
                  </div>
                  <Timeline>
                    <AssignmentBar row={{ ...row, ...span }} showLabel />
                  </Timeline>
                </div>
              )
            }),
          )
        : null}
    </>
  )
}

function HoursMeta({ text, detail, warn }: { text: string; detail?: string; warn?: boolean }) {
  return (
    <Tooltip openOnHover>
      <Tooltip.Trigger>
        <Text size="small" className={`rc-truncate${warn ? ' rc-hours-warn' : ''}`} subdued={!warn}>
          {text}
        </Text>
      </Tooltip.Trigger>
      <Tooltip.Content>{detail || text}</Tooltip.Content>
    </Tooltip>
  )
}

function UnassignedRow({ rows }: { rows: Assignment[] }) {
  if (rows.length === 0) return null
  return (
    <div className="rc-row rc-nested is-packed">
      <div className="rc-gutter">
        <span className="rc-person-unknown">
          <Icon svg={PersonQuestionIcon} size="small" inherit />
        </span>
        <div className="rc-gutter-copy">
          <Name>Unassigned</Name>
          <Text size="small" subdued>
            No technician · {rows.map((r) => r.label).join(' + ')}
          </Text>
        </div>
      </div>
      <PackedPersonBars rows={rows} personId="unassigned" showLabels />
    </div>
  )
}

function PersonAssignmentRow({
  personId,
  rows,
  includeWeekends,
}: {
  personId: string
  projectId: string
  rows: Assignment[]
  includeWeekends: boolean
}) {
  const { viewWindow, resolve } = useGantt()
  const person = personById(personId)
  const resolvedAll = assignments.map((row) => ({ ...row, ...resolve(row.id, row.start, row.end, row.offDays) }))
  const meta = personHoursInWindow(
    personId,
    resolvedAll,
    viewWindow,
    formatWindowCaption(viewWindow),
    includeWeekends,
  )
  if (!person) return null
  return (
    <div className={`rc-row rc-nested is-packed${meta.over ? ' is-capacity' : ''}`}>
      <div className="rc-gutter">
        <Avatar name={person.name} size="small" color={person.color} />
        <div className="rc-gutter-copy">
          <Name>{person.name}</Name>
          <HoursMeta text={meta.text} detail={meta.detail} warn={meta.over} />
        </div>
      </div>
      <PackedPersonBars rows={rows} personId={personId} showLabels />
    </div>
  )
}

type LayoutItem =
  | { type: 'bar'; row: Assignment & Span; floatLabel?: boolean; colorOnly?: boolean }
  | { type: 'chip'; id: string; rows: (Assignment & Span)[]; start: string; end: string }

function layoutRowItems(rows: (Assignment & Span)[], zoom: Zoom, columns: Column[], colW: number): LayoutItem[] {
  const colorOnlyZoom = zoom === 'quarters' || zoom === 'year'
  if (colorOnlyZoom) {
    return rows.map((row) => {
      const box = barPixelBox(row.start, row.end, columns, colW)
      return { type: 'bar' as const, row, colorOnly: box.widthPx < SHORT_BAR_PX }
    })
  }
  const shortByWeek = new Map<number, (Assignment & Span)[]>()
  const longs: (Assignment & Span)[] = []
  for (const row of rows) {
    const box = barPixelBox(row.start, row.end, columns, colW)
    if (box.visible && box.widthPx < SHORT_BAR_PX) {
      const week = weekIndexOf(row.start)
      const list = shortByWeek.get(week) ?? []
      list.push(row)
      shortByWeek.set(week, list)
    } else {
      longs.push(row)
    }
  }
  const items: LayoutItem[] = longs.map((row) => ({ type: 'bar', row }))
  for (const [, group] of shortByWeek) {
    if (group.length >= 2) {
      const start = zoom === 'weeks' ? mondayOf(group[0]!.start) : group.reduce((min, row) => (row.start < min ? row.start : min), group[0]!.start)
      const end = zoom === 'weeks' ? addDays(start, 6) : group.reduce((max, row) => (row.end > max ? row.end : max), group[0]!.end)
      items.push({
        type: 'chip',
        id: `chip:${group.map((g) => g.id).join('+')}`,
        rows: group,
        start,
        end,
      })
    } else if (group[0]) {
      items.push({ type: 'bar', row: group[0], floatLabel: true })
    }
  }
  return items
}

function PackedPersonBars({
  rows,
  personId,
  showLabels,
}: {
  rows: Assignment[]
  personId: string
  showLabels: boolean
}) {
  const { resolve, zoom, columns, colW, showWeekends } = useGantt()
  const resolved = rows.map((row) => ({ ...row, ...resolve(row.id, row.start, row.end, row.offDays) }))
  const items = layoutRowItems(resolved, zoom, columns, colW)
  const packedSource = items.map((item) =>
    item.type === 'chip' ? { id: item.id, start: item.start, end: item.end } : { id: item.row.id, start: item.row.start, end: item.row.end },
  )
  const { laneById, laneCount } = packLanes(packedSource)
  const allForPerson = assignments
    .filter((row) => row.personId === personId)
    .map((row) => ({ ...row, ...resolve(row.id, row.start, row.end, row.offDays) }))
  const conflictIds = overCapacityAssignmentIds(personId, allForPerson, showWeekends)
  return (
    <Timeline packed lanes={laneCount}>
      {items.map((item) =>
        item.type === 'chip' ? (
          <ShortChip
            key={item.id}
            id={item.id}
            rows={item.rows}
            start={item.start}
            end={item.end}
            lane={laneById.get(item.id) ?? 0}
            conflict={item.rows.some((row) => conflictIds.has(row.id))}
          />
        ) : (
          <AssignmentBar
            key={item.row.id}
            row={item.row}
            showLabel={showLabels}
            lane={laneById.get(item.row.id) ?? 0}
            conflict={conflictIds.has(item.row.id)}
            floatLabel={item.floatLabel}
            colorOnly={item.colorOnly}
          />
        ),
      )}
    </Timeline>
  )
}

function AssignmentBar({
  row,
  showLabel,
  lane = 0,
  conflict,
  floatLabel,
  colorOnly,
}: {
  row: Assignment & Span
  showLabel?: boolean
  lane?: number
  conflict?: boolean
  floatLabel?: boolean
  colorOnly?: boolean
}) {
  const { zoom, selectedKeys } = useGantt()
  const parts = zoomBarParts(zoom, row)
  const project = projectById(row.projectId)
  const address = assignmentAddress(row)
  const clock = clockLabel(row)
  const tip = [parts.name, clock, address, row.label].filter(Boolean)
  return (
    <SpanBar
      id={row.id}
      span={row}
      color={project?.color ?? '#6a7a85'}
      ink={project?.ink ?? '#576671'}
      name={parts.name}
      hours={parts.hours}
      showLabel={showLabel}
      fallbackHours={row.label}
      confirmed={row.confirmed}
      unassigned={row.kind === 'unassigned'}
      selected={selectedKeys.has(row.id)}
      lane={lane}
      conflict={conflict}
      floatLabel={floatLabel}
      colorOnly={colorOnly}
      tipLines={tip}
    />
  )
}

function ShortChip({
  id,
  rows,
  start,
  end,
  lane,
  conflict,
}: {
  id: string
  rows: (Assignment & Span)[]
  start: string
  end: string
  lane: number
  conflict: boolean
}) {
  const { columns, editable, selectedKeys, dragIds, onBarClick, onBarPointerDown, onEditInWeek } = useGantt()
  const project = projectById(rows[0]?.projectId ?? '')
  const color = project?.color ?? '#6a7a85'
  const ink = project?.ink ?? '#576671'
  const hours = rows.reduce((sum, row) => sum + hoursTotal(row), 0)
  const label = `${rows.length} bookings · ${hours}h`
  const style = barStyle(start, end, columns)
  if (!style.visible) return null
  const selectedNow = rows.some((row) => selectedKeys.has(row.id)) && editable
  const dragging = rows.some((row) => dragIds.has(row.id))
  const [open, setOpen] = useState(false)

  const inner = (
    <div
      role="button"
      tabIndex={-1}
      data-span={id}
      className={`rc-bar is-chip${selectedNow ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}${editable ? '' : ' is-readonly'}${conflict ? ' is-conflict' : ''}`}
      style={{
        left: `calc(${style.left} + 3px)`,
        width: `calc(${style.width} - 6px)`,
        background: tintFill(color),
        color: ink,
        '--rc-lane': lane,
        '--rc-bar-color': color,
        '--rc-bar-ink': ink,
      } as CSSProperties}
      onClick={(event) => {
        event.stopPropagation()
        if (!dragging) setOpen(true)
      }}
      onPointerDown={(event) => {
        if (!editable || event.button !== 0) return
        const first = rows[0]
        if (first) onBarPointerDown(event, first.id, first, 'move', rows.map((row) => row.id))
      }}
    >
      <span className="rc-bar-label">
        {conflict ? <Icon svg={WarningIcon} size="small" inherit /> : null}
        <span className="rc-bar-name">{label}</span>
      </span>
    </div>
  )

  return (
    <Popover placement="bottom" open={open || undefined} onClose={() => setOpen(false)} openOnHover>
      <Popover.Trigger>
        {(props) => {
          const { ref, ...rest } = props
          return (
            <div {...rest} ref={ref as never} style={{ display: 'contents' }}>
              {inner}
            </div>
          )
        }}
      </Popover.Trigger>
      <Popover.Content>
        <div className="rc-chip-pop">
          <Text>
            {label}
          </Text>
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className="rc-chip-item"
              onClick={(event) => {
                event.stopPropagation()
                onBarClick(row.id)
                setOpen(false)
                if (!editable) onEditInWeek(row)
              }}
            >
              <span>{assignmentLabel(row)}</span>
              <span>
                {formatDay(row.start)} · {row.label}
              </span>
            </button>
          ))}
          <Text size="small" subdued>
            Click a row to select that booking
          </Text>
        </div>
      </Popover.Content>
    </Popover>
  )
}

function Timeline({ children, packed, lanes = 1 }: { children?: ReactNode; packed?: boolean; lanes?: number }) {
  const { columns, visColumns, colW, zoom, weekGuideDay, showWeekends } = useGantt()
  const minIndex = columns[0]?.index ?? 0
  const todayX = todayMarkerX(zoom, minIndex, colW)
  const hatch = zoom === 'days' || showWeekends
  const style = {
    ['--rc-cols' as string]: String(columns.length),
    ['--rc-col-w' as string]: `${colW}px`,
    ['--rc-lanes' as string]: String(Math.max(1, lanes)),
  } as CSSProperties
  return (
    <div className={`rc-timeline${packed ? ' is-packed' : ''}`} style={style}>
      {visColumns.map((col) => (
        <div
          className={`rc-cell${zoom === 'days' && col.weekend ? ' is-weekend' : ''}`}
          key={col.id}
          style={{ ['--rc-i' as string]: col.index - minIndex }}
        />
      ))}
      {hatch && zoom !== 'days'
        ? visColumns.flatMap((col) =>
            weekendSlices(col, minIndex, colW).map((slice) => (
              <div key={`${col.id}-h-${slice.left}`} className="rc-hatch" style={{ left: slice.left, width: slice.width }} />
            )),
          )
        : null}
      <div className="rc-today-line" style={{ left: todayX }} />
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
  ink,
  name,
  hours,
  scheduled,
  budget,
  actual,
  fallbackHours,
  confirmed,
  unassigned,
  selected,
  lane = 0,
  conflict,
  showLabel = true,
  floatLabel,
  colorOnly,
  tipLines,
}: {
  id: string
  span: Span
  color: string
  ink: string
  name?: string
  hours?: string
  scheduled?: number
  budget?: number
  actual?: number
  fallbackHours?: string
  confirmed?: boolean
  unassigned?: boolean
  selected?: boolean
  lane?: number
  conflict?: boolean
  showLabel?: boolean
  floatLabel?: boolean
  colorOnly?: boolean
  tipLines?: string[]
}) {
  const { zoom, columns, dragIds, editable, onBarClick, onBarPointerDown } = useGantt()
  const segs = activeSegments(span.start, span.end, span.offDays)
  const wholeBar = zoom === 'weeks'
  const hoursLine = hoursTooltipLine(scheduled, budget, actual, fallbackHours ?? hours)
  return (
    <>
      {segs.map((seg) => (
        <BarSegment
          key={`${id}-${seg.start}`}
          id={id}
          span={span}
          seg={seg}
          color={color}
          ink={ink}
          name={name}
          hours={hours}
          hoursLine={hoursLine}
          confirmed={confirmed}
          unassigned={unassigned}
          selected={selected}
          lane={lane}
          conflict={conflict}
          showLabel={showLabel}
          columns={columns}
          zoom={zoom}
          wholeBar={wholeBar}
          editable={editable}
          dragging={dragIds.has(id)}
          onBarClick={onBarClick}
          onBarPointerDown={onBarPointerDown}
          floatLabel={floatLabel}
          colorOnly={colorOnly}
          tipLines={tipLines}
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
  ink,
  name,
  hours,
  hoursLine,
  confirmed,
  unassigned,
  selected,
  lane,
  conflict,
  showLabel,
  columns,
  zoom,
  wholeBar,
  editable,
  dragging,
  onBarClick,
  onBarPointerDown,
  floatLabel,
  colorOnly,
  tipLines,
}: {
  id: string
  span: Span
  seg: { start: string; end: string }
  color: string
  ink: string
  name?: string
  hours?: string
  hoursLine?: string
  confirmed?: boolean
  unassigned?: boolean
  selected?: boolean
  lane: number
  conflict?: boolean
  showLabel: boolean
  columns: Column[]
  zoom: Zoom
  wholeBar: boolean
  editable: boolean
  dragging: boolean
  onBarClick: (id: string, mods?: ClickMods) => void
  onBarPointerDown: (event: ReactPointerEvent, id: string, span: Span, mode: DragMode, extraIds?: string[]) => void
  floatLabel?: boolean
  colorOnly?: boolean
  tipLines?: string[]
}) {
  const { clipLeft, viewPx, colW, onEditInWeek } = useGantt()
  const [popOpen, setPopOpen] = useState(false)
  const style = barStyle(seg.start, seg.end, columns)
  if (!style.visible) return null
  const sliver = segmentIsSliver(seg.start, seg.end, zoom)
  const timelineW = columns.length * colW
  const leftPx = (Number.parseFloat(style.left) / 100) * timelineW + 3
  const widthPx = Math.max(4, (Number.parseFloat(style.width) / 100) * timelineW - 6)
  const rightPx = leftPx + widthPx
  const viewLeft = clipLeft
  const clipped = leftPx < viewLeft - 1 && rightPx > viewLeft
  const shift = clipped ? Math.min(Math.max(0, viewLeft - leftPx), Math.max(0, widthPx - 12)) : 0
  const vis = Math.min(rightPx, viewLeft + viewPx) - Math.max(leftPx, viewLeft)
  const showHours = Boolean(showLabel && hours) && vis > 96 && !floatLabel && !colorOnly
  const dates = formatRange(seg.start, seg.end)
  const tooltip = [...(tipLines ?? [name, hoursLine]), dates].filter(Boolean).join('\n')
  const selectedNow = Boolean(selected && (editable || selected))
  const hideInner = Boolean(colorOnly || (floatLabel && !unassigned))
  const overflowRight = leftPx + widthPx + 96 > viewLeft + viewPx
  const fill = unassigned ? '#fff' : tintFill(color)

  const barClass = `rc-bar${unassigned ? ' is-unassigned' : ''}${selectedNow ? ' is-selected' : ''}${sliver || colorOnly ? ' is-sliver' : ''}${colorOnly ? ' is-color-only' : ''}${dragging ? ' is-dragging' : ''}${editable ? '' : ' is-readonly'}${conflict ? ' is-conflict' : ''}${floatLabel ? ' is-short-float' : ''}`
  const barStyleVars = {
    left: `calc(${style.left} + 3px)`,
    width: `calc(${style.width} - 6px)`,
    background: fill,
    color: ink,
    '--rc-lane': lane,
    '--rc-bar-color': color,
    '--rc-bar-ink': ink,
    '--rc-label-shift': `${shift}px`,
  } as CSSProperties

  const inner = (
    <>
      {!hideInner && showLabel && (name || hours) && !sliver ? (
        <span className="rc-bar-label">
          {unassigned ? <Icon svg={PersonQuestionIcon} size="small" inherit /> : null}
          {confirmed ? <Icon svg={CalendarCheckIcon} size="small" inherit /> : null}
          {conflict ? <Icon svg={WarningIcon} size="small" inherit /> : null}
          {name ? <span className="rc-bar-name">{name}</span> : null}
          {showHours && hours ? <span className="rc-bar-hours">{hours}</span> : null}
        </span>
      ) : (
        <>
          {unassigned && !colorOnly ? <Icon svg={PersonQuestionIcon} size="small" inherit /> : null}
          {confirmed && !colorOnly ? <Icon svg={CalendarCheckIcon} size="small" inherit /> : null}
        </>
      )}
      {floatLabel && showLabel ? (
        <span className={`rc-float-label${overflowRight ? ' is-left' : ''}`}>
          {name}
          {hours ? ` ${hours}` : ''}
        </span>
      ) : null}
      {editable && wholeBar && !colorOnly && !floatLabel ? (
        <span
          className="rc-bar-handle"
          onPointerDown={(event) => {
            event.stopPropagation()
            onBarPointerDown(event, id, span, 'resize')
          }}
        />
      ) : null}
    </>
  )

  if (!editable) {
    return (
      <Popover
        placement="bottom"
        onOpenAnimationStart={() => setPopOpen(true)}
        onClose={() => setPopOpen(false)}
      >
        <Popover.Trigger>
          {(props) => {
            const { ref, onClick, ...rest } = props
            return (
            <Tooltip openOnHover delay={400} placement="top" open={popOpen ? false : undefined}>
              <Tooltip.Trigger>
                <div
                  {...rest}
                  ref={ref as never}
                  role="button"
                  tabIndex={-1}
                  data-span={id}
                  className={barClass}
                  style={barStyleVars}
                  onClick={(event) => {
                    event.stopPropagation()
                    onClick(event)
                  }}
                >
                  {inner}
                </div>
              </Tooltip.Trigger>
              <Tooltip.Content>{tooltip}</Tooltip.Content>
            </Tooltip>
            )
          }}
        </Popover.Trigger>
        <Popover.Content>
          <div className="rc-bar-pop">
            {name ? <Text>{name}</Text> : null}
            {tipLines?.slice(1).map((line) => (
              <Text size="small" key={line}>
                {line}
              </Text>
            ))}
            {hoursLine && !tipLines ? <Text size="small">{hoursLine}</Text> : null}
            <Text size="small" subdued>
              {dates}
            </Text>
            <Button size="small" onClick={() => onEditInWeek(span)}>
              Edit in Week view
            </Button>
          </div>
        </Popover.Content>
      </Popover>
    )
  }

  return (
    <Tooltip openOnHover delay={400} placement="top">
      <Tooltip.Trigger>
        <div
          role="button"
          tabIndex={-1}
          data-span={id}
          className={barClass}
          style={barStyleVars}
          onClick={(event) => {
            event.stopPropagation()
            if (!dragging) onBarClick(id, event)
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
          {inner}
        </div>
      </Tooltip.Trigger>
      <Tooltip.Content>{tooltip}</Tooltip.Content>
    </Tooltip>
  )
}
