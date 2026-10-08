import type { Zoom } from './data'

export type Column = {
  id: string
  label: string
  sublabel: string
  start: number
  end: number
  today?: boolean
  weekend?: boolean
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Demo “today” inside the Summit data so Today/date jump stay useful. */
export const DEMO_TODAY = '2026-01-12'
export const RANGE_START = '2026-01-05'
export const RANGE_END = '2026-06-27'

export function utc(iso: string) {
  return Date.parse(`${iso}T00:00:00Z`)
}

export function isoFromTs(ts: number) {
  return new Date(ts).toISOString().slice(0, 10)
}

function addDays(ts: number, days: number) {
  return ts + days * 86400000
}

function isoWeek(ts: number) {
  const date = new Date(ts)
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = utcDate.getUTCDay() || 7
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1))
  return Math.ceil(((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

export function columnWidth(zoom: Zoom) {
  if (zoom === 'days') return 44
  if (zoom === 'weeks') return 80
  if (zoom === 'months') return 132
  if (zoom === 'quarters') return 200
  return 240
}

export function monthBands(columns: Column[]) {
  const bands: { id: string; label: string; span: number }[] = []
  for (const col of columns) {
    const d = new Date(col.start)
    const id = `${d.getUTCFullYear()}-${d.getUTCMonth()}`
    const label = MONTHS[d.getUTCMonth()] ?? ''
    const last = bands[bands.length - 1]
    if (last && last.id === id) last.span += 1
    else bands.push({ id, label, span: 1 })
  }
  return bands
}

export function getColumns(zoom: Zoom): Column[] {
  const today = utc(DEMO_TODAY)

  if (zoom === 'days') {
    const start = utc(RANGE_START)
    const end = utc(RANGE_END)
    const count = Math.round((end - start) / 86400000)
    return Array.from({ length: count }, (_, i) => {
      const s = addDays(start, i)
      const d = new Date(s)
      return {
        id: isoFromTs(s),
        label: String(d.getUTCDate()),
        sublabel: DAYS[d.getUTCDay()] ?? '',
        start: s,
        end: addDays(s, 1),
        today: s === today,
        weekend: d.getUTCDay() === 0 || d.getUTCDay() === 6,
      }
    })
  }

  if (zoom === 'weeks') {
    const start = utc(RANGE_START)
    const end = utc(RANGE_END)
    const columns: Column[] = []
    for (let s = start; s < end; s = addDays(s, 7)) {
      const d = new Date(s)
      const end = addDays(s, 6)
      const endDate = new Date(end)
      columns.push({
        id: isoFromTs(s),
        label: `W${isoWeek(s)}`,
        sublabel: `${d.getUTCDate()}–${endDate.getUTCDate()}`,
        start: s,
        end: addDays(s, 7),
        today: today >= s && today < addDays(s, 7),
      })
    }
    return columns
  }

  if (zoom === 'months') {
    return Array.from({ length: 12 }, (_, i) => {
      const s = Date.UTC(2026, i, 1)
      const e = Date.UTC(2026, i + 1, 1)
      return {
        id: `m-${i}`,
        label: MONTHS[i] ?? '',
        sublabel: '2026',
        start: s,
        end: e,
        today: today >= s && today < e,
      }
    })
  }

  if (zoom === 'quarters') {
    return [0, 1, 2, 3].map((q) => {
      const s = Date.UTC(2026, q * 3, 1)
      const e = Date.UTC(2026, q * 3 + 3, 1)
      return {
        id: `q-${q}`,
        label: `Q${q + 1}`,
        sublabel: '2026',
        start: s,
        end: e,
        today: today >= s && today < e,
      }
    })
  }

  return [2025, 2026, 2027].map((year) => {
    const s = Date.UTC(year, 0, 1)
    const e = Date.UTC(year + 1, 0, 1)
    return {
      id: `y-${year}`,
      label: String(year),
      sublabel: 'Full year',
      start: s,
      end: e,
      today: today >= s && today < e,
    }
  })
}

export function columnForDate(columns: Column[], iso: string) {
  const t = utc(iso)
  return columns.find((col) => col.start <= t && t < col.end)
}

export function rangeOf(columns: Column[]) {
  return {
    start: columns[0]?.start ?? 0,
    end: columns[columns.length - 1]?.end ?? 0,
  }
}

export function barStyle(startIso: string, endIso: string, columns: Column[]) {
  const { start, end } = rangeOf(columns)
  const span = end - start
  if (span <= 0) return { left: '0%', width: '0%', visible: false as const }
  const a = Math.max(utc(startIso), start)
  const b = Math.min(utc(endIso) + 86400000, end)
  if (b <= a) return { left: '0%', width: '0%', visible: false as const }
  return {
    left: `${((a - start) / span) * 100}%`,
    width: `${((b - a) / span) * 100}%`,
    visible: true as const,
  }
}

export function overlappingColumns(startIso: string, endIso: string, columns: Column[]) {
  const a = utc(startIso)
  const b = utc(endIso) + 86400000
  return columns.filter((col) => col.start < b && col.end > a)
}

export function columnAtClientX(columns: Column[], timeline: DOMRect, clientX: number) {
  if (timeline.width <= 0) return undefined
  const ratio = (clientX - timeline.left) / timeline.width
  const { start, end } = rangeOf(columns)
  const t = start + Math.min(0.999, Math.max(0, ratio)) * (end - start)
  return columns.find((col) => col.start <= t && t < col.end)
}

export function bulkAllowed(zoom: Zoom) {
  return zoom === 'days' || zoom === 'weeks' || zoom === 'months'
}

export type TimeWindow = { start: number; end: number }

export function inTimeWindow(startIso: string, endIso: string, window?: TimeWindow) {
  if (!window) return true
  return utc(startIso) < window.end && utc(endIso) + 86400000 > window.start
}

export function packLanes<T extends { id: string; start: string; end: string }>(items: T[], window?: TimeWindow) {
  const source = window ? items.filter((item) => inTimeWindow(item.start, item.end, window)) : items
  const sorted = [...source].sort((a, b) => utc(a.start) - utc(b.start) || utc(a.end) - utc(b.end))
  const laneEnds: number[] = []
  const laneById = new Map<string, number>()
  for (const item of sorted) {
    const start = utc(item.start)
    const end = utc(item.end) + 86400000
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(end)
    } else {
      laneEnds[lane] = end
    }
    laneById.set(item.id, lane)
  }
  return { laneById, laneCount: Math.max(1, laneEnds.length) }
}
