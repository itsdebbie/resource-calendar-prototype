import { PROJECT_COLORS } from './palette'

const DAY_MS = 86400000

function utc(iso: string) {
  return Date.parse(`${iso}T00:00:00Z`)
}

function isoFromTs(ts: number) {
  return new Date(ts).toISOString().slice(0, 10)
}

export type GroupBy = 'people' | 'projects'
export type Zoom = 'days' | 'weeks' | 'months' | 'quarters' | 'year'

export type Person = {
  id: string
  name: string
  role: string
  color: string
  /** Daily shift length in hours. Sample values for the prototype, not a live roster. */
  shiftHours: number
  leftover?: boolean
}

export type Project = {
  id: string
  name: string
  color: string
  ink: string
  hours?: string
  collapsedHours?: string
  budgetHours?: number
  scheduledHours?: number
  actualHours?: number
  start: string
  end: string
  leftover?: boolean
  address?: string
}

export type Phase = {
  id: string
  projectId: string
  name: string
  start: string
  end: string
  offDays?: string[]
  color: string
  budgetHours?: number
  scheduledHours?: number
  actualHours?: number
}

export type Assignment = {
  id: string
  projectId: string
  personId: string | 'unassigned'
  phaseId?: string
  title?: string
  label: string
  start: string
  end: string
  offDays?: string[]
  confirmed?: boolean
  kind?: 'unassigned'
  address?: string
}

export const people: Person[] = [
  { id: 'david', name: 'David', role: 'Lead tech', color: '#0265dc', shiftHours: 10 },
  { id: 'danny', name: 'Danny', role: 'Installer', color: '#007a4d', shiftHours: 8 },
  { id: 'kevin', name: 'Kevin', role: 'Installer', color: '#b14c00', shiftHours: 10 },
  { id: 'chris', name: 'Chris', role: 'Available · 40h/w', color: '#4f3a9e', shiftHours: 8, leftover: true },
]

export const projects: Project[] = [
  {
    id: 'summit',
    name: 'Summit Construction',
    color: PROJECT_COLORS.green[500],
    ink: PROJECT_COLORS.green[600],
    budgetHours: 280,
    scheduledHours: 240,
    actualHours: 198,
    start: '2026-01-05',
    end: '2026-06-26',
    address: '12 Harbor Way',
  },
  {
    id: 'apex',
    name: 'Apex Mechanical',
    color: PROJECT_COLORS.blue[500],
    ink: PROJECT_COLORS.blue[600],
    budgetHours: 20,
    scheduledHours: 20,
    actualHours: 16,
    start: '2026-03-09',
    end: '2026-04-24',
  },
  {
    id: 'monolith',
    name: 'Monolith',
    color: PROJECT_COLORS.yellow[500],
    ink: PROJECT_COLORS.yellow[600],
    budgetHours: 160,
    scheduledHours: 0,
    actualHours: 0,
    start: '2026-05-04',
    end: '2026-06-26',
  },
  {
    id: 'leftover',
    name: 'Not on a project',
    color: PROJECT_COLORS['blue-grey'][500],
    ink: PROJECT_COLORS['blue-grey'][600],
    hours: '1 person leftover',
    collapsedHours: '1 person leftover',
    start: '2026-01-01',
    end: '2026-01-01',
    leftover: true,
  },
]

export const phases: Phase[] = [
  {
    id: 'foundation',
    projectId: 'summit',
    name: 'Foundation',
    start: '2026-01-05',
    end: '2026-03-06',
    color: PROJECT_COLORS.green[500],
    budgetHours: 100,
    scheduledHours: 90,
    actualHours: 88,
  },
  {
    id: 'rough-in',
    projectId: 'summit',
    name: 'Rough-in',
    start: '2026-03-09',
    end: '2026-05-22',
    color: PROJECT_COLORS.green[500],
    budgetHours: 90,
    scheduledHours: 80,
    actualHours: 70,
  },
  {
    id: 'trim',
    projectId: 'summit',
    name: 'Trim',
    start: '2026-05-25',
    end: '2026-06-19',
    color: PROJECT_COLORS.green[500],
    budgetHours: 35,
    scheduledHours: 15,
    actualHours: 0,
  },
  {
    id: 'permits',
    projectId: 'summit',
    name: 'Permits',
    start: '2026-02-16',
    end: '2026-03-20',
    color: PROJECT_COLORS.green[500],
    budgetHours: 20,
    scheduledHours: 20,
    actualHours: 12,
  },
  {
    id: 'inspections',
    projectId: 'summit',
    name: 'Inspections',
    start: '2026-04-13',
    end: '2026-05-15',
    color: PROJECT_COLORS.green[500],
    budgetHours: 20,
    scheduledHours: 15,
    actualHours: 10,
  },
  {
    id: 'change-order',
    projectId: 'summit',
    name: 'Change order',
    start: '2026-03-16',
    end: '2026-04-24',
    color: PROJECT_COLORS.green[500],
    budgetHours: 15,
    scheduledHours: 20,
    actualHours: 18,
  },
]

