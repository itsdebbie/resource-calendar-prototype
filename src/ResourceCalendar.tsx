import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
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
  type Assignment,
  type GroupBy,
  type Phase,
  type Project,
  type Zoom,
} from './data'
import { barStyle, bulkAllowed, getColumns, overlappingColumns, packLanes, rangeOf, utc } from './timeline'
import { CheckIcon, CloseIcon, ExpandMoreIcon } from './icons'
import './calendar.css'

type Selection = { projectId: string; columnId: string }

const DEFAULT_OPEN = new Set(['summit', 'apex', 'david', 'unassigned'])

function selectionKey(s: Selection) {
  return `${s.projectId}:${s.columnId}`
}

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
      <div className={`rc-meter${over ? ' is-over' : ''}`} aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </div>
      <Text size="small" className={over ? 'a2-c-danger' : undefined} subdued={!over}>
        {hoursCaption(scheduled, budget)}
      </Text>
      <Text size="small" subdued>
        {actual ?? 0}h actual
      </Text>
    </div>
  )
}

export function ResourceCalendar() {
  const [groupBy, setGroupBy] = useState<GroupBy>('projects')
  const [zoom, setZoom] = useState<Zoom>('months')
  const [query, setQuery] = useState('')
  const [openIds, setOpenIds] = useState<Set<string>>(DEFAULT_OPEN)
  const [selected, setSelected] = useState<Selection[]>([])
  const [editOpen, setEditOpen] = useState(false)
  const [editHours, setEditHours] = useState('8')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [activeProjects, setActiveProjects] = useState<string[]>(['summit', 'apex', 'monolith'])

  const columns = useMemo(() => getColumns(zoom), [zoom])
  const canBulk = bulkAllowed(zoom)
  const q = query.trim().toLowerCase()

  const visibleAssignments = assignments.filter((a) => !hidden.has(a.id))
  const selectedKeys = new Set(selected.map(selectionKey))

  useEffect(() => {
    if (selected.length === 0) return
    function onClickAway(event: Event) {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.rc-bar, .rc-overlay, .rc-bulk-bar, dialog, [role="dialog"]')) return
      setSelected([])
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

  function onBarClick(projectId: string, item: { start: string; end: string }) {
    if (!canBulk) {
      toast.warning({
        title: 'Bulk select is off at this zoom',
        message: 'Jade’s lock: bulk edit through monthly. Zoom to Days, Weeks, or Months to select chunks.',
      })
      return
    }
    const cols = overlappingColumns(item.start, item.end, columns)
    setSelected((prev) => {
      const keys = new Set(prev.map(selectionKey))
      const incoming = cols.map((col) => ({ projectId, columnId: col.id }))
      const allOn = incoming.every((s) => keys.has(selectionKey(s)))
      if (allOn) {
        const drop = new Set(incoming.map(selectionKey))
        return prev.filter((s) => !drop.has(selectionKey(s)))
      }
      const merged = [...prev]
      for (const s of incoming) {
        if (!keys.has(selectionKey(s))) merged.push(s)
      }
      return merged
    })
  }

  function overlaysFor(projectId: string) {
    const { start, end } = rangeOf(columns)
    const span = end - start
    return selected
      .filter((s) => s.projectId === projectId)
      .map((s) => {
        const col = columns.find((c) => c.id === s.columnId)
        if (!col || span <= 0) return null
        return {
          key: selectionKey(s),
          left: `${((col.start - start) / span) * 100}%`,
          width: `${((col.end - col.start) / span) * 100}%`,
        }
      })
      .filter((v) => v !== null)
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
    <Flex direction="column" gap="3">
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
            {!canBulk ? <Chip size="small" label="Bulk select off" color="#d62100" /> : <Chip size="small" label="Click bars to bulk select" />}
          </Flex>
        </Flex>

        <div
          className="rc-scroll"
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
            <div className="rc-cols" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
              {columns.map((col) => (
                <div className="rc-col" key={col.id}>
                  <Text size="small">{col.label}</Text>
                  <Text size="small" subdued>
                    {col.sublabel}
                  </Text>
                </div>
              ))}
            </div>
          </div>

          {groupBy === 'projects'
            ? projectList.map((project) => (
                <ProjectBlock
                  key={project.id}
                  project={project}
                  open={openIds.has(project.id)}
                  onToggle={() => toggleOpen(project.id)}
                  columns={columns}
                  assignments={visibleAssignments.filter((a) => a.projectId === project.id)}
                  canBulk={canBulk}
                  overlays={overlaysFor(project.id)}
                  onBarClick={onBarClick}
                />
              ))
            : personList.map((entry) => (
                <PersonBlock
                  key={entry.id}
                  personId={entry.id}
                  open={openIds.has(entry.id)}
                  onToggle={() => toggleOpen(entry.id)}
                  columns={columns}
                  assignments={visibleAssignments.filter((a) => a.personId === entry.id)}
                  canBulk={canBulk}
                  onBarClick={onBarClick}
                />
              ))}
        </div>
        </Flex>
      </Card>

      {selected.length > 0 ? (
        <Card className="rc-bulk-bar" padding="small">
          <Flex alignItems="center" justifyContent="space-between" gap="3">
            <Text>
              {selected.length} chunk{selected.length === 1 ? '' : 's'} selected · Edit / Delete / Click to Drop
            </Text>
            <Flex gap="2">
              <Button
                size="small"
                appearance="primary"
                onClick={() => {
                  setEditHours('8')
                  setEditOpen(true)
                }}
              >
                Edit
              </Button>
              <Button
                size="small"
                appearance="danger-secondary"
                onClick={() => {
                  const ids = new Set(
                    visibleAssignments
                      .filter((a) => overlappingColumns(a.start, a.end, columns).some((col) => selectedKeys.has(`${a.projectId}:${col.id}`)))
                      .map((a) => a.id),
                  )
                  setHidden((prev) => new Set([...prev, ...ids]))
                  setSelected([])
                  toast.danger({ title: 'Deleted', message: 'Selected assignments were removed from this prototype range.' })
                }}
              >
                Delete
              </Button>
              <Button
                size="small"
                onClick={() => {
                  toast.info({ title: 'Click to Drop', message: 'Drop mode is mocked — selected chunks stay highlighted until you Edit or clear.' })
                }}
              >
                Click to Drop
              </Button>
              <Button
                size="small"
                appearance="ghost"
                icon={CloseIcon}
                aria-label="Clear selection"
                onClick={() => setSelected([])}
              />
            </Flex>
          </Flex>
        </Card>
      ) : null}

      <Dialog open={editOpen} onClose={() => setEditOpen(false)}>
        <Dialog.Header>Bulk edit</Dialog.Header>
        <Dialog.Content>
          <Flex direction="column" gap="3">
            <Text subdued>
              {selected.length} monthly-or-finer chunks. Technician stays hidden because this selection spans more than one row.
            </Text>
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
              toast.success({ title: 'Updated', message: `Set ${editHours} hours on the selected chunks.` })
            }}
          >
            Save
          </Button>
        </Dialog.Footer>
      </Dialog>
    </Flex>
  )
}

function ProjectBlock({
  project,
  open,
  onToggle,
  columns,
  assignments: rows,
  canBulk,
  overlays,
  onBarClick,
}: {
  project: Project
  open: boolean
  onToggle: () => void
  columns: ReturnType<typeof getColumns>
  assignments: Assignment[]
  canBulk: boolean
  overlays: { key: string; left: string; width: string }[]
  onBarClick: (projectId: string, item: { start: string; end: string }) => void
}) {
  const projectPhases = phases.filter((p) => p.projectId === project.id)
  const techs = [...new Set(rows.filter((r) => r.personId !== 'unassigned').map((r) => r.personId))]
  const sparkline = packLanes(projectPhases)
  const projectOver = hoursOver(project.scheduledHours, project.budgetHours, project.actualHours)

  return (
    <>
      <div className={`rc-row is-group${projectOver ? ' is-over' : ''}${sparkline.laneCount > 1 ? ' is-stacked' : ''}`}>
        <div className="rc-gutter">
          <button className={`rc-chevron ${open ? 'is-open' : ''}`} type="button" onClick={onToggle} aria-label={open ? 'Collapse' : 'Expand'}>
            <Icon svg={ExpandMoreIcon} size="small" inherit />
          </button>
          <Flex direction="column">
            <Text>{project.name.replace(' Tentative', '')}</Text>
            <HoursReadout
              scheduled={project.scheduledHours}
              budget={project.budgetHours}
              actual={project.actualHours}
              fallback={open ? project.hours : project.collapsedHours}
            />
          </Flex>
          {project.tentative ? <Chip size="small" label="Tentative" color="#ffbe00" /> : null}
        </div>
        <Timeline columns={columns} overlays={overlays} packed={projectPhases.length > 0 ? sparkline : undefined} thin>
          {project.leftover ? null : projectPhases.length > 0 ? (
            projectPhases.map((phase) => (
              <Bar
                key={phase.id}
                start={phase.start}
                end={phase.end}
                columns={columns}
                color={phase.color}
                thin
                canBulk={canBulk}
                lane={sparkline.laneById.get(phase.id) ?? 0}
                onClick={() => onBarClick(project.id, phase)}
              />
            ))
          ) : (
            <Bar
              start={project.start}
              end={project.end}
              columns={columns}
              color={project.color}
              thin
              canBulk={canBulk}
              onClick={() => onBarClick(project.id, project)}
            />
          )}
        </Timeline>
      </div>
      {open && !project.leftover && projectPhases.length > 0 ? (
        <PhaseRow
          projectId={project.id}
          projectPhases={projectPhases}
          columns={columns}
          canBulk={canBulk}
          onBarClick={onBarClick}
        />
      ) : null}
      {open && !project.leftover ? (
        <UnassignedRow
          projectId={project.id}
          rows={rows.filter((r) => r.kind === 'unassigned')}
          columns={columns}
          canBulk={canBulk}
          onBarClick={onBarClick}
        />
      ) : null}
      {open && !project.leftover
        ? techs.map((personId) => (
            <PersonAssignmentRow
              key={`${project.id}-${personId}`}
              personId={personId}
              projectId={project.id}
              rows={rows.filter((r) => r.personId === personId)}
              columns={columns}
              canBulk={canBulk}
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
  columns,
  assignments: rows,
  canBulk,
  onBarClick,
}: {
  personId: string
  open: boolean
  onToggle: () => void
  columns: ReturnType<typeof getColumns>
  assignments: Assignment[]
  canBulk: boolean
  onBarClick: (projectId: string, item: { start: string; end: string }) => void
}) {
  const person = personId === 'unassigned' ? undefined : personById(personId)
  const meta = personId === 'unassigned' ? { text: 'No technician · 40h on Summit', danger: false } : personMeta(personId)
  const grouped = projects
    .filter((p) => !p.leftover && rows.some((r) => r.projectId === p.id))
    .map((p) => ({ project: p, rows: rows.filter((r) => r.projectId === p.id) }))
  const packed = packLanes(rows)

  return (
    <>
      <div className={`rc-row is-group ${meta.danger ? 'is-over' : ''}${packed.laneCount > 1 ? ' is-stacked' : ''}`}>
        <div className="rc-gutter">
          <button className={`rc-chevron ${open ? 'is-open' : ''}`} type="button" onClick={onToggle} aria-label={open ? 'Collapse' : 'Expand'}>
            <Icon svg={ExpandMoreIcon} size="small" inherit />
          </button>
          {person ? <Avatar name={person.name} size="small" color={person.color} /> : <Avatar name="Unassigned" size="small" />}
          <Flex direction="column">
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
              columns={columns}
              color={projectById(row.projectId)?.color ?? '#8b8b8b'}
              label={open ? undefined : row.label}
              thin={open}
              confirmed={row.confirmed}
              unassigned={row.kind === 'unassigned'}
              canBulk={canBulk}
              lane={packed.laneById.get(row.id) ?? 0}
              onClick={() => onBarClick(row.projectId, row)}
            />
          ))}
        </Timeline>
      </div>
      {open
        ? grouped.map(({ project, rows: projectRows }) => (
            <div className="rc-row rc-nested" key={project.id}>
              <div className="rc-gutter">
                <Flex direction="column">
                  <Text>{project.name.replace(' Tentative', '')}</Text>
                  <Text size="small" subdued>
                    {projectRows.map((r) => r.label).join(' + ')}
                  </Text>
                </Flex>
              </div>
              <Timeline columns={columns} packed={packLanes(projectRows)}>
                {projectRows.map((row) => (
                  <Bar
                    key={row.id}
                    start={row.start}
                    end={row.end}
                    columns={columns}
                    color={project.color}
                    label={row.label}
                    confirmed={row.confirmed}
                    unassigned={row.kind === 'unassigned'}
                    canBulk={canBulk}
                    lane={packLanes(projectRows).laneById.get(row.id) ?? 0}
                    onClick={() => onBarClick(project.id, row)}
                  />
                ))}
              </Timeline>
            </div>
          ))
        : null}
    </>
  )
}

function PhaseRow({
  projectId,
  projectPhases,
  columns,
  canBulk,
  onBarClick,
}: {
  projectId: string
  projectPhases: Phase[]
  columns: ReturnType<typeof getColumns>
  canBulk: boolean
  onBarClick: (projectId: string, item: { start: string; end: string }) => void
}) {
  const packed = packLanes(projectPhases)
  return (
    <div className={`rc-row rc-nested${packed.laneCount > 1 ? ' is-stacked' : ''}`}>
      <div className="rc-gutter">
        <Flex direction="column">
          <Text size="small" subdued>
            Phases
          </Text>
          <Text size="small" subdued>
            Scheduled / budget
          </Text>
        </Flex>
      </div>
      <Timeline columns={columns} packed={packed}>
        {projectPhases.map((phase) => {
          const cap = hoursCaption(phase.scheduledHours, phase.budgetHours)
          const over = hoursOver(phase.scheduledHours, phase.budgetHours, phase.actualHours)
          return (
            <Bar
              key={phase.id}
              start={phase.start}
              end={phase.end}
              columns={columns}
              color={phase.color}
              label={cap ? `${phase.name} · ${cap}` : phase.name}
              canBulk={canBulk}
              lane={packed.laneById.get(phase.id) ?? 0}
              onClick={() => onBarClick(projectId, phase)}
              hint={`${phase.name} · ${phase.scheduledHours} scheduled / ${phase.budgetHours} budget · ${phase.actualHours} actual${over ? ' · over budget' : ''}`}
            />
          )
        })}
      </Timeline>
    </div>
  )
}

function assignmentColor(row: Assignment, fallback: string) {
  return phaseById(row.phaseId)?.color ?? fallback
}

function assignmentLabel(row: Assignment) {
  const phase = phaseById(row.phaseId)
  return phase ? `${phase.name} · ${row.label}` : row.label
}

function UnassignedRow({
  projectId,
  rows,
  columns,
  canBulk,
  onBarClick,
}: {
  projectId: string
  rows: Assignment[]
  columns: ReturnType<typeof getColumns>
  canBulk: boolean
  onBarClick: (projectId: string, item: { start: string; end: string }) => void
}) {
  const packed = packLanes(rows)
  if (rows.length === 0) return null
  return (
    <div className={`rc-row rc-nested${packed.laneCount > 1 ? ' is-stacked' : ''}`}>
      <div className="rc-gutter">
        <Avatar name="Unassigned" size="small" />
        <Flex direction="column">
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
            columns={columns}
            color={assignmentColor(row, '#e8e8e8')}
            label={assignmentLabel(row)}
            unassigned
            canBulk={canBulk}
            lane={packed.laneById.get(row.id) ?? 0}
            onClick={() => onBarClick(projectId, row)}
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
  columns,
  canBulk,
  onBarClick,
}: {
  personId: string
  projectId: string
  rows: Assignment[]
  columns: ReturnType<typeof getColumns>
  canBulk: boolean
  onBarClick: (projectId: string, item: { start: string; end: string }) => void
}) {
  const person = personById(personId)
  const meta = personMeta(personId)
  const packed = packLanes(rows)
  if (!person) return null
  return (
    <div className={`rc-row rc-nested ${meta.danger ? 'is-over' : ''}${packed.laneCount > 1 ? ' is-stacked' : ''}`}>
      <div className="rc-gutter">
        <Avatar name={person.name} size="small" color={person.color} />
        <Flex direction="column">
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
            columns={columns}
            color={assignmentColor(row, projectById(projectId)?.color ?? person.color)}
            label={assignmentLabel(row)}
            confirmed={row.confirmed}
            canBulk={canBulk}
            lane={packed.laneById.get(row.id) ?? 0}
            onClick={() => onBarClick(projectId, row)}
          />
        ))}
      </Timeline>
    </div>
  )
}

