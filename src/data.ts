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
  hours: string
  collapsedHours: string
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
}

export type Assignment = {
  id: string
  projectId: string
  personId: string | 'unassigned'
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
    hours: '280 B · 240 S',
    collapsedHours: '3 people · 280 B · 240 S · Jan–Jun',
    start: '2026-01-05',
    end: '2026-06-26',
  },
  {
    id: 'apex',
    name: 'Apex Mechanical',
    color: '#0265dc',
    hours: '20 B · 20 S · Mar–Apr',
    collapsedHours: '1 person · 20 B · 20 S · also David',
    start: '2026-03-09',
    end: '2026-04-24',
  },
  {
    id: 'monolith',
    name: 'Monolith Tentative',
    color: '#c98600',
    hours: '0 assigned · 160 S',
    collapsedHours: '0 assigned · 160 S · May–Jun',
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
  },
  {
    id: 'rough-in',
    projectId: 'summit',
    name: 'Rough-in',
    start: '2026-03-09',
    end: '2026-05-22',
    color: '#c4b5fd',
  },
  {
    id: 'trim',
    projectId: 'summit',
    name: 'Trim',
    start: '2026-05-25',
    end: '2026-06-19',
    color: '#f9a8d4',
  },
  {
    id: 'permits',
    projectId: 'summit',
    name: 'Permits',
    start: '2026-02-16',
    end: '2026-03-20',
    color: '#fbbf24',
  },
  {
    id: 'inspections',
    projectId: 'summit',
    name: 'Inspections',
    start: '2026-04-13',
    end: '2026-05-15',
    color: '#86efac',
  },
  {
    id: 'change-order',
    projectId: 'summit',
    name: 'Change order',
    start: '2026-03-16',
    end: '2026-04-24',
    color: '#a78bfa',
  },
]

export const assignments: Assignment[] = [
  {
    id: 'unassigned-summit',
    projectId: 'summit',
    personId: 'unassigned',
    label: '40h',
    start: '2026-01-05',
    end: '2026-02-27',
    kind: 'unassigned',
  },
  {
    id: 'david-summit-1',
    projectId: 'summit',
    personId: 'david',
    label: '20h',
    start: '2026-01-05',
    end: '2026-02-27',
    confirmed: true,
  },
  {
    id: 'david-summit-2',
    projectId: 'summit',
    personId: 'david',
    label: '20h',
    start: '2026-03-16',
    end: '2026-05-22',
    confirmed: true,
  },
  {
    id: 'danny-summit-1',
    projectId: 'summit',
    personId: 'danny',
    label: '40h',
    start: '2026-01-05',
    end: '2026-02-13',
  },
  {
    id: 'danny-summit-2',
    projectId: 'summit',
    personId: 'danny',
    label: '40h',
    start: '2026-03-09',
    end: '2026-06-05',
  },
  {
    id: 'kevin-summit-1',
    projectId: 'summit',
    personId: 'kevin',
    label: '20h',
    start: '2026-02-02',
    end: '2026-03-06',
  },
  {
    id: 'kevin-summit-2',
    projectId: 'summit',
    personId: 'kevin',
    label: '20h',
    start: '2026-04-13',
    end: '2026-06-05',
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

export function weeklyHours(personId: string) {
  if (personId === 'david') return { booked: 60, cap: 40, over: true, detail: '40h/w on Summit + 20h on Apex' }
  if (personId === 'danny') return { booked: 40, cap: 40, over: false, detail: '40h/w' }
  if (personId === 'kevin') return { booked: 20, cap: 40, over: false, detail: '20h/w' }
  if (personId === 'chris') return { booked: 0, cap: 40, over: false, detail: 'Available · 40h/w' }
  return { booked: 0, cap: 40, over: false, detail: '' }
}
