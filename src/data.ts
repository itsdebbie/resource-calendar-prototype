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
  label: string
  start: string
  end: string
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

export function weeklyHours(personId: string) {
  if (personId === 'david') return { booked: 60, cap: 40, over: true, detail: '40h/w on Summit + 20h on Apex' }
  if (personId === 'danny') return { booked: 40, cap: 40, over: false, detail: '40h/w' }
  if (personId === 'kevin') return { booked: 20, cap: 40, over: false, detail: '20h/w' }
  if (personId === 'chris') return { booked: 0, cap: 40, over: false, detail: 'Available · 40h/w' }
  return { booked: 0, cap: 40, over: false, detail: '' }
}
