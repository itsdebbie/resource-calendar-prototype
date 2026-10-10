import {
  assignmentDaysInWindow,
  dailyShiftHours,
  hoursPerWorkday,
  projectById,
  type Assignment,
  type Person,
} from './data'
import type { Column } from './timeline'

export type CrewSlice = { projectId: string; hours: number; color: string; ink: string }

export type CrewCell = {
  colId: string
  hours: number
  cap: number
  over: boolean
  slices: CrewSlice[]
}

export type CrewRow = {
  personId: string
  name: string
  role: string
  color: string
  leftover?: boolean
  cells: CrewCell[]
}

function countedDays(col: Column, includeWeekends: boolean) {
  let n = 0
  for (let t = col.start; t < col.end; t += 86400000) {
    const day = new Date(t).getUTCDay()
    if (!includeWeekends && (day === 0 || day === 6)) continue
    n += 1
  }
  return n
}

export function crewHoursInColumn(rows: Assignment[], personId: string, col: Column, includeWeekends: boolean): CrewCell {
  const mine = rows.filter((row) => row.personId === personId)
  const window = { start: col.start, end: col.end }
  const byProject = new Map<string, number>()
  let hours = 0
  for (const row of mine) {
    const days = assignmentDaysInWindow(row, window, includeWeekends)
    if (days <= 0) continue
    const h = hoursPerWorkday(row) * days
    hours += h
    byProject.set(row.projectId, (byProject.get(row.projectId) ?? 0) + h)
  }
  const slices: CrewSlice[] = [...byProject.entries()]
    .map(([projectId, h]) => {
      const project = projectById(projectId)
      return {
        projectId,
        hours: Math.round(h * 10) / 10,
        color: project?.color ?? '#6a7a85',
        ink: project?.ink ?? '#576671',
      }
    })
    .filter((slice) => slice.hours > 0)
  const shift = dailyShiftHours(personId)
  const cap = personId === 'unassigned' ? 0 : shift * countedDays(col, includeWeekends)
  const rounded = Math.round(hours)
  return {
    colId: col.id,
    hours: rounded,
    cap: Math.round(cap),
    over: cap > 0 && rounded > cap + 0.05,
    slices,
  }
}

export function buildCrewRows(
  peopleList: Person[],
  rows: Assignment[],
  columns: Column[],
  includeWeekends: boolean,
  showAll: boolean,
  visibleProjectIds: string[],
): CrewRow[] {
  const allowed = new Set(visibleProjectIds)
  const visibleRows = rows.filter((row) => allowed.has(row.projectId))
  const onProjects = new Set(
    visibleRows.filter((row) => row.personId !== 'unassigned').map((row) => row.personId),
  )

  const result: CrewRow[] = []
  if (visibleRows.some((row) => row.personId === 'unassigned' || row.kind === 'unassigned')) {
    result.push({
      personId: 'unassigned',
      name: 'Unassigned',
      role: 'Hours to staff',
      color: '#8b8b8b',
      cells: columns.map((col) => crewHoursInColumn(visibleRows, 'unassigned', col, includeWeekends)),
    })
  }

  for (const person of peopleList) {
    if (!showAll && !onProjects.has(person.id)) continue
    result.push({
      personId: person.id,
      name: person.name,
      role: person.role,
      color: person.color,
      leftover: person.leftover,
      cells: columns.map((col) => crewHoursInColumn(visibleRows, person.id, col, includeWeekends)),
    })
  }
  return result
}

export function crewOnVisibleCount(peopleList: Person[], rows: Assignment[], visibleProjectIds: string[]) {
  const allowed = new Set(visibleProjectIds)
  const ids = new Set(
    rows.filter((row) => allowed.has(row.projectId) && row.personId !== 'unassigned').map((row) => row.personId),
  )
  return { shown: ids.size, total: peopleList.length }
}

export function cellKey(personId: string, colId: string) {
  return `${personId}|${colId}`
}

export function snapshotCrewHours(crew: CrewRow[]) {
  const map: Record<string, number> = {}
  for (const row of crew) {
    for (const cell of row.cells) map[cellKey(row.personId, cell.colId)] = cell.hours
  }
  return map
}
