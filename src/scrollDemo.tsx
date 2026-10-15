import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { addDays, DAY_MS, utc, type TimeWindow } from './timeline'

export type ScrollDemoMode = 'infinite' | 'extend'

/** Days added past a dropped bar’s end in Version B. From Jade’s verbal note, not Smartsheet docs. */
export const EXTEND_ON_DROP_DAYS = 10

type ScrollDemoValue = {
  mode: ScrollDemoMode
  setMode: (mode: ScrollDemoMode) => void
}

const ScrollDemoContext = createContext<ScrollDemoValue | null>(null)

export function ScrollDemoProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ScrollDemoMode>('infinite')
  const value = useMemo(() => ({ mode, setMode }), [mode])
  return <ScrollDemoContext.Provider value={value}>{children}</ScrollDemoContext.Provider>
}

export function useScrollDemo() {
  const ctx = useContext(ScrollDemoContext)
  if (!ctx) throw new Error('ScrollDemo context missing')
  return ctx
}

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
export function initialExtendBounds(todayIso: string, items: { start: string; end: string }[], visibleDays = 14) {
  const data = spanBounds(items)
  const viewEnd = addDays(todayIso, visibleDays - 1)
  const start = data && data.start < todayIso ? data.start : todayIso
  const end = data && data.end > viewEnd ? data.end : viewEnd
  return { start, end }
}

export function shouldExtendOnDrop(barEndIso: string, timelineEndIso: string, viewWindow: TimeWindow) {
  const barEnd = utc(barEndIso) + DAY_MS
  const timelineEnd = utc(timelineEndIso) + DAY_MS
  const visible = Math.max(DAY_MS, viewWindow.end - viewWindow.start)
  return barEnd >= timelineEnd || utc(barEndIso) >= timelineEnd - visible
}

export function extendEndAfterDrop(barEndIso: string, timelineEndIso: string, viewWindow: TimeWindow) {
  if (!shouldExtendOnDrop(barEndIso, timelineEndIso, viewWindow)) return timelineEndIso
  const next = addDays(barEndIso, EXTEND_ON_DROP_DAYS)
  return utc(next) > utc(timelineEndIso) ? next : timelineEndIso
}

/** Clip a bar to the visible timeline so it never paints over the sticky name pane. */
export function barClipPath(leftPx: number, widthPx: number, viewLeft: number, viewPx: number) {
  const overflowLeft = Math.max(0, viewLeft - leftPx)
  const overflowRight = Math.max(0, leftPx + widthPx - (viewLeft + viewPx))
  if (overflowLeft <= 0 && overflowRight <= 0) return undefined
  return `inset(0 ${overflowRight}px 0 ${overflowLeft}px)`
}

export function PrototypeScrollSwitch() {
  const { mode, setMode } = useScrollDemo()
  return (
    <aside className="proto-scroll-switch" aria-label="Prototype scroll comparison">
      <span className="proto-tag">Prototype</span>
      <p className="proto-scroll-kicker">Compare drag-scroll versions. Not a product setting.</p>
      <label className="proto-scroll-option">
        <input
          type="radio"
          name="proto-scroll-mode"
          checked={mode === 'infinite'}
          onChange={() => setMode('infinite')}
        />
        Version A: infinite scroll
      </label>
      <label className="proto-scroll-option">
        <input type="radio" name="proto-scroll-mode" checked={mode === 'extend'} onChange={() => setMode('extend')} />
        Version B: extend on drop
      </label>
    </aside>
  )
}
