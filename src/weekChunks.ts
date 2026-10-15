import { assignments, type Assignment } from './data'
import type { ProdBar } from './prod/prodData'
import {
  DAY_MS,
  addDays,
  isoFromTs,
  startOfWeek,
  utc,
  type TimeWindow,
} from './timeline'

/** Keep at most this many Sunday-keyed weeks in memory. */
export const MAX_CACHED_WEEKS = 10
/** Weeks of data on each side of the visible window. */
export const WEEK_BUFFER = 1
/** Wait this long after the viewport settles before fetching the next chunk. */
export const EDGE_FETCH_DEBOUNCE_MS = 300
/** Mock network delay so loading weeks can show a skeleton. */
export const FETCH_LATENCY_MS = 360
/** Extra technician/project rows rendered above and below the viewport. */
export const ROW_RENDER_BUFFER = 6
export const ROW_ESTIMATE_PX = 48

export type DatedItem = { id: string; start: string; end: string }

export function weekKey(iso: string) {
  return startOfWeek(iso)
}

export function weekEndIso(weekStart: string) {
  return addDays(weekStart, 6)
}

export function overlapsWeek(start: string, end: string, weekStart: string) {
  const a = utc(weekStart)
  const b = a + 7 * DAY_MS
  return utc(start) < b && utc(end) + DAY_MS > a
}

export function enumerateWeeks(fromIso: string, toIso: string) {
  const keys: string[] = []
  let key = startOfWeek(fromIso)
  const last = utc(startOfWeek(toIso))
  while (utc(key) <= last) {
    keys.push(key)
    key = addDays(key, 7)
    if (keys.length > 520) break
  }
  return keys
}

export function weekKeysOverlapping(startIso: string, endIso: string) {
  if (utc(endIso) < utc(startIso)) return [startOfWeek(startIso)]
  return enumerateWeeks(startIso, endIso)
}

export function weekKeysForRange(startTs: number, endTs: number) {
  if (endTs <= startTs) return [startOfWeek(isoFromTs(startTs))]
  return enumerateWeeks(isoFromTs(startTs), isoFromTs(endTs - 1))
}

/**
 * Visible window plus one week on each side, capped at MAX_CACHED_WEEKS
 * and centered on the viewport when the visible span is wider than the cache.
 */
export function desiredWeekKeys(viewWindow: TimeWindow, maxWeeks = MAX_CACHED_WEEKS) {
  const viewStart = isoFromTs(viewWindow.start)
  const viewEnd = isoFromTs(Math.max(viewWindow.start, viewWindow.end - 1))
  const from = addDays(startOfWeek(viewStart), -WEEK_BUFFER * 7)
  const to = addDays(startOfWeek(viewEnd), WEEK_BUFFER * 7)
  const keys = enumerateWeeks(from, to)
  if (keys.length <= maxWeeks) return keys
  const center = startOfWeek(isoFromTs((viewWindow.start + viewWindow.end) / 2))
  const mid = Math.max(0, keys.indexOf(center))
  const start = Math.max(0, Math.min(mid - Math.floor(maxWeeks / 2), keys.length - maxWeeks))
  return keys.slice(start, start + maxWeeks)
}

export function dataWindowFromWeeks(weeks: string[]): TimeWindow {
  if (weeks.length === 0) return { start: 0, end: 0 }
  const first = weeks[0]!
  const last = weeks[weeks.length - 1]!
  return { start: utc(first), end: utc(last) + 7 * DAY_MS }
}

export function farthestWeek(keys: string[], centerIso: string) {
  const center = utc(startOfWeek(centerIso))
  let best: string | undefined
  let bestDist = -1
  for (const key of keys) {
    const dist = Math.abs(utc(key) - center)
    if (dist >= bestDist) {
      bestDist = dist
      best = key
    }
  }
  return best
}

