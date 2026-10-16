import type { Zoom } from './data'
import {
  DAY_MS,
  DAY_VIEW_DAYS,
  addDays,
  columnAtIndex,
  columnIndexAt,
  isoFromTs,
  startOfMonth,
  startOfWeek,
  utc,
} from './timeline'

export { DAY_VIEW_DAYS }

export function spanBounds(items: { start: string; end: string }[]) {
  if (items.length === 0) return null
  let start = items[0]!.start
  let end = items[0]!.end
  for (const item of items) {
    if (item.start < start) start = item.start
    if (item.end > end) end = item.end
  }
  return { start, end }
}

/** Union of the opening visible range and the placeholder data span. */
export function initialExtendBounds(todayIso: string, items: { start: string; end: string }[], visibleDays = DAY_VIEW_DAYS) {
  const data = spanBounds(items)
  const viewEnd = addDays(todayIso, visibleDays - 1)
  const start = data && data.start < todayIso ? data.start : todayIso
  const end = data && data.end > viewEnd ? data.end : viewEnd
  return { start, end }
}

/**
 * Extend-on-drop buffers, same magnitude forward and back.
 * Month and Year values are assumptions (see INTERACTION-LOGIC.md).
 */
export const EXTEND_BUFFER = {
  days: { cols: 21, unit: 'days', source: 'jade' as const },
  weeks: { cols: 9, unit: 'weeks', source: 'jade' as const },
  /** ASSUMPTION — month buffer was not specified in review. */
  months: { cols: 4, unit: 'months', source: 'assumption' as const },
  /**
   * Jade Vasun: ~16 months each way. A quarter column is 3 months, so 16 months
   * is stored as months and converted through the calendar, not 5–6 columns.
   */
  quarters: { cols: 16, unit: 'months', source: 'jade' as const },
  /** ASSUMPTION — year buffer was not specified in review. */
  year: { cols: 2, unit: 'years', source: 'assumption' as const },
} as const

export type ExtendEdge = 'start' | 'end'

/**
 * Anvil 2 duration tokens (`--a2-duration-default` / `--a2-duration-fast`).
 * Instant (0ms) and slow (300ms) exist in the token set but are unused here.
 */
export const MOTION_DURATION_DEFAULT = 'var(--a2-duration-default, 200ms)'
export const MOTION_DURATION_FAST = 'var(--a2-duration-fast, 100ms)'
/** Milliseconds for `--a2-duration-default` (200ms). Used to animate period-arrow pans. */
export const MOTION_DURATION_DEFAULT_MS = 200
/**
 * ASSUMPTION: Anvil 2 has no easing tokens in the product guidance we were
 * given, so snaps and settles use CSS `ease-out`.
 */
export const MOTION_EASING = 'ease-out'

/** Horizontal pan delta from a wheel event. Shift+vertical becomes time pan. */
export function wheelPanDelta(
  event: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode' | 'shiftKey' | 'ctrlKey' | 'metaKey'>,
  treatDeltaYAsPan = false,
) {
  if (event.ctrlKey || event.metaKey) return 0
  const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1
  const x = event.deltaX * scale
  const y = event.deltaY * scale
  if (event.shiftKey || treatDeltaYAsPan) return Math.abs(x) >= Math.abs(y) ? x : y
  return x
}

export function addCalendarMonths(iso: string, months: number) {
  const d = new Date(utc(iso))
  const day = d.getUTCDate()
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  return isoFromTs(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, last)))
}

/** Shift `iso` by the locked extend buffer. `dir` is +1 (forward) or -1 (back). */
export function addExtendBuffer(iso: string, zoom: Zoom, dir: 1 | -1) {
  const spec = EXTEND_BUFFER[zoom]
  if (spec.unit === 'days') return addDays(iso, dir * spec.cols)
  if (spec.unit === 'weeks') return addDays(iso, dir * spec.cols * 7)
  if (spec.unit === 'months') return addCalendarMonths(iso, dir * spec.cols)
  return addCalendarMonths(iso, dir * spec.cols * 12)
}

function clampIso(iso: string, minIso: string, maxIso: string) {
  if (utc(iso) < utc(minIso)) return minIso
  if (utc(iso) > utc(maxIso)) return maxIso
  return iso
}

/**
 * One-drag travel box: buffer past the bar's current start (left) and end (right),
 * not the timeline's old range edge (Jade Vasun / Smartsheet).
 */
export function dragTravelLimits(startIso: string, endIso: string, zoom: Zoom) {
  return {
    minStart: addExtendBuffer(startIso, zoom, -1),
    maxEnd: addExtendBuffer(endIso, zoom, 1),
  }
}

