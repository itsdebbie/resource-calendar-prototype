import type { Zoom } from './data'

export type Column = {
  index: number
  id: string
  label: string
  sublabel: string
  start: number
  end: number
  today?: boolean
  weekend?: boolean
}

export type TimeWindow = { start: number; end: number }
export type Span = { start: string; end: string; offDays: string[] }
export type Band = { id: string; label: string; startIndex: number; span: number }

export const DEMO_TODAY = '2026-01-12'
export const GUTTER = 280
export const DAY_MS = 86400000
export const BUFFER_COLS = 40
export const EDGE_PX = 56
export const ZOOM_ORDER: Zoom[] = ['days', 'weeks', 'months', 'quarters', 'year']

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Monday 2020-01-06, used as week/day index 0. */
const INDEX_EPOCH = Date.UTC(2020, 0, 6)

export function isIsoDate(iso: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso)
}

export function utc(iso: string) {
  if (!isIsoDate(iso)) return Date.parse(`${DEMO_TODAY}T00:00:00Z`)
  const t = Date.parse(`${iso}T00:00:00Z`)
  return Number.isFinite(t) ? t : Date.parse(`${DEMO_TODAY}T00:00:00Z`)
}

export function isoFromTs(ts: number) {
  return new Date(ts).toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number) {
  return isoFromTs(utc(iso) + days * DAY_MS)
}

export function diffDays(a: string, b: string) {
  return Math.round((utc(b) - utc(a)) / DAY_MS)
}

export function emptySpan(start: string, end: string, offDays: string[] = []): Span {
  return { start, end, offDays }
}

export function zoomStep(zoom: Zoom, direction: 1 | -1): Zoom {
  const i = ZOOM_ORDER.indexOf(zoom)
  return ZOOM_ORDER[Math.max(0, Math.min(ZOOM_ORDER.length - 1, i + direction))] ?? zoom
}

export function columnWidth(zoom: Zoom, viewportPx = 980) {
  const w = Math.min(2200, Math.max(420, viewportPx))
  if (zoom === 'days') return Math.min(92, Math.max(56, Math.round(w / 14)))
  if (zoom === 'weeks') return Math.min(120, Math.max(72, Math.round(w / 12)))
  if (zoom === 'months') return Math.min(160, Math.max(96, Math.round(w / 7)))
  if (zoom === 'quarters') return Math.min(220, Math.max(132, Math.round(w / 5)))
  return Math.min(280, Math.max(160, Math.round(w / 4)))
}