export function columnWeekLoading(startTs: number, endTs: number, loadingWeeks: Iterable<string>) {
  const loading = loadingWeeks instanceof Set ? loadingWeeks : new Set(loadingWeeks)
  if (loading.size === 0) return false
  return weekKeysForRange(startTs, endTs).some((key) => loading.has(key))
}

/**
 * True when the overlapping weeks in `window` that have settled (not in-flight)
 * are all cached. In-flight neighbor weeks keep existing bars on screen; a range
 * with only in-flight weeks stays hidden so the cell skeleton can show.
 */
export function rangeReadyInWindow(
  startIso: string,
  endIso: string,
  loadedWeeks: Iterable<string>,
  loadingWeeks: Iterable<string>,
  window: TimeWindow,
) {
  if (window.end <= window.start) return false
  const from = Math.max(utc(startIso), window.start)
  const to = Math.min(utc(endIso) + DAY_MS, window.end)
  if (to <= from) return false
  const loaded = loadedWeeks instanceof Set ? loadedWeeks : new Set(loadedWeeks)
  const loading = loadingWeeks instanceof Set ? loadingWeeks : new Set(loadingWeeks)
  const weeks = weekKeysForRange(from, to)
  if (weeks.length === 0) return false
  const settled = weeks.filter((week) => !loading.has(week))
  if (settled.length === 0) return false
  return settled.every((week) => loaded.has(week))
}

export function mockLatency() {
  return FETCH_LATENCY_MS
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/** Filter the placeholder catalog by week overlap. Far weeks return empty. */
export async function fetchAssignmentWeek(weekStart: string): Promise<Assignment[]> {
  await wait(mockLatency())
  return assignments.filter((row) => overlapsWeek(row.start, row.end, weekStart))
}

export async function fetchProdBarWeek(source: ProdBar[], weekStart: string): Promise<ProdBar[]> {
  await wait(mockLatency())
  return source.filter((bar) => overlapsWeek(bar.start, bar.end, weekStart)).map((bar) => ({ ...bar }))
}

export function dedupeById<T extends { id: string }>(items: T[]) {
  const map = new Map<string, T>()
  for (const item of items) {
    if (!map.has(item.id)) map.set(item.id, item)
  }
  return [...map.values()]
}

export function visibleRowWindow(count: number, scrollTop: number, viewportH: number, rowH: number, buffer = ROW_RENDER_BUFFER) {
  if (count <= 0) return { start: 0, end: -1, padTop: 0, padBottom: 0 }
  const start = Math.max(0, Math.floor(Math.max(0, scrollTop) / rowH) - buffer)
  const end = Math.min(count - 1, Math.ceil((Math.max(0, scrollTop) + Math.max(rowH, viewportH)) / rowH) + buffer)
  return {
    start,
    end,
    padTop: start * rowH,
    padBottom: Math.max(0, (count - end - 1) * rowH),
  }
}

export function visibleRowWindowHeights(
  heights: number[],
  scrollTop: number,
  viewportH: number,
  buffer = ROW_RENDER_BUFFER,
) {
  const count = heights.length
  if (count === 0) return { start: 0, end: -1, padTop: 0, padBottom: 0 }
  const tops: number[] = new Array(count)
  let acc = 0
  for (let i = 0; i < count; i++) {
    tops[i] = acc
    acc += heights[i] ?? ROW_ESTIMATE_PX
  }
  const total = acc
  const viewStart = Math.max(0, scrollTop)
  const viewEnd = viewStart + Math.max(ROW_ESTIMATE_PX, viewportH)
  let start = 0
  while (start < count - 1 && (tops[start]! + (heights[start] ?? 0)) < viewStart) start += 1
  let end = start
  while (end < count - 1 && tops[end]! < viewEnd) end += 1
  start = Math.max(0, start - buffer)
  end = Math.min(count - 1, end + buffer)
  const padTop = tops[start] ?? 0
  const padBottom = Math.max(0, total - padTop - heights.slice(start, end + 1).reduce((sum, h) => sum + h, 0))
  return { start, end, padTop, padBottom }
}