/**
 * Clamp a proposed span to one zoom buffer past the snapshot bar.
 * Move keeps duration. Resize clamps the moving edge only. Day-segment
 * clamps the destination date into the same box.
 */
export function clampDragSpan(
  snapshot: { start: string; end: string },
  next: { start: string; end: string },
  zoom: Zoom,
  kind: 'move' | 'resize' | 'day' = 'resize',
): { start: string; end: string; atStartLimit: boolean; atEndLimit: boolean } {
  const { minStart, maxEnd } = dragTravelLimits(snapshot.start, snapshot.end, zoom)
  const snapDur = utc(snapshot.end) - utc(snapshot.start)
  let start = next.start
  let end = next.end
  if (kind === 'move') {
    if (utc(end) > utc(maxEnd)) {
      end = maxEnd
      start = isoFromTs(utc(end) - snapDur)
    }
    if (utc(start) < utc(minStart)) {
      start = minStart
      end = isoFromTs(utc(start) + snapDur)
    }
  } else {
    start = clampIso(start, minStart, kind === 'day' ? maxEnd : snapshot.end)
    end = clampIso(end, kind === 'day' ? minStart : snapshot.start, maxEnd)
    if (utc(start) > utc(end)) {
      if (utc(next.start) !== utc(snapshot.start)) start = end
      else end = start
    }
  }
  return {
    start,
    end,
    atStartLimit: utc(start) <= utc(minStart),
    atEndLimit: utc(end) >= utc(maxEnd),
  }
}

/** Clamp a pointer date used for day-segment edits to the same one-drag box. */
export function clampDragIso(snapshot: { start: string; end: string }, iso: string, zoom: Zoom) {
  const { minStart, maxEnd } = dragTravelLimits(snapshot.start, snapshot.end, zoom)
  return clampIso(iso, minStart, maxEnd)
}

/**
 * Columns to keep past each visible edge while panning, and to grow by when the
 * thumb/wheel nears an end. Quarter stores ~16 months as 6 quarter columns.
 */
export function padColumns(zoom: Zoom) {
  if (zoom === 'days') return EXTEND_BUFFER.days.cols
  if (zoom === 'weeks') return EXTEND_BUFFER.weeks.cols
  if (zoom === 'months') return EXTEND_BUFFER.months.cols
  if (zoom === 'quarters') return Math.ceil(EXTEND_BUFFER.quarters.cols / 3)
  return EXTEND_BUFFER.year.cols
}

/** One column of the current zoom, used to grow bounds while auto-scrolling. */
export function addOneColumn(iso: string, zoom: Zoom, dir: 1 | -1) {
  const idx = columnIndexAt(zoom, utc(iso))
  const col = columnAtIndex(zoom, idx + dir)
  return dir > 0 ? isoFromTs(col.end - DAY_MS) : isoFromTs(col.start)
}

export function snapDragIso(zoom: Zoom, iso: string, edge: 'start' | 'end' | 'point' = 'point') {
  if (zoom === 'days' || zoom === 'weeks') return iso
  if (zoom === 'months') {
    const week = startOfWeek(iso)
    return edge === 'end' ? addDays(week, 6) : week
  }
  const month = startOfMonth(iso)
  if (edge === 'end') {
    const d = new Date(utc(month))
    return isoFromTs(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
  }
  return month
}

export function shouldExtendEdge(
  barEdgeIso: string,
  timelineEdgeIso: string,
  edge: ExtendEdge,
  viewWindow: { start: number; end: number },
) {
  const bar = utc(barEdgeIso)
  const bound = utc(timelineEdgeIso)
  const visible = Math.max(DAY_MS, viewWindow.end - viewWindow.start)
  if (edge === 'end') {
    if (bar + DAY_MS >= bound) return true
    return bar + DAY_MS >= bound - visible && viewWindow.end >= bound - DAY_MS
  }
  if (bar <= bound) return true
  return bar <= bound + visible && viewWindow.start <= bound + DAY_MS
}

export function extendBoundsAfterDrop(
  barStartIso: string,
  barEndIso: string,
  boundStartIso: string,
  boundEndIso: string,
  zoom: Zoom,
  viewWindow: { start: number; end: number },
  hitEdge: ExtendEdge | null,
) {
  let start = boundStartIso
  let end = boundEndIso
  if (hitEdge === 'start' || shouldExtendEdge(barStartIso, boundStartIso, 'start', viewWindow)) {
    const next = addExtendBuffer(barStartIso, zoom, -1)
    if (utc(next) < utc(start)) start = next
  }
  if (hitEdge === 'end' || shouldExtendEdge(barEndIso, boundEndIso, 'end', viewWindow)) {
    const next = addExtendBuffer(barEndIso, zoom, 1)
    if (utc(next) > utc(end)) end = next
  }
  return { start, end }
}