function Timeline({
  columns,
  overlays = [],
  packed,
  thin,
  children,
}: {
  columns: ReturnType<typeof getColumns>
  overlays?: { key: string; left: string; width: string }[]
  packed?: { laneCount: number }
  thin?: boolean
  children?: ReactNode
}) {
  const style = {
    gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
    '--rc-lanes': packed?.laneCount ?? 1,
  } as CSSProperties
  return (
    <div className={`rc-timeline${thin ? ' is-thin' : ''}`} style={style}>
      {columns.map((col) => (
        <div className="rc-cell" key={col.id} />
      ))}
      {overlays.map((o) => (
        <div className="rc-overlay" key={o.key} style={{ left: o.left, width: o.width }} onClick={(event) => event.stopPropagation()} />
      ))}
      {children}
    </div>
  )
}

function Bar({
  start,
  end,
  columns,
  color,
  label,
  thin,
  confirmed,
  unassigned,
  canBulk,
  lane = 0,
  hint,
  onClick,
}: {
  start: string
  end: string
  columns: ReturnType<typeof getColumns>
  color: string
  label?: string
  thin?: boolean
  confirmed?: boolean
  unassigned?: boolean
  canBulk: boolean
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
      className={`rc-bar${thin ? ' is-thin' : ''}${unassigned ? ' is-unassigned' : ''}${canBulk ? '' : ' is-disabled'}`}
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
      {confirmed && !thin ? <Icon svg={CheckIcon} size="small" inherit /> : null}
      {!thin && label ? label : null}
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
