export const PROD_TODAY = '2026-10-12'
export const SCHEDULE_GUTTER = 375
export const RC_GUTTER = 268
export const ROW_H = 50
export const SCHEDULE_HEAD_H = 92
export const RC_HEAD_H = 92
export const BAR_RADIUS = 6
export const DEFAULT_GANTT = '#1360d9'
export const GROUP_ORANGE = '#e8772a'
export const RC_CYAN = '#00c4d8'
export const TODAY_BLUE = '#2270ee'
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
  color?: string
}

export type ProdBar = {
  id: string
  rowId: string
  start: string
  end: string
  title: string
  detail?: string
  notes?: string
  startTime?: string
  endTime?: string
  color: string
  readOnly?: boolean
  thin?: boolean
}

export const scheduleRows: ProdRow[] = [
  { id: 'project', kind: 'project', wbs: '0', name: 'Project #10372180: Project Summit', color: DEFAULT_GANTT },
  { id: 'creed', kind: 'tech', parentId: 'project', name: 'Creed Bratton' },
  { id: 'jim', kind: 'tech', parentId: 'project', name: 'Jim Halpert' },
  { id: 'kevin', kind: 'tech', parentId: 'project', name: 'Kevin Malone' },
  { id: 'jade', kind: 'tech', parentId: 'project', name: 'Jade Dummy' },
  { id: 'mt', kind: 'tech', parentId: 'project', name: 'MT' },
  { id: 'mt1', kind: 'tech', parentId: 'project', name: 'MT_1' },
  { id: 'minion', kind: 'tech', parentId: 'project', name: 'Minion Bob' },
  { id: 'rough', kind: 'group', wbs: '1', name: 'Rough', parentId: 'project', color: GROUP_ORANGE },
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

export const calendarProjectRows: ProdRow[] = [
  { id: 'summit', kind: 'project', name: 'Project Summit', color: RC_CYAN },
  ...calendarRows.map((row) => ({ ...row, parentId: 'summit' })),
]

function byId(id: string, rows: ProdRow[] = scheduleRows) {
  return rows.find((row) => row.id === id)
}

export function rowLevel(row: ProdRow, rows: ProdRow[] = scheduleRows) {
  let n = 0
  let parent = row.parentId ? byId(row.parentId, rows) : undefined
  while (parent) {
    n += 1
    parent = parent.parentId ? byId(parent.parentId, rows) : undefined
  }
  return n
}

export function stripColors(row: ProdRow, rows: ProdRow[] = scheduleRows) {
  const colors: string[] = []
  let cur: ProdRow | undefined = row
  const stack: ProdRow[] = []
  while (cur) {
    stack.unshift(cur)
    cur = cur.parentId ? byId(cur.parentId, rows) : undefined
  }
  for (const item of stack) {
    if (item.kind !== 'tech' && item.color) colors.push(item.color)
  }
  return colors
}

export function groupColorForRow(rowId: string, rows: ProdRow[] = scheduleRows) {
  let cur = byId(rowId, rows)
  while (cur) {
    if (cur.color) return cur.color
    cur = cur.parentId ? byId(cur.parentId, rows) : undefined
  }
  return DEFAULT_GANTT
}

export function firstLevelGroupIds() {
  return scheduleRows
    .filter((row) => row.kind !== 'tech' && rowLevel(row) <= 1 && scheduleRows.some((child) => child.parentId === row.id))
    .map((row) => row.id)
}

export function rowHasChildren(id: string, rows: ProdRow[] = scheduleRows) {
  return rows.some((row) => row.parentId === id)
}

export function rowHidden(row: ProdRow, collapsed: Set<string>, rows: ProdRow[] = scheduleRows) {
  let parent = row.parentId ? byId(row.parentId, rows) : undefined
  while (parent) {
    if (collapsed.has(parent.id)) return true
    parent = parent.parentId ? byId(parent.parentId, rows) : undefined
  }
  return false
}

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
    startTime: WORKDAY.start,
    endTime: WORKDAY.end,
    notes: 'Confirm permitting before begin',
    color: DEFAULT_GANTT,
  },
  {
    id: 'sched-jade',
    rowId: 'jade',
    start: '2026-10-12',
    end: '2026-10-30',
    title: 'Project Summit',
    startTime: WORKDAY.start,
    endTime: WORKDAY.end,
    notes: 'Coordinate access to site',
    color: DEFAULT_GANTT,
  },
  {
    id: 'sched-mt1',
    rowId: 'mt1',
    start: '2026-10-12',
    end: '2026-10-30',
    title: 'Project Summit',
    startTime: WORKDAY.start,
    endTime: WORKDAY.end,
    color: DEFAULT_GANTT,
  },
]

export const initialCalendarBars: ProdBar[] = [
  {
    id: 'rc-summit',
    rowId: 'summit',
    start: '2026-10-12',
    end: '2026-10-30',
    title: 'Project Summit',
    color: RC_CYAN,
    readOnly: true,
    thin: true,
  },
  {
    id: 'rc-creed',
    rowId: 'creed',
    start: '2026-10-12',
    end: '2026-10-30',
    title: 'Project Summit',
    startTime: WORKDAY.start,
    endTime: WORKDAY.end,
    notes: ADDRESS,
    color: RC_CYAN,
  },
  {
    id: 'rc-jade',
    rowId: 'jade',
    start: '2026-10-12',
    end: '2026-10-30',
    title: 'Project Summit',
    startTime: WORKDAY.start,
    endTime: WORKDAY.end,
    notes: ADDRESS,
    color: RC_CYAN,
  },
  {
    id: 'rc-jane',
    rowId: 'jane',
    start: '2026-10-12',
    end: '2026-10-16',
    title: 'Rough | Project Summit',
    startTime: WORKDAY.start,
    endTime: WORKDAY.end,
    notes: ADDRESS,
    color: RC_CYAN,
  },
]

export function isDarkColor(hex: string) {
  const n = hex.replace('#', '')
  if (n.length < 6) return true
  const r = Number.parseInt(n.slice(0, 2), 16)
  const g = Number.parseInt(n.slice(2, 4), 16)
  const b = Number.parseInt(n.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5
}
