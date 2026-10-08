import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
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
  phaseById,
  phases,
  projectById,
  projects,
  weeklyHours,
  zoomBarLabel,
  type Assignment,
  type GroupBy,
  type Project,
  type Zoom,
} from './data'
import { barStyle, bulkAllowed, columnForDate, columnWidth, DEMO_TODAY, getColumns, monthBands, packLanes, RANGE_START, utc, type TimeWindow } from './timeline'
import { CheckIcon, DeleteIcon, DuplicateIcon, EditIcon, ExpandMoreIcon, RangeIcon } from './icons'
import './calendar.css'

type Selection = string

const DEFAULT_OPEN = new Set(['summit', 'apex', 'david', 'unassigned'])

function personMeta(personId: string) {
  const hours = weeklyHours(personId)
  return { text: `${hours.booked} / ${hours.cap}h`, detail: hours.detail, danger: hours.over }
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

function fallbackWindow(columns: ReturnType<typeof getColumns>, zoom: Zoom): TimeWindow {
  if ((zoom === 'days' || zoom === 'weeks') && columns.length > 0) {
    const today = utc(DEMO_TODAY)
    return { start: today - 14 * 86400000, end: today + 21 * 86400000 }
  }
  return { start: columns[0]?.start ?? 0, end: columns[columns.length - 1]?.end ?? 0 }
}

function useVisibleWindow(
  scrollRef: RefObject<HTMLDivElement | null>,
  columns: ReturnType<typeof getColumns>,
  zoom: Zoom,
  focusDate: string,
): TimeWindow {
  const [range, setRange] = useState<TimeWindow>(() => fallbackWindow(columns, zoom))

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || columns.length === 0) {
      setRange(fallbackWindow(columns, zoom))
      return
    }
    const colW = columnWidth(zoom)
    const gutter = 280

    const measure = () => {
      const sl = el.scrollLeft
      const visible = Math.max(colW, el.clientWidth - gutter)
      const i0 = Math.max(0, Math.floor(sl / colW) - 1)
      const i1 = Math.min(columns.length - 1, Math.ceil((sl + visible) / colW) + 1)
      const next = { start: columns[i0]!.start, end: columns[i1]!.end }
      setRange((prev) => (prev.start === next.start && prev.end === next.end ? prev : next))
    }

    measure()
    const frame = requestAnimationFrame(measure)
    el.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [columns, zoom, scrollRef, focusDate])

  return range
}