function isoWeek(ts: number) {
  const date = new Date(ts)
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = utcDate.getUTCDay() || 7
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1))
  return Math.ceil(((utcDate.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7)
}

function divMod(n: number, d: number) {
  const m = ((n % d) + d) % d
  return [(n - m) / d, m] as const
}

export function columnIndexAt(zoom: Zoom, ts: number) {
  if (!Number.isFinite(ts)) return columnIndexAt(zoom, utc(DEMO_TODAY))
  if (zoom === 'days') return Math.floor((ts - INDEX_EPOCH) / DAY_MS)
  if (zoom === 'weeks') return Math.floor((ts - INDEX_EPOCH) / (7 * DAY_MS))
  const d = new Date(ts)
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth()
  if (zoom === 'months') return (year - 2020) * 12 + month
  if (zoom === 'quarters') return (year - 2020) * 4 + Math.floor(month / 3)
  return year - 2020
}

export function columnAtIndex(zoom: Zoom, index: number): Column {
  const today = utc(DEMO_TODAY)

  if (zoom === 'days') {
    const s = INDEX_EPOCH + index * DAY_MS
    const d = new Date(s)
    const day = d.getUTCDay()
    return {
      index,
      id: isoFromTs(s),
      label: String(d.getUTCDate()),
      sublabel: DAYS[day] ?? '',
      start: s,
      end: s + DAY_MS,
      today: s === today,
      weekend: day === 0 || day === 6,
    }
  }

  if (zoom === 'weeks') {
    const s = INDEX_EPOCH + index * 7 * DAY_MS
    const last = s + 6 * DAY_MS
    const a = new Date(s)
    const b = new Date(last)
    const sameMonth = a.getUTCMonth() === b.getUTCMonth()
    const label = sameMonth
      ? `${a.getUTCDate()}–${b.getUTCDate()}`
      : `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()}–${MONTHS[b.getUTCMonth()]} ${b.getUTCDate()}`
    return {
      index,
      id: `w-${isoFromTs(s)}`,
      label,
      sublabel: `W${isoWeek(s)}`,
      start: s,
      end: s + 7 * DAY_MS,
      today: today >= s && today < s + 7 * DAY_MS,
    }
  }

  if (zoom === 'months') {
    const [yearOff, month] = divMod(index, 12)
    const year = 2020 + yearOff
    const s = Date.UTC(year, month, 1)
    const e = Date.UTC(year, month + 1, 1)
    return {
      index,
      id: `m-${year}-${month}`,
      label: MONTHS[month] ?? '',
      sublabel: String(year),
      start: s,
      end: e,
      today: today >= s && today < e,
    }
  }

  if (zoom === 'quarters') {
    const [yearOff, q] = divMod(index, 4)
    const year = 2020 + yearOff
    const s = Date.UTC(year, q * 3, 1)
    const e = Date.UTC(year, q * 3 + 3, 1)
    return {
      index,
      id: `q-${year}-${q}`,
      label: `Q${q + 1}`,
      sublabel: String(year),
      start: s,
      end: e,
      today: today >= s && today < e,
    }
  }

  const year = 2020 + index
  const s = Date.UTC(year, 0, 1)
  const e = Date.UTC(year + 1, 0, 1)
  return {
    index,
    id: `y-${year}`,
    label: String(year),
    sublabel: 'Jan–Dec',
    start: s,
    end: e,
    today: today >= s && today < e,
  }
}

export function columnsInExtent(zoom: Zoom, min: number, max: number): Column[] {
  const columns: Column[] = []
  for (let i = min; i <= max; i++) columns.push(columnAtIndex(zoom, i))
  return columns
}

export function rangeOf(columns: Column[]) {
  return {
    start: columns[0]?.start ?? 0,
    end: columns[columns.length - 1]?.end ?? 0,
  }
}

export function contextLabel(zoom: Zoom, window: TimeWindow) {
  if (window.end <= window.start) return ''
  const a = new Date(window.start)
  const b = new Date(window.end - 1)
  const y1 = a.getUTCFullYear()
  const y2 = b.getUTCFullYear()
  const m1 = a.getUTCMonth()
  const m2 = b.getUTCMonth()
  if (zoom === 'days' || zoom === 'weeks') {
    if (y1 === y2 && m1 === m2) return `${MONTHS_LONG[m1]} ${y1}`
    if (y1 === y2) return `${MONTHS[m1]}–${MONTHS[m2]} ${y1}`
    return `${MONTHS[m1]} ${y1} – ${MONTHS[m2]} ${y2}`
  }
  return y1 === y2 ? String(y1) : `${y1}–${y2}`
}

export function monthBands(columns: Column[]): Band[] {
  const bands: Band[] = []
  for (const col of columns) {
    const d = new Date(col.start)
    const id = `${d.getUTCFullYear()}-${d.getUTCMonth()}`
    const label = `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
    const last = bands[bands.length - 1]
    if (last && last.id === id) last.span += 1
    else bands.push({ id, label, startIndex: col.index, span: 1 })
  }
  return bands
}

export function yearBands(columns: Column[]): Band[] {
  const bands: Band[] = []
  for (const col of columns) {
    const year = new Date(col.start).getUTCFullYear()
    const id = `y-${year}`
    const last = bands[bands.length - 1]
    if (last && last.id === id) last.span += 1
    else bands.push({ id, label: String(year), startIndex: col.index, span: 1 })
  }
  return bands
}

export function columnForDate(columns: Column[], iso: string) {
  const t = utc(iso)
  return columns.find((col) => col.start <= t && t < col.end)
}

export function snapIso(ts: number) {
  return isoFromTs(Math.floor(ts / DAY_MS) * DAY_MS)
}

export function dateAtWorldX(zoom: Zoom, extentMin: number, colW: number, worldX: number) {
  const raw = worldX / colW
  const idx = extentMin + Math.floor(raw)
  const frac = raw - Math.floor(raw)
  const col = columnAtIndex(zoom, idx)
  const ts = col.start + Math.min(0.999999, Math.max(0, frac)) * (col.end - col.start)
  return snapIso(ts)
}

export function worldXForDate(zoom: Zoom, extentMin: number, colW: number, iso: string) {
  const ts = utc(iso)
  const idx = columnIndexAt(zoom, ts)
  const col = columnAtIndex(zoom, idx)
  const frac = col.end > col.start ? (ts - col.start) / (col.end - col.start) : 0
  return (idx - extentMin) * colW + frac * colW
}

export function barStyle(startIso: string, endIso: string, columns: Column[]) {
  const { start, end } = rangeOf(columns)
  const span = end - start
  if (span <= 0) return { left: '0%', width: '0%', visible: false as const, pxFrac: 0 }
  const a = Math.max(utc(startIso), start)
  const b = Math.min(utc(endIso) + DAY_MS, end)
  if (b <= a) return { left: '0%', width: '0%', visible: false as const, pxFrac: 0 }
  return {
    left: `${((a - start) / span) * 100}%`,
    width: `${((b - a) / span) * 100}%`,
    visible: true as const,
    pxFrac: (b - a) / span,
  }
}

export function activeDaySet(start: string, end: string, offDays?: string[]) {
  const off = new Set(offDays)
  const days = new Set<string>()
  for (let t = utc(start); t <= utc(end); t += DAY_MS) {
    const iso = isoFromTs(t)
    if (!off.has(iso)) days.add(iso)
  }
  return days
}

export function spanFromDays(days: Iterable<string>): Span {
  const sorted = [...days].sort()
  if (sorted.length === 0) return { start: DEMO_TODAY, end: DEMO_TODAY, offDays: [] }
  const start = sorted[0]!
  const end = sorted[sorted.length - 1]!
  const on = new Set(sorted)
  const offDays: string[] = []
  for (let t = utc(start); t <= utc(end); t += DAY_MS) {
    const iso = isoFromTs(t)
    if (!on.has(iso)) offDays.push(iso)
  }
  return { start, end, offDays }
}

export function activeSegments(start: string, end: string, offDays?: string[]) {
  const segs: { start: string; end: string }[] = []
  let segStart: string | null = null
  let prev: string | null = null
  const off = new Set(offDays)
  for (let t = utc(start); t <= utc(end); t += DAY_MS) {
    const iso = isoFromTs(t)
    if (off.has(iso)) {
      if (segStart && prev) segs.push({ start: segStart, end: prev })
      segStart = null
      prev = null
      continue
    }
    if (!segStart) segStart = iso
    prev = iso
  }
  if (segStart && prev) segs.push({ start: segStart, end: prev })
  return segs
}

export function shiftSpan(span: Span, deltaDays: number): Span {
  if (deltaDays === 0) return span
  return {
    start: addDays(span.start, deltaDays),
    end: addDays(span.end, deltaDays),
    offDays: span.offDays.map((d) => addDays(d, deltaDays)),
  }
}

export function resizeSpanEnd(span: Span, newEnd: string): Span {
  if (utc(newEnd) < utc(span.start)) return { ...span, end: span.start, offDays: span.offDays.filter((d) => d < span.start) }
  const offDays = span.offDays.filter((d) => d >= span.start && d <= newEnd)
  return { ...span, end: newEnd, offDays }
}

export function moveOneDay(span: Span, fromDay: string, toDay: string): Span {
  const days = activeDaySet(span.start, span.end, span.offDays)
  if (!days.has(fromDay) && fromDay !== toDay) return span
  days.delete(fromDay)
  days.add(toDay)
  return spanFromDays(days)
}

export function segmentIsSliver(start: string, end: string, zoom: Zoom) {
  const days = diffDays(start, end) + 1
  if (zoom === 'days') return days <= 1
  if (zoom === 'weeks') return days <= 2
  if (zoom === 'months') return days <= 3
  if (zoom === 'quarters') return days <= 10
  return days <= 14
}

export function formatRange(start: string, end: string) {
  const a = new Date(utc(start))
  const b = new Date(utc(end))
  const fa = `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()}`
  const fb = `${MONTHS[b.getUTCMonth()]} ${b.getUTCDate()}`
  return start === end ? fa : `${fa} – ${fb}`
}

export function formatDay(iso: string) {
  const d = new Date(utc(iso))
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

export function formatMoveRange(start: string, end: string) {
  if (start === end) return formatDay(start)
  const a = new Date(utc(start))
  const b = new Date(utc(end))
  return `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()} to ${MONTHS[b.getUTCMonth()]} ${b.getUTCDate()}`
}

export function workdaysInRange(start: number, end: number) {
  let n = 0
  for (let t = start; t < end; t += DAY_MS) {
    const day = new Date(t).getUTCDay()
    if (day !== 0 && day !== 6) n += 1
  }
  return n
}

export function workdaysOverlapping(startIso: string, endIso: string, window: TimeWindow, offDays?: string[]) {
  const off = new Set(offDays)
  const a = Math.max(utc(startIso), window.start)
  const b = Math.min(utc(endIso) + DAY_MS, window.end)
  if (b <= a) return 0
  let n = 0
  for (let t = a; t < b; t += DAY_MS) {
    const day = new Date(t).getUTCDay()
    if (day === 0 || day === 6) continue
    if (off.has(isoFromTs(t))) continue
    n += 1
  }
  return n
}

export function inTimeWindow(startIso: string, endIso: string, window?: TimeWindow) {
  if (!window) return true
  return utc(startIso) < window.end && utc(endIso) + DAY_MS > window.start
}

export function packLanes<T extends { id: string; start: string; end: string }>(items: T[], window?: TimeWindow) {
  const source = window ? items.filter((item) => inTimeWindow(item.start, item.end, window)) : items
  const sorted = [...source].sort((a, b) => utc(a.start) - utc(b.start) || utc(a.end) - utc(b.end))
  const laneEnds: number[] = []
  const laneById = new Map<string, number>()
  for (const item of sorted) {
    const start = utc(item.start)
    const end = utc(item.end) + DAY_MS
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

export function isDayZoom(zoom: Zoom) {
  return zoom === 'days'
}

export function isEditableZoom(zoom: Zoom) {
  return zoom === 'days' || zoom === 'weeks'
}