export const assignments: Assignment[] = [
  {
    id: 'unassigned-foundation',
    projectId: 'summit',
    personId: 'unassigned',
    phaseId: 'foundation',
    label: '40h',
    start: '2026-01-05',
    end: '2026-03-06',
    kind: 'unassigned',
  },
  {
    id: 'david-foundation',
    projectId: 'summit',
    personId: 'david',
    phaseId: 'foundation',
    label: '20h',
    start: '2026-01-05',
    end: '2026-03-06',
    confirmed: true,
  },
  {
    id: 'danny-foundation',
    projectId: 'summit',
    personId: 'danny',
    phaseId: 'foundation',
    label: '40h',
    start: '2026-01-05',
    end: '2026-03-06',
  },
  {
    id: 'kevin-walkthrough',
    projectId: 'summit',
    personId: 'kevin',
    title: 'Walkthrough',
    label: '8h',
    start: '2026-01-14',
    end: '2026-01-14',
  },
  {
    id: 'kevin-site-check',
    projectId: 'summit',
    personId: 'kevin',
    title: 'Site check',
    label: '8h',
    start: '2026-01-15',
    end: '2026-01-15',
    address: '12 Harbor Way',
  },
  {
    id: 'kevin-punch-list',
    projectId: 'summit',
    personId: 'kevin',
    title: 'Punch list',
    label: '8h',
    start: '2026-01-16',
    end: '2026-01-16',
  },
  {
    id: 'kevin-foundation',
    projectId: 'summit',
    personId: 'kevin',
    phaseId: 'foundation',
    label: '20h',
    start: '2026-02-02',
    end: '2026-03-06',
  },
  {
    id: 'kevin-permits',
    projectId: 'summit',
    personId: 'kevin',
    phaseId: 'permits',
    label: '20h',
    start: '2026-02-16',
    end: '2026-03-20',
  },
  {
    id: 'danny-rough-in',
    projectId: 'summit',
    personId: 'danny',
    phaseId: 'rough-in',
    label: '40h',
    start: '2026-03-09',
    end: '2026-05-22',
  },
  {
    id: 'david-change-order',
    projectId: 'summit',
    personId: 'david',
    phaseId: 'change-order',
    label: '20h',
    start: '2026-03-16',
    end: '2026-04-24',
    confirmed: true,
  },
  {
    id: 'david-rough-in',
    projectId: 'summit',
    personId: 'david',
    phaseId: 'rough-in',
    label: '20h',
    start: '2026-04-27',
    end: '2026-05-22',
    confirmed: true,
  },
  {
    id: 'kevin-inspections',
    projectId: 'summit',
    personId: 'kevin',
    phaseId: 'inspections',
    label: '20h',
    start: '2026-04-13',
    end: '2026-05-15',
  },
  {
    id: 'danny-trim',
    projectId: 'summit',
    personId: 'danny',
    phaseId: 'trim',
    label: '40h',
    start: '2026-05-25',
    end: '2026-06-19',
  },
  {
    id: 'kevin-trim',
    projectId: 'summit',
    personId: 'kevin',
    phaseId: 'trim',
    label: '20h',
    start: '2026-05-25',
    end: '2026-06-19',
  },
  {
    id: 'david-apex',
    projectId: 'apex',
    personId: 'david',
    label: '20h',
    start: '2026-03-09',
    end: '2026-04-24',
    confirmed: true,
  },
  {
    id: 'danny-apex',
    projectId: 'apex',
    personId: 'danny',
    label: '40h',
    start: '2026-03-09',
    end: '2026-03-20',
  },
]

export function personById(id: string) {
  return people.find((p) => p.id === id)
}

export function projectById(id: string) {
  return projects.find((p) => p.id === id)
}

export function phaseById(id: string | undefined) {
  return id ? phases.find((p) => p.id === id) : undefined
}

export function assignmentLabel(row: Assignment) {
  return row.title ?? phaseById(row.phaseId)?.name ?? projectById(row.projectId)?.name ?? row.label
}

export function assignmentAddress(row: Assignment) {
  return row.address ?? projectById(row.projectId)?.address
}

export function hoursOver(scheduled?: number, budget?: number, actual?: number) {
  if (budget == null || budget <= 0) return false
  return (scheduled ?? 0) > budget || (actual ?? 0) > budget
}

