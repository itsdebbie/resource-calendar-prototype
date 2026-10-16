import { Avatar, Button, Chip, Icon, Text } from '@servicetitan/anvil2'
import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { CalendarIssue, IssueKind } from './data'
import { issueKindLabel, issueKindTitle } from './data'
import { tintFill } from './palette'
import type { CrewRow } from './crew'
import { cellKey } from './crew'
import type { Column } from './timeline'
import { CloseIcon, ExpandLessIcon, ExpandMoreIcon, PersonQuestionIcon, WarningIcon } from './icons'
import { wheelPanDelta } from './interaction'

type Finder = { kind: IssueKind; index: number }

const ISSUE_CONFLICT = '#d62100'
const ISSUE_UNASSIGNED = '#077e50'
const ISSUE_OVER = '#d62100'

export function CrewPanel({
  open,
  onToggle,
  previewing,
  showAll,
  onShowAll,
  crew,
  visColumns,
  columns,
  colW,
  scrollLeft,
  draggingPersonId,
  hoursBefore,
  issues,
  finder,
  onIssueClick,
  onFinderNav,
  onFinderClose,
  onScrollBy,
  shown,
  total,
}: {
  open: boolean
  onToggle: () => void
  previewing: boolean
  showAll: boolean
  onShowAll: () => void
  crew: CrewRow[]
  visColumns: Column[]
  columns: Column[]
  colW: number
  scrollLeft: number
  draggingPersonId?: string
  hoursBefore: Record<string, number> | null
  issues: { conflict: CalendarIssue[]; unassigned: CalendarIssue[]; overbudget: CalendarIssue[] }
  finder: Finder | null
  onIssueClick: (kind: IssueKind) => void
  onFinderNav: (delta: number) => void
  onFinderClose: () => void
  onScrollBy: (dx: number) => void
  shown: number
  total: number
}) {
  const minIndex = columns[0]?.index ?? 0
  const conflictN = issues.conflict.length
  const unassignedHours = issues.unassigned.reduce((sum, issue) => sum + (issue.hours ?? 0), 0)
  const rootRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; moved: boolean } | null>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return
      const dx = wheelPanDelta(event)
      if (Math.abs(dx) < 2) return
      event.preventDefault()
      onScrollBy(dx)
    }
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => root.removeEventListener('wheel', onWheel)
  }, [onScrollBy])

  const onTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    dragRef.current = { x: event.clientX, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onTrackPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = drag.x - event.clientX
    if (!drag.moved && Math.abs(dx) < 4) return
    drag.moved = true
    drag.x = event.clientX
    onScrollBy(dx)
  }

  const onTrackPointerUp = () => {
    dragRef.current = null
  }

  return (
    <div className={`rc-crew${open ? ' is-open' : ''}`} ref={rootRef}>
      <div className="rc-crew-head">
        <button type="button" className="rc-crew-title" onClick={onToggle}>
          <span className={`rc-chevron ${open ? 'is-open' : ''}`}>
            <Icon svg={ExpandMoreIcon} size="small" inherit />
          </span>
          <span className="rc-gutter-copy">
            <Text>Crew availability</Text>
            <Text size="small" subdued>
              {previewing ? 'previewing your drag' : "Booked hours per week vs each person's shift"}
            </Text>
          </span>
        </button>
        <div className="rc-issue-chips">
          {finder ? (
            <FinderBar
              kind={finder.kind}
              index={finder.index}
              total={issues[finder.kind].length}
              onNav={onFinderNav}
              onClose={onFinderClose}
            />
          ) : (
            <>
              {conflictN > 0 ? (
                <Chip
                  className="rc-issue-chip"
                  size="small"
                  color={ISSUE_CONFLICT}
                  icon={WarningIcon}
                  label={`${conflictN} ${issueKindLabel('conflict', conflictN)}`}
                  onClick={() => onIssueClick('conflict')}
                />
              ) : null}
              {issues.unassigned.length > 0 ? (
                <Chip
                  className="rc-issue-chip"
                  size="small"
                  color={ISSUE_UNASSIGNED}
                  icon={PersonQuestionIcon}
                  label={`${unassignedHours}h unassigned`}
                  onClick={() => onIssueClick('unassigned')}
                />
              ) : null}
              {issues.overbudget.length > 0 ? (
                <Chip
                  className="rc-issue-chip"
                  size="small"
                  color={ISSUE_OVER}
                  label={`${issues.overbudget.length} ${issueKindLabel('overbudget', issues.overbudget.length)}`}
                  onClick={() => onIssueClick('overbudget')}
                />
              ) : null}
            </>
          )}
        </div>
        <Button size="small" appearance="ghost" onClick={onToggle}>
          {open ? 'Hide' : 'Show'}
        </Button>
      </div>
      {open ? (
        <>
          {crew.map((row) => (
            <div
              key={row.personId}
              className={`rc-crew-row${draggingPersonId === row.personId ? ' is-dragging-row' : ''}${row.personId === 'unassigned' ? ' is-unassigned' : ''}`}
            >
              <div className="rc-gutter rc-crew-gutter">
                {row.personId === 'unassigned' ? (
                  <span className="rc-person-unknown">
                    <Icon svg={PersonQuestionIcon} size="small" inherit />
                  </span>
                ) : (
                  <Avatar name={row.name} size="small" color={row.color} />
                )}
                <div className="rc-gutter-copy">
                  <Text className="rc-truncate" title={row.name}>
                    {row.name}
                  </Text>
                  <Text size="small" subdued className="rc-truncate" title={row.role}>
                    {row.role}
                  </Text>
                </div>
              </div>
              <div
                className="rc-crew-track"
                onPointerDown={onTrackPointerDown}
                onPointerMove={onTrackPointerMove}
                onPointerUp={onTrackPointerUp}
                onPointerCancel={onTrackPointerUp}
              >
                <div
                  className="rc-crew-cells"
                  style={
                    {
                      ['--rc-cols' as string]: String(columns.length),
                      ['--rc-col-w' as string]: `${colW}px`,
                      transform: `translateX(-${scrollLeft}px)`,
                    } as CSSProperties
                  }
                >
                  {visColumns.map((col) => {
                    const cell = row.cells.find((c) => c.colId === col.id)
                    if (!cell) return null
                    const before = hoursBefore ? hoursBefore[cellKey(row.personId, col.id)] : undefined
                    const changed = before != null && before !== cell.hours
                    const fill = cell.cap > 0 ? Math.min(100, (cell.hours / cell.cap) * 100) : cell.hours > 0 ? 100 : 0
                    return (
                      <div
                        key={col.id}
                        className={`rc-crew-cell${cell.over ? ' is-over' : ''}${row.personId === 'unassigned' ? ' is-unassigned' : ''}${changed ? ' is-changed' : ''}${cell.hours === 0 ? ' is-empty' : ''}`}
                        style={{ ['--rc-i' as string]: col.index - minIndex }}
                      >
                        {cell.hours > 0 ? (
                          <div className="rc-crew-fill" aria-hidden>
                            {cell.slices.length > 0 ? (
                              cell.slices.map((slice) => (
                                <span
                                  key={slice.projectId}
                                  style={{
                                    width: `${cell.hours > 0 ? (slice.hours / cell.hours) * fill : 0}%`,
                                    background: tintFill(slice.color, 40),
                                  }}
                                />
                              ))
                            ) : (
                              <span style={{ width: `${fill}%` }} />
                            )}
                          </div>
                        ) : null}
                        {cell.hours > 0 ? (
                          <span className={`rc-crew-h${cell.over ? ' is-over' : ''}`}>
                            {cell.over ? <Icon svg={WarningIcon} size="small" inherit /> : null}
                            {cell.hours}
                          </span>
                        ) : null}
                        {changed ? <span className="rc-crew-was">was {before}</span> : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
          <div className="rc-crew-foot">
            <Text size="small" subdued>
              Showing {shown} of {total} people: crew on the projects in view
            </Text>
            <Button size="small" appearance="ghost" onClick={onShowAll}>
              {showAll ? 'Show crew on projects in view' : 'Show all crew'}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  )
}

function FinderBar({
  kind,
  index,
  total,
  onNav,
  onClose,
}: {
  kind: IssueKind
  index: number
  total: number
  onNav: (delta: number) => void
  onClose: () => void
}) {
  return (
    <div className={`rc-finder is-${kind}`}>
      <Icon svg={kind === 'unassigned' ? PersonQuestionIcon : WarningIcon} size="small" inherit />
      <span>
        {issueKindTitle(kind)} {index + 1} of {total}
      </span>
      <button type="button" className="rc-finder-nav" onClick={() => onNav(-1)} aria-label="Previous" disabled={total < 2}>
        <Icon svg={ExpandLessIcon} size="small" inherit />
      </button>
      <button type="button" className="rc-finder-nav" onClick={() => onNav(1)} aria-label="Next" disabled={total < 2}>
        <Icon svg={ExpandMoreIcon} size="small" inherit />
      </button>
      <button type="button" className="rc-finder-nav" onClick={onClose} aria-label="Close">
        <Icon svg={CloseIcon} size="small" inherit />
      </button>
    </div>
  )
}
