import type { Zoom } from './data'

export type Column = {
  id: string
  label: string
  sublabel: string
  start: number
  end: number
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function utc(iso: string) {
  return Date.parse(`${iso}T00:00:00Z`)
}

function addDays(ts: number, days: number) {
  return ts + days * 86400000
}

export function getColumns(zoom: Zoom): Column[] {
  if (zoom === 'days') {
    const start = utc('2026-01-05')
    return Array.from({ length: 14 }, (_, i) => {
      const s = addDays(start, i)
      const d = new Date(s)
      return {
        id: `d-${i}`,
        label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] ?? '',
        sublabel: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`,
        start: s,
        end: addDays(s, 1),
      }
    })
  }

  if (zoom === 'weeks') {
    const start = utc('2026-01-05')
    return Array.from({ length: 8 }, (_, i) => {
      const s = addDays(start, i * 7)
      const d = new Date(s)
      return {
        id: `w-${i}`,
        label: `W${i + 1}`,
        sublabel: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`,
        start: s,
        end: addDays(s, 7),
      }
    })
  }

  if (zoom === 'months') {
    return Array.from({ length: 6 }, (_, i) => {
      const s = Date.UTC(2026, i, 1)
      return {
        id: `m-${i}`,
        label: MONTHS[i] ?? '',
        sublabel: '2026',
        start: s,
        end: Date.UTC(2026, i + 1, 1),
      }
    })
  }

  if (zoom === 'quarters') {
    return [0, 1, 2, 3].map((q) => ({
      id: `q-${q}`,
      label: `Q${q + 1}`,
      sublabel: '2026',
      start: Date.UTC(2026, q * 3, 1),
      end: Date.UTC(2026, q * 3 + 3, 1),
    }))
  }

  return [2025, 2026, 2027].map((year) => ({
    id: `y-${year}`,
    label: String(year),
    sublabel: 'Full year',
    start: Date.UTC(year, 0, 1),
    end: Date.UTC(year + 1, 0, 1),
  }))
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
  const b = Math.min(utc(endIso), end)
  if (b <= a) return { left: '0%', width: '0%', visible: false as const }
  return {
    left: `${((a - start) / span) * 100}%`,
    width: `${((b - a) / span) * 100}%`,
    visible: true as const,
  }
}

export function overlappingColumns(startIso: string, endIso: string, columns: Column[]) {
  const a = utc(startIso)
  const b = utc(endIso)
  return columns.filter((col) => col.start < b && col.end > a)
}

export function bulkAllowed(zoom: Zoom) {
  return zoom === 'days' || zoom === 'weeks' || zoom === 'months'
}

export function packLanes<T extends { id: string; start: string; end: string }>(items: T[]) {
  const sorted = [...items].sort((a, b) => utc(a.start) - utc(b.start) || utc(a.end) - utc(b.end))
  const laneEnds: number[] = []
  const laneById = new Map<string, number>()
  for (const item of sorted) {
    const start = utc(item.start)
    const end = utc(item.end)
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