/** Blank unless a value is booked or logged. Never returns 0. */
export function displayHours(n?: number) {
  if (n == null || n === 0) return ''
  return String(n)
}

export function hoursCaption(scheduled?: number, budget?: number) {
  if (scheduled == null || budget == null) return undefined
  return `${scheduled} / ${budget}h`
}

/** Daily shift length. Sample `shiftHours` on each person; default 8 if omitted. */
export function dailyShiftHours(personId: string) {
  if (personId === 'unassigned') return 0
  return personById(personId)?.shiftHours ?? 8
}

export function weeklyCap(personId: string) {
  return dailyShiftHours(personId) * 5
}

/** 40h labels are weekly; 8h (or anything ≤12) is treated as hours that day. */
export function hoursPerWorkday(row: Assignment) {
  const n = parseInt(row.label, 10) || 0
  if (n <= 12) return n
  return n / 5
}

export function hoursTotal(row: Assignment) {
  const n = parseInt(row.label, 10) || 0
  return n
}

function isWeekendTs(t: number) {
  const day = new Date(t).getUTCDay()
  return day === 0 || day === 6
}

export function countedDaysInWindow(window: { start: number; end: number }, includeWeekends: boolean) {
  let n = 0
  for (let t = window.start; t < window.end; t += DAY_MS) {
    if (!includeWeekends && isWeekendTs(t)) continue
    n += 1
  }
  return n
}

export function workdaysInWindow(window: { start: number; end: number }) {
  return countedDaysInWindow(window, false)
}

export function assignmentDaysInWindow(
  row: Assignment,
  window: { start: number; end: number },
  includeWeekends = false,
) {
  const off = new Set(row.offDays)
  const a = Math.max(utc(row.start), window.start)
  const b = Math.min(utc(row.end) + DAY_MS, window.end)
  if (b <= a) return 0
  let n = 0
  for (let t = a; t < b; t += DAY_MS) {
    if (!includeWeekends && isWeekendTs(t)) continue
    if (off.has(isoFromTs(t))) continue
    n += 1
  }
  return n
}

export function assignmentWorkdaysInWindow(row: Assignment, window: { start: number; end: number }) {
  return assignmentDaysInWindow(row, window, false)
}

export function personHoursInWindow(
  personId: string,
  rows: Assignment[],
  window: { start: number; end: number },
  rangeLabel?: string,
  includeWeekends = false,
) {
  const mine = rows.filter((row) => row.personId === personId)
  const booked = mine.reduce(
    (sum, row) => sum + hoursPerWorkday(row) * assignmentDaysInWindow(row, window, includeWeekends),
    0,
  )
  const days = countedDaysInWindow(window, includeWeekends)
  const shift = dailyShiftHours(personId)
  const cap = shift * days
  const bookedR = Math.round(booked)
  const capR = Math.round(cap)
  const names = mine
    .filter((row) => assignmentDaysInWindow(row, window, includeWeekends) > 0)
    .map((row) => {
      const project = projectById(row.projectId)?.name.split(' ')[0] ?? ''
      const name = row.title ?? phaseById(row.phaseId)?.name
      return [name, row.label, project].filter(Boolean).join(' ')
    })
  const dayWord = includeWeekends ? 'days' : 'workdays'
  const breakdown = `${bookedR}h scheduled in the visible dates / ${capR}h available (${days} ${dayWord} × ${shift}h)${names.length ? ` · ${names.join(' + ')}` : ''}`
  return {
    booked: bookedR,
    cap: capR,
    over: capR > 0 && bookedR > capR,
    text: personId === 'unassigned' ? 'No technician' : `${bookedR} / ${capR}h in view`,
    detail: personId === 'unassigned' ? names.join(' + ') : [rangeLabel, `${shift}h shift`, breakdown].filter(Boolean).join('\n'),
  }
}

/** Conflict when booked hours on a day exceed that person's shift length, not for every overlap. */
export function overCapacityAssignmentIds(personId: string, rows: Assignment[], includeWeekends = false) {
  const cap = dailyShiftHours(personId)
  const ids = new Set<string>()
  if (cap <= 0) return ids
  const dayHours = new Map<string, number>()
  for (const row of rows) {
    const h = hoursPerWorkday(row)
    const off = new Set(row.offDays)
    const end = utc(row.end)
    for (let t = utc(row.start); t <= end; t += DAY_MS) {
      if (!includeWeekends && isWeekendTs(t)) continue
      const iso = isoFromTs(t)
      if (off.has(iso)) continue
      dayHours.set(iso, (dayHours.get(iso) ?? 0) + h)
    }
  }
  for (const row of rows) {
    const off = new Set(row.offDays)
    const end = utc(row.end)
    for (let t = utc(row.start); t <= end; t += DAY_MS) {
      if (!includeWeekends && isWeekendTs(t)) continue
      const iso = isoFromTs(t)
      if (off.has(iso)) continue
      if ((dayHours.get(iso) ?? 0) > cap + 0.05) {
        ids.add(row.id)
        break
      }
    }
  }
  return ids
}

