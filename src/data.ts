export type GroupBy = 'people' | 'projects'
export type Zoom = 'days' | 'weeks' | 'months' | 'quarters' | 'year'

export type Person = {
  id: string
  name: string
  role: string
  color: string
  leftover?: boolean
}

export type Project = {
  id: string
  name: string
  color: string
  hours?: string
  collapsedHours?: string
  budgetHours?: number
  scheduledHours?: number
  actualHours?: number
  start: string
  end: string
  tentative?: boolean
  leftover?: boolean
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
}

export const people: Person[] = [
  { id: 'david', name: 'David', role: 'Lead tech', color: '#0265dc' },
  { id: 'danny', name: 'Danny', role: 'Installer', color: '#077e50' },
  { id: 'kevin', name: 'Kevin', role: 'Installer', color: '#c98600' },
  { id: 'chris', name: 'Chris', role: 'Available · 40h/w', color: '#6b5ce7', leftover: true },
]

export const projects: Project[] = [
  {
    id: 'summit',
    name: 'Summit Construction',
    color: '#077e50',
    budgetHours: 280,
    scheduledHours: 240,
    actualHours: 198,
    start: '2026-01-05',
    end: '2026-06-26',
  },
  {
    id: 'apex',
    name: 'Apex Mechanical',
    color: '#0265dc',
    budgetHours: 20,
    scheduledHours: 20,
    actualHours: 16,
    start: '2026-03-09',
    end: '2026-04-24',
  },
  {
    id: 'monolith',
    name: 'Monolith Tentative',
    color: '#c98600',
    budgetHours: 160,
    scheduledHours: 0,
    actualHours: 0,
    start: '2026-05-04',
    end: '2026-06-26',
    tentative: true,
  },
  {
    id: 'leftover',
    name: 'Not on a project',
    color: '#8b8b8b',
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
    color: '#70ebbc',
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
    color: '#c4b5fd',
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
    color: '#f9a8d4',
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
    color: '#fbbf24',
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
    color: '#86efac',
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
    color: '#a78bfa',
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
    id: 'kevin-site-check',
    projectId: 'summit',
    personId: 'kevin',
    title: 'Site check',
    label: '8h',
    start: '2026-01-15',
    end: '2026-01-15',
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

export function hoursOver(scheduled?: number, budget?: number, actual?: number) {
  if (budget == null || budget <= 0) return false
  return (scheduled ?? 0) > budget || (actual ?? 0) > budget
}

export function hoursCaption(scheduled?: number, budget?: number) {
  if (scheduled == null || budget == null) return undefined
  return `${scheduled} / ${budget}h`
}

export function weeklyCap(personId: string) {
  if (personId === 'unassigned') return 0
  return 40
}

/** 40h labels are weekly; 8h (or anything ≤12) is treated as hours that day. */
export function hoursPerWorkday(row: Assignment) {
  const n = parseInt(row.label, 10) || 0
  if (n <= 12) return n
  return n / 5
}

function isoFromTs(ts: number) {
  return new Date(ts).toISOString().slice(0, 10)
}

export function workdaysInWindow(window: { start: number; end: number }) {
  let n = 0
  for (let t = window.start; t < window.end; t += 86400000) {
    const day = new Date(t).getUTCDay()
    if (day !== 0 && day !== 6) n += 1
  }
  return n
}

export function assignmentWorkdaysInWindow(row: Assignment, window: { start: number; end: number }) {
  const off = new Set(row.offDays)
  const a = Math.max(Date.parse(`${row.start}T00:00:00Z`), window.start)
  const b = Math.min(Date.parse(`${row.end}T00:00:00Z`) + 86400000, window.end)
  if (b <= a) return 0
  let n = 0
  for (let t = a; t < b; t += 86400000) {
    const day = new Date(t).getUTCDay()
    if (day === 0 || day === 6) continue
    if (off.has(isoFromTs(t))) continue
    n += 1
  }
  return n
}

export function personHoursInWindow(personId: string, rows: Assignment[], window: { start: number; end: number }) {
  const mine = rows.filter((row) => row.personId === personId)
  const booked = mine.reduce((sum, row) => sum + hoursPerWorkday(row) * assignmentWorkdaysInWindow(row, window), 0)
  const days = workdaysInWindow(window)
  const cap = personId === 'unassigned' ? 0 : (weeklyCap(personId) / 5) * days
  const bookedR = Math.round(booked)
  const capR = Math.round(cap)
  const names = mine
    .filter((row) => assignmentWorkdaysInWindow(row, window) > 0)
    .map((row) => {
      const project = projectById(row.projectId)?.name.split(' ')[0] ?? ''
      const name = row.title ?? phaseById(row.phaseId)?.name
      return [name, row.label, project].filter(Boolean).join(' ')
    })
  return {
    booked: bookedR,
    cap: capR,
    over: capR > 0 && bookedR > capR,
    text: personId === 'unassigned' ? 'No technician' : `${bookedR} / ${capR}h in view`,
    detail:
      personId === 'unassigned'
        ? names.join(' + ')
        : `${bookedR}h scheduled in the visible dates / ${capR}h capacity (${days} workdays × 8h)${names.length ? ` · ${names.join(' + ')}` : ''}`,
  }
}

/** 20h bars are a half day; 40h is a full 9–5. */
export function clockLabel(row: { label: string }) {
  return row.label.startsWith('20') ? '9a–1p' : '9a–5p'
}

export function zoomBarLabel(zoom: Zoom, row: Assignment) {
  const phase = phaseById(row.phaseId)
  const name = row.title ?? phase?.name
  const clock = clockLabel(row)
  if (zoom === 'days') return name ? `${name} · ${clock}` : clock
  if (zoom === 'weeks') return name ? `${name} · ${clock} · ${row.label}` : `${clock} · ${row.label}`
  return name ? `${name} · ${row.label}` : row.label
}