export function ResourceCalendar() {
  const [groupBy, setGroupBy] = useState<GroupBy>('projects')
  const [zoom, setZoom] = useState<Zoom>('months')
  const [focusDate, setFocusDate] = useState(DEMO_TODAY)
  const [query, setQuery] = useState('')
  const [openIds, setOpenIds] = useState<Set<string>>(DEFAULT_OPEN)
  const [selected, setSelected] = useState<Selection[]>([])
  const [rangeMode, setRangeMode] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editHours, setEditHours] = useState('8')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [activeProjects, setActiveProjects] = useState<string[]>(['summit', 'apex', 'monolith'])
  const scrollRef = useRef<HTMLDivElement>(null)

  const columns = useMemo(() => getColumns(zoom), [zoom])
  const viewWindow = useVisibleWindow(scrollRef, columns, zoom, focusDate)
  const canBulk = bulkAllowed(zoom)
  const q = query.trim().toLowerCase()

  const visibleAssignments = assignments.filter((a) => !hidden.has(a.id))
  const selectedKeys = new Set(selected)
  const showDateJump = zoom === 'days' || zoom === 'weeks'

  function scrollToDate(iso: string) {
    const col = columnForDate(columns, iso)
    if (!col || !scrollRef.current) return
    const node = scrollRef.current.querySelector(`[data-col="${col.id}"]`)
    node?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }

  useLayoutEffect(() => {
    if (!showDateJump) return
    scrollToDate(focusDate)
  }, [zoom, focusDate, columns, showDateJump])

  useEffect(() => {
    if (selected.length === 0) return
    function onClickAway(event: Event) {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.rc-bar, .rc-bulk-bar, dialog, [role="dialog"]')) return
      setSelected([])
      setRangeMode(false)
    }
    document.addEventListener('click', onClickAway, true)
    return () => document.removeEventListener('click', onClickAway, true)
  }, [selected.length])

  function toggleOpen(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function onBarClick(id: string) {
    if (!canBulk) {
      toast.warning({
        title: 'Bulk select is off at this zoom',
        message: 'Jade’s lock: bulk edit through monthly. Zoom to Days, Weeks, or Months to select.',
      })
      return
    }
    setSelected((prev) => {
      if (rangeMode) return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      if (prev.length === 1 && prev[0] === id) return []
      return [id]
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
        (a) =>
          a.personId === p.id &&
          (projectById(a.projectId)?.name.toLowerCase().includes(q) ?? false),
      ),
  )

  return (
    <Flex direction="column" gap="3" className="rc-root">
      <Card padding="0" className="rc-card">
        <Flex direction="column">
        <Flex direction="column" gap="2" className="rc-toolbar">
          <Flex alignItems="center" gap="4" wrap="wrap">
            <Flex alignItems="center" gap="2">
              <Text size="small" subdued>
                Group by
              </Text>
              <SegmentedControl size="small" selected={groupBy} onChange={(value) => setGroupBy(value as GroupBy)}>
                <SegmentedControl.Segment value="people">People</SegmentedControl.Segment>
                <SegmentedControl.Segment value="projects">Projects</SegmentedControl.Segment>
              </SegmentedControl>
            </Flex>
            <Flex alignItems="center" gap="2">
              <Text size="small" subdued>
                Zoom
              </Text>
              <SegmentedControl
                size="small"
                selected={zoom}
                onChange={(value) => {
                  setZoom(value as Zoom)
                  setSelected([])
                }}
              >
                <SegmentedControl.Segment value="days">Days</SegmentedControl.Segment>
                <SegmentedControl.Segment value="weeks">Weeks</SegmentedControl.Segment>
                <SegmentedControl.Segment value="months">Months</SegmentedControl.Segment>
                <SegmentedControl.Segment value="quarters">Quarters</SegmentedControl.Segment>
                <SegmentedControl.Segment value="year">Year</SegmentedControl.Segment>
              </SegmentedControl>
            </Flex>
            {showDateJump ? (
              <Flex alignItems="center" gap="2">
                <Button
                  size="small"
                  onClick={() => {
                    setFocusDate(DEMO_TODAY)
                    scrollToDate(DEMO_TODAY)
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
                    min={RANGE_START}
                    max="2026-06-26"
                    value={focusDate}
                    onChange={(event) => {
                      const next = event.target.value || DEMO_TODAY
                      setFocusDate(next)
                    }}
                  />
                </label>
              </Flex>
            ) : null}
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
          </Flex>
          <Flex alignItems="center" gap="2" wrap="wrap">
            <Text size="small" subdued>
              In this range
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
            {!canBulk ? (
              <Chip size="small" label="Bulk select off" color="#d62100" />
            ) : (
              <Chip size="small" label={rangeMode ? 'Click the end of the range' : 'Click a bar to select'} />
            )}
          </Flex>
        </Flex>

        <div
          className="rc-scroll"
          ref={scrollRef}
          style={{ ['--rc-cols' as string]: String(columns.length), ['--rc-col-w' as string]: `${columnWidth(zoom)}px` }}
          onClick={(event) => {
            if (!(event.target instanceof Element)) return
            if (event.target.closest('.rc-bar, .rc-overlay')) return
            setSelected([])
          }}
        >
          <div className="rc-grid-head">
            <div className="rc-gutter-head">
              <Text size="small">{groupBy === 'projects' ? 'Project · Hours' : 'Person · Hours'}</Text>
            </div>
            <div
              className="rc-head-timeline"
              style={{ ['--rc-cols' as string]: String(columns.length), ['--rc-col-w' as string]: `${columnWidth(zoom)}px` }}
            >
              {zoom === 'days' || zoom === 'weeks' ? (
                <div className="rc-month-band">
                  {monthBands(columns).map((band) => (
                    <div
                      className="rc-month-cell"
                      key={band.id}
                      style={{ width: `calc(var(--rc-col-w) * ${band.span})` }}
                    >
                      <Text size="small" subdued>
                        {band.label}
                      </Text>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="rc-cols">
                {columns.map((col) => (
                  <div
                    className={`rc-col${col.today ? ' is-today' : ''}${col.weekend ? ' is-weekend' : ''}`}
                    data-col={col.id}
                    key={col.id}
                  >
                    <Text size="small">{col.label}</Text>
                    {zoom === 'days' ? null : (
                      <Text size="small" subdued>
                        {col.sublabel}
                      </Text>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {groupBy === 'projects'
            ? projectList.map((project) => (
                <ProjectBlock
                  key={project.id}
                  project={project}
                  open={openIds.has(project.id)}
                  onToggle={() => toggleOpen(project.id)}
                  zoom={zoom}
                  columns={columns}
                  viewWindow={viewWindow}
                  assignments={visibleAssignments.filter((a) => a.projectId === project.id)}
                  canBulk={canBulk}
                  selectedKeys={selectedKeys}
                  onBarClick={onBarClick}
                />
              ))
            : personList.map((entry) => (
                <PersonBlock
                  key={entry.id}
                  personId={entry.id}
                  open={openIds.has(entry.id)}
                  onToggle={() => toggleOpen(entry.id)}
                  zoom={zoom}
                  columns={columns}
                  viewWindow={viewWindow}
                  assignments={visibleAssignments.filter((a) => a.personId === entry.id)}
                  canBulk={canBulk}
                  selectedKeys={selectedKeys}
                  onBarClick={onBarClick}
                />
              ))}
        </div>
        </Flex>
      </Card>

      {selected.length > 0 ? (
        <div className="rc-bulk-bar">
          <div className="rc-bulk-bar-copy">
            <Text>
              <strong>{selected.length}</strong> item{selected.length === 1 ? '' : 's'} selected
            </Text>
            <Button appearance="ghost" onClick={() => { setSelected([]); setRangeMode(false) }}>
              Clear Selection
            </Button>
          </div>
          <div className="rc-bulk-bar-actions">
            <Button
              appearance="secondary"
              icon={RangeIcon}
              onClick={() => {
                setRangeMode(true)
                toast.info({ title: 'Select Range', message: 'Click another bar to add it to the selection.' })
              }}
            >
              Select Range
            </Button>
            <Button appearance="secondary" icon={DuplicateIcon} onClick={() => toast.info({ title: 'Duplicate', message: 'Duplicate is mocked in this prototype.' })}>
              Duplicate
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
                setRangeMode(false)
                toast.danger({ title: 'Deleted', message: 'Selected assignments were removed from this prototype range.' })
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
        </div>
      ) : null}

      <Dialog open={editOpen} onClose={() => setEditOpen(false)}>
        <Dialog.Header>Bulk edit</Dialog.Header>
        <Dialog.Content>
          <Flex direction="column" gap="3">
            <Text subdued>Edits hours on the selected bar{selected.length === 1 ? '' : 's'} only.</Text>
            <TextField name="hours" label="Hours per day" value={editHours} onChange={(e) => setEditHours(e.target.value)} />
          </Flex>
        </Dialog.Content>
        <Dialog.Footer>
          <Dialog.CancelButton>Cancel</Dialog.CancelButton>
          <Button
            appearance="primary"
            onClick={() => {
              setEditOpen(false)
              setSelected([])
              toast.success({ title: 'Updated', message: `Set ${editHours} hours on ${selected.length} item${selected.length === 1 ? '' : 's'}.` })
            }}
          >
            Save
          </Button>
        </Dialog.Footer>
      </Dialog>
    </Flex>
  )
}

function isBarSelected(id: string, selectedKeys: Set<string>) {
  return selectedKeys.has(id)
}

function durationBarLabel(project: Project) {
  return hoursCaption(project.scheduledHours, project.budgetHours)
}

function ProjectBlock({
  project,
  open,
  onToggle,
  zoom,
  columns,
  viewWindow,
  assignments: rows,
  canBulk,
  selectedKeys,
  onBarClick,
}: {
  project: Project
  open: boolean
  onToggle: () => void
  zoom: Zoom
  columns: ReturnType<typeof getColumns>
  viewWindow: TimeWindow
  assignments: Assignment[]
  canBulk: boolean
  selectedKeys: Set<string>
  onBarClick: (id: string) => void
}) {
  const projectPhases = phases.filter((p) => p.projectId === project.id)
  const techs = [...new Set(rows.filter((r) => r.personId !== 'unassigned').map((r) => r.personId))]
  const sparkline = packLanes(projectPhases, viewWindow)
  const projectOver = hoursOver(project.scheduledHours, project.budgetHours, project.actualHours)
  const phaseHint = projectPhases
    .map((phase) => {
      const cap = hoursCaption(phase.scheduledHours, phase.budgetHours)
      return cap ? `${phase.name} · ${cap}` : phase.name
    })
    .join(' · ')
  const projectName = project.name.replace(' Tentative', '')

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
        <Timeline columns={columns} packed={projectPhases.length > 0 ? sparkline : undefined} thin={!open}>
          {project.leftover ? null : projectPhases.length > 0 ? (
            projectPhases.map((phase) => {
              const cap = hoursCaption(phase.scheduledHours, phase.budgetHours)
              const over = hoursOver(phase.scheduledHours, phase.budgetHours, phase.actualHours)
              return (
                <Bar
                  key={phase.id}
                  start={phase.start}
                  end={phase.end}
                  zoom={zoom}
                  columns={columns}
                  color={phase.color}
                  label={open ? (cap ? `${phase.name} · ${cap}` : phase.name) : undefined}
                  thin={!open}
                  canBulk={canBulk}
                  selected={isBarSelected(phase.id, selectedKeys)}
                  lane={sparkline.laneById.get(phase.id) ?? 0}
                  onClick={() => onBarClick(phase.id)}
                  hint={`${phase.name} · ${phase.scheduledHours} scheduled / ${phase.budgetHours} budget · ${phase.actualHours} actual${over ? ' · over budget' : ''}`}
                />
              )
            })
          ) : (
            <Bar
              start={project.start}
              end={project.end}
              zoom={zoom}
              columns={columns}
              color={project.color}
              label={open ? durationBarLabel(project) : undefined}
              thin={!open}
              canBulk={canBulk}
              selected={isBarSelected(`proj-${project.id}`, selectedKeys)}
              onClick={() => onBarClick(`proj-${project.id}`)}
            />
          )}
        </Timeline>
      </div>
      {open && !project.leftover ? (
        <UnassignedRow
          projectId={project.id}
          zoom={zoom}
          viewWindow={viewWindow}
          rows={rows.filter((r) => r.kind === 'unassigned')}
          columns={columns}
          canBulk={canBulk}
          selectedKeys={selectedKeys}
          onBarClick={onBarClick}
        />
      ) : null}
      {open && !project.leftover
        ? techs.map((personId) => (
            <PersonAssignmentRow
              key={`${project.id}-${personId}`}
              personId={personId}
              projectId={project.id}
              zoom={zoom}
              viewWindow={viewWindow}
              rows={rows.filter((r) => r.personId === personId)}
              columns={columns}
              canBulk={canBulk}
              selectedKeys={selectedKeys}
              onBarClick={onBarClick}
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
                  <Flex direction="column">
                    <Text>{p.name}</Text>
                    <Text size="small" subdued>
                      {p.role}
                    </Text>
                  </Flex>
                </div>
                <Timeline columns={columns} />
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
  zoom,
  columns,
  viewWindow,
  assignments: rows,
  canBulk,
  selectedKeys,
  onBarClick,
}: {
  personId: string
  open: boolean
  onToggle: () => void
  zoom: Zoom
  columns: ReturnType<typeof getColumns>
  viewWindow: TimeWindow
  assignments: Assignment[]
  canBulk: boolean
  selectedKeys: Set<string>
  onBarClick: (id: string) => void
}) {
  const person = personId === 'unassigned' ? undefined : personById(personId)
  const meta = personId === 'unassigned' ? { text: 'No technician · 40h on Summit', danger: false } : personMeta(personId)
  const grouped = projects
    .filter((p) => !p.leftover && rows.some((r) => r.projectId === p.id))
    .map((p) => ({ project: p, rows: rows.filter((r) => r.projectId === p.id) }))
  const packed = packLanes(rows, viewWindow)

  return (
    <>
      <div className={`rc-row is-group ${meta.danger ? 'is-over' : ''}${packed.laneCount > 1 ? ' is-stacked' : ''}`}>
        <div className="rc-gutter">
          <button className={`rc-chevron ${open ? 'is-open' : ''}`} type="button" onClick={onToggle} aria-label={open ? 'Collapse' : 'Expand'}>
            <Icon svg={ExpandMoreIcon} size="small" inherit />
          </button>
          {person ? <Avatar name={person.name} size="small" color={person.color} /> : <Avatar name="Unassigned" size="small" />}
          <Flex direction="column" className="rc-gutter-copy">
            <Text>{person?.name ?? 'Unassigned'}</Text>
            {meta.danger && 'detail' in meta && meta.detail ? (
              <Tooltip openOnHover>
                <Tooltip.Trigger>
                  <Text size="small" className="a2-c-danger">
                    {meta.text}
                  </Text>
                </Tooltip.Trigger>
                <Tooltip.Content>{meta.detail}</Tooltip.Content>
              </Tooltip>
            ) : (
              <Text size="small" className={meta.danger ? 'a2-c-danger' : undefined} subdued={!meta.danger}>
                {meta.text}
              </Text>
            )}
          </Flex>
        </div>
        <Timeline columns={columns} packed={packed} thin={open}>
          {rows.map((row) => (
            <Bar
              key={row.id}
              start={row.start}
              end={row.end}
              zoom={zoom}
              columns={columns}
              color={assignmentColor(row, projectById(row.projectId)?.color ?? '#8b8b8b')}
              label={open ? undefined : zoomBarLabel(zoom, row)}
              thin={open}
              confirmed={row.confirmed}
              unassigned={row.kind === 'unassigned'}
              canBulk={canBulk}
              selected={isBarSelected(row.id, selectedKeys)}
              lane={packed.laneById.get(row.id) ?? 0}
              onClick={() => onBarClick(row.id)}
            />
          ))}
        </Timeline>
      </div>
      {open
        ? grouped.map(({ project, rows: projectRows }) => {
            const nested = packLanes(projectRows, viewWindow)
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
              <Timeline columns={columns} packed={nested}>
                {projectRows.map((row) => (
                  <Bar
                    key={row.id}
                    start={row.start}
                    end={row.end}
                    zoom={zoom}
                    columns={columns}
                    color={assignmentColor(row, project.color)}
                    label={zoomBarLabel(zoom, row)}
                    confirmed={row.confirmed}
                    unassigned={row.kind === 'unassigned'}
                    canBulk={canBulk}
                    selected={isBarSelected(row.id, selectedKeys)}
                    lane={nested.laneById.get(row.id) ?? 0}
                    onClick={() => onBarClick(row.id)}
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

function assignmentColor(row: Assignment, fallback: string) {
  return phaseById(row.phaseId)?.color ?? fallback
}

function UnassignedRow({
  projectId,
  zoom,
  viewWindow,
  rows,
  columns,
  canBulk,
  selectedKeys,
  onBarClick,
}: {
  projectId: string
  zoom: Zoom
  viewWindow: TimeWindow
  rows: Assignment[]
  columns: ReturnType<typeof getColumns>
  canBulk: boolean
  selectedKeys: Set<string>
  onBarClick: (id: string) => void
}) {
  const packed = packLanes(rows, viewWindow)
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
      <Timeline columns={columns} packed={packed}>
        {rows.map((row) => (
          <Bar
            key={row.id}
            start={row.start}
            end={row.end}
            zoom={zoom}
            columns={columns}
            color={assignmentColor(row, '#e8e8e8')}
            label={zoomBarLabel(zoom, row)}
            unassigned
            canBulk={canBulk}
            selected={isBarSelected(row.id, selectedKeys)}
            lane={packed.laneById.get(row.id) ?? 0}
            onClick={() => onBarClick(row.id)}
          />
        ))}
      </Timeline>
    </div>
  )
}

function PersonAssignmentRow({
  personId,
  projectId,
  zoom,
  viewWindow,
  rows,
  columns,
  canBulk,
  selectedKeys,
  onBarClick,
}: {
  personId: string
  projectId: string
  zoom: Zoom
  viewWindow: TimeWindow
  rows: Assignment[]
  columns: ReturnType<typeof getColumns>
  canBulk: boolean
  selectedKeys: Set<string>
  onBarClick: (id: string) => void
}) {
  const person = personById(personId)
  const meta = personMeta(personId)
  const packed = packLanes(rows, viewWindow)
  if (!person) return null
  return (
    <div className={`rc-row rc-nested ${meta.danger ? 'is-over' : ''}${packed.laneCount > 1 ? ' is-stacked' : ''}`}>
      <div className="rc-gutter">
        <Avatar name={person.name} size="small" color={person.color} />
        <Flex direction="column" className="rc-gutter-copy">
          <Text>{person.name}</Text>
          {meta.danger ? (
            <Tooltip openOnHover>
              <Tooltip.Trigger>
                <Text size="small" className="a2-c-danger">
                  {meta.text}
                </Text>
              </Tooltip.Trigger>
              <Tooltip.Content>{meta.detail}</Tooltip.Content>
            </Tooltip>
          ) : (
            <Text size="small" subdued>
              {meta.text}
            </Text>
          )}
        </Flex>
      </div>
      <Timeline columns={columns} packed={packed}>
        {rows.map((row) => (
          <Bar
            key={row.id}
            start={row.start}
            end={row.end}
            zoom={zoom}
            columns={columns}
            color={assignmentColor(row, projectById(projectId)?.color ?? person.color)}
            label={zoomBarLabel(zoom, row)}
            confirmed={row.confirmed}
            canBulk={canBulk}
            selected={isBarSelected(row.id, selectedKeys)}
            lane={packed.laneById.get(row.id) ?? 0}
            onClick={() => onBarClick(row.id)}
          />
        ))}
      </Timeline>
    </div>
  )
}

function Timeline({
  columns,
  packed,
  thin,
  children,
}: {
  columns: ReturnType<typeof getColumns>
  packed?: { laneCount: number }
  thin?: boolean
  children?: ReactNode
}) {
  const style = {
    ['--rc-lanes' as string]: String(packed?.laneCount ?? 1),
    ['--rc-cols' as string]: String(columns.length),
  } as CSSProperties
  return (
    <div className={`rc-timeline${thin ? ' is-thin' : ''}${(packed?.laneCount ?? 1) <= 1 ? ' is-single' : ''}`} style={style}>
      {columns.map((col) => (
        <div className={`rc-cell${col.weekend ? ' is-weekend' : ''}${col.today ? ' is-today' : ''}`} key={col.id} />
      ))}
      {children}
    </div>
  )
}

function Bar({
  start,
  end,
  columns,
  zoom,
  color,
  label,
  thin,
  confirmed,
  unassigned,
  canBulk,
  selected,
  lane = 0,
  hint,
  onClick,
}: {
  start: string
  end: string
  columns: ReturnType<typeof getColumns>
  zoom: Zoom
  color: string
  label?: string
  thin?: boolean
  confirmed?: boolean
  unassigned?: boolean
  canBulk: boolean
  selected?: boolean
  lane?: number
  hint?: string
  onClick: () => void
}) {
  const style = barStyle(start, end, columns)
  if (!style.visible) return null
  const title =
    hint ?? `${label ?? ''} ${new Date(utc(start)).toUTCString().slice(5, 11)} – ${new Date(utc(end)).toUTCString().slice(5, 11)}`.trim()
  return (
    <button
      type="button"
      className={`rc-bar${thin ? ' is-thin' : ''}${unassigned ? ' is-unassigned' : ''}${selected ? ' is-selected' : ''}${canBulk ? '' : ' is-disabled'}`}
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
      title={title}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      {(confirmed || selected) && !thin ? <Icon svg={CheckIcon} size="small" inherit /> : null}
      {!thin && label ? <span className="rc-bar-label">{label}</span> : null}
    </button>
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