export function hoursTooltipLine(scheduled?: number, budget?: number, actual?: number, fallback?: string) {
  const bits: string[] = []
  if (scheduled != null && budget != null) bits.push(`${scheduled} / ${budget}h scheduled`)
  else if (scheduled != null) bits.push(`${scheduled}h scheduled`)
  else if (fallback) bits.push(fallback)
  if (actual != null && actual > 0) bits.push(`${actual}h actual`)
  return bits.join(' · ') || undefined
}

/** 20h bars are a half day; 40h is a full 9–5. */
export function clockLabel(row: { label: string }) {
  return row.label.startsWith('20') ? '9a–1p' : '9a–5p'
}

export function zoomBarParts(_zoom: Zoom, row: Assignment) {
  const name = row.kind === 'unassigned' ? 'Needs a tech' : assignmentLabel(row)
  return { name, hours: row.label, clock: clockLabel(row) }
}

export function zoomBarLabel(zoom: Zoom, row: Assignment) {
  const { name, hours } = zoomBarParts(zoom, row)
  return [name, hours].filter(Boolean).join(' · ')
}

export type IssueKind = 'conflict' | 'unassigned' | 'overbudget'

export type CalendarIssue = {
  id: string
  kind: IssueKind
  date: string
  targetId: string
  projectId: string
  personId?: string
  label: string
  hours?: number
}

export function collectIssues(
  rows: Assignment[],
  activeProjectIds: string[],
  includeWeekends: boolean,
): { conflict: CalendarIssue[]; unassigned: CalendarIssue[]; overbudget: CalendarIssue[] } {
  const allowed = new Set(activeProjectIds)
  const visible = rows.filter((row) => allowed.has(row.projectId))
  const conflict: CalendarIssue[] = []
  const unassigned: CalendarIssue[] = []
  const overbudget: CalendarIssue[] = []
  const seenConflict = new Set<string>()

  const byPerson = new Map<string, Assignment[]>()
  for (const row of visible) {
    const list = byPerson.get(row.personId) ?? []
    list.push(row)
    byPerson.set(row.personId, list)
  }
  for (const [personId, list] of byPerson) {
    if (personId === 'unassigned') continue
    for (const id of overCapacityAssignmentIds(personId, list, includeWeekends)) {
      if (seenConflict.has(id)) continue
      const row = list.find((r) => r.id === id)
      if (!row) continue
      seenConflict.add(id)
      conflict.push({
        id: `conflict:${id}`,
        kind: 'conflict',
        date: row.start,
        targetId: row.id,
        projectId: row.projectId,
        personId: row.personId,
        label: assignmentLabel(row),
        hours: hoursTotal(row),
      })
    }
  }

  for (const row of visible) {
    if (row.kind !== 'unassigned' && row.personId !== 'unassigned') continue
    unassigned.push({
      id: `unassigned:${row.id}`,
      kind: 'unassigned',
      date: row.start,
      targetId: row.id,
      projectId: row.projectId,
      personId: 'unassigned',
      label: assignmentLabel(row),
      hours: hoursTotal(row),
    })
  }

  for (const phase of phases) {
    if (!allowed.has(phase.projectId)) continue
    if (!hoursOver(phase.scheduledHours, phase.budgetHours, phase.actualHours)) continue
    overbudget.push({
      id: `overbudget:${phase.id}`,
      kind: 'overbudget',
      date: phase.start,
      targetId: phase.id,
      projectId: phase.projectId,
      label: phase.name,
    })
  }

  const byDate = (a: CalendarIssue, b: CalendarIssue) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label)
  conflict.sort(byDate)
  unassigned.sort(byDate)
  overbudget.sort(byDate)
  return { conflict, unassigned, overbudget }
}

export function issueKindLabel(kind: IssueKind, count: number) {
  if (kind === 'conflict') return count === 1 ? 'conflict' : 'conflicts'
  if (kind === 'unassigned') return 'unassigned'
  return count === 1 ? 'phase over budget' : 'phases over budget'
}

export function issueKindTitle(kind: IssueKind) {
  if (kind === 'conflict') return 'Conflict'
  if (kind === 'unassigned') return 'Unassigned'
  return 'Over budget'
}
