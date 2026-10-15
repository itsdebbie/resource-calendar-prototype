import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Zoom } from './data'
import { DAY_VIEW_DAYS, addExtendBuffer, extendBoundsAfterDrop, type ExtendEdge } from './interaction'
import { addDays, utc, type TimeWindow } from './timeline'

export type ScrollDemoMode = 'clip' | 'extend'

type ScrollDemoValue = {
  mode: ScrollDemoMode
  setMode: (mode: ScrollDemoMode) => void
}

const ScrollDemoContext = createContext<ScrollDemoValue | null>(null)

export function ScrollDemoProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ScrollDemoMode>('extend')
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
export function initialExtendBounds(todayIso: string, items: { start: string; end: string }[], visibleDays = DAY_VIEW_DAYS) {
  const data = spanBounds(items)
  const viewEnd = addDays(todayIso, visibleDays - 1)
  const start = data && data.start < todayIso ? data.start : todayIso
  const end = data && data.end > viewEnd ? data.end : viewEnd
  return { start, end }
}

export function growBoundToward(iso: string, prevIso: string, edge: ExtendEdge) {
  if (edge === 'end') return utc(iso) > utc(prevIso) ? iso : prevIso
  return utc(iso) < utc(prevIso) ? iso : prevIso
}

export function applyExtendOnDrop(
  barStartIso: string,
  barEndIso: string,
  boundStartIso: string,
  boundEndIso: string,
  zoom: Zoom,
  viewWindow: TimeWindow,
  hitEdge: ExtendEdge | null,
) {
  return extendBoundsAfterDrop(barStartIso, barEndIso, boundStartIso, boundEndIso, zoom, viewWindow, hitEdge)
}

/** @deprecated Use applyExtendOnDrop. Kept so older call sites typecheck during the swap. */
export function extendEndAfterDrop(barEndIso: string, timelineEndIso: string, _viewWindow: TimeWindow) {
  const next = addExtendBuffer(barEndIso, 'days', 1)
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
      <p className="proto-scroll-kicker">Infinite scroll is dropped. Extend-on-drop is locked. Not a product setting.</p>
      <button
        type="button"
        className={`proto-scroll-option${mode === 'clip' ? ' is-on' : ''}`}
        aria-pressed={mode === 'clip'}
        onClick={() => setMode('clip')}
      >
        Stop at edge
      </button>
      <button
        type="button"
        className={`proto-scroll-option${mode === 'extend' ? ' is-on' : ''}`}
        aria-pressed={mode === 'extend'}
        onClick={() => setMode('extend')}
      >
        Extend on drop
      </button>
    </aside>
  )
}
