export const PROD_TODAY = '2026-10-12'
export const SCHEDULE_GUTTER = 375
export const RC_GUTTER = 268
export const ROW_H = 50
export const SCHEDULE_HEAD_H = 80
export const RC_HEAD_H = 56
export const BAR_RADIUS = 6
export const DEFAULT_GANTT = '#1360d9'
export const RC_CYAN = '#00c4d8'
export const EDGE_ZONE = 40
export const EDGE_DELAY_MS = 300
export const WORKDAY = { start: '9:00 AM', end: '5:00 PM' }
export const ADDRESS = '800 OCCIDENTAL AVENUE SOUTH'

export type ProdRowKind = 'project' | 'group' | 'tech'
export type ProdView = 'schedule' | 'calendar'

export type ProdRow = {
  id: string
  kind: ProdRowKind
  name: string
  wbs?: string
  parentId?: string
  initials?: string
  role?: string
}

export type ProdBar = {
  id: string
  rowId: string
  start: string
  end: string
  title: string
  detail?: string
  color: string
  readOnly?: boolean
  thin?: boolean
}

export const scheduleRows: ProdRow[] = [
  { id: 'project', kind: 'project', wbs: '0', name: 'Project #10372180: Project Summit' },
  { id: 'creed', kind: 'tech', parentId: 'project', name: 'Creed Bratton' },
  { id: 'jim', kind: 'tech', parentId: 'project', name: 'Jim Halpert' },
  { id: 'kevin', kind: 'tech', parentId: 'project', name: 'Kevin Malone' },
  { id: 'jade', kind: 'tech', parentId: 'project', name: 'Jade Dummy' },
  { id: 'mt', kind: 'tech', parentId: 'project', name: 'MT' },
  { id: 'mt1', kind: 'tech', parentId: 'project', name: 'MT_1' },
  { id: 'minion', kind: 'tech', parentId: 'project', name: 'Minion Bob' },
  { id: 'rough', kind: 'group', wbs: '1', name: 'Rough' },
  { id: 'karen', kind: 'tech', parentId: 'rough', name: 'Karen Filippelli' },
]

export const calendarRows: ProdRow[] = [
  { id: 'alex', kind: 'tech', name: 'Alex M', initials: 'AM', role: 'Technician' },
  { id: 'amanda', kind: 'tech', name: 'Amanda Renee', initials: 'AR', role: 'Technician' },
  { id: 'creed', kind: 'tech', name: 'Creed Bratton', initials: 'CB', role: 'Technician' },
  { id: 'jade', kind: 'tech', name: 'Jade Dummy', initials: 'JD', role: 'Technician' },
  { id: 'jane', kind: 'tech', name: 'Jane Doe', initials: 'JD', role: 'Technician' },
  { id: 'jim', kind: 'tech', name: 'Jim Halpert', initials: 'JH', role: 'Technician' },
  { id: 'karen', kind: 'tech', name: 'Karen Filippelli', initials: 'KF', role: 'Technician' },
]

export const initialScheduleBars: ProdBar[] = [
  {
    id: 'sched-project',
    rowId: 'project',
    start: '2026-10-12',
    end: '2026-11-06',
    title: 'Project Summit',
    color: DEFAULT_GANTT,
    readOnly: true,
    thin: true,
  },
  {
    id: 'sched-creed',
    rowId: 'creed',
    start: '2026-10-12',
    end: '2026-10-30',
    title: 'Project Summit',
    color: DEFAULT_GANTT,
  },
  {
    id: 'sched-jade',
    rowId: 'jade',
    start: '2026-10-12',
    end: '2026-10-30',
    title: 'Project Summit',
    color: DEFAULT_GANTT,
  },
  {
    id: 'sched-mt1',
    rowId: 'mt1',
    start: '2026-10-12',
    end: '2026-10-30',
    title: 'Project Summit',
    color: DEFAULT_GANTT,
  },
]

const rcDetail = `${WORKDAY.start} - ${WORKDAY.end} • ${ADDRESS}`

export const initialCalendarBars: ProdBar[] = [
  {
    id: 'rc-creed',
    rowId: 'creed',
    start: '2026-10-12',
    end: '2026-10-30',
    title: 'Project Summit',
    detail: rcDetail,
    color: RC_CYAN,
  },
  {
    id: 'rc-jade',
    rowId: 'jade',
    start: '2026-10-12',
    end: '2026-10-30',
    title: 'Project Summit',
    detail: rcDetail,
    color: RC_CYAN,
  },
  {
    id: 'rc-jane',
    rowId: 'jane',
    start: '2026-10-12',
    end: '2026-10-16',
    title: 'Rough | Project Summit',
    detail: rcDetail,
    color: RC_CYAN,
  },
]
