import type { Zoom } from './data'

export const CLOSE_DATE_PICKER_EVENT = 'rc-close-date-picker'

const GUTTER_OR_SCROLLBAR = '.rc-gutter, .rc-gutter-head, .prod-gutter, .gantt-hscroll, .gantt-hscroll-thumb'
const TIMELINE_PANE = '.rc-scroll, .prod-scroll'

const ZOOM_BY_KEY: Record<string, Zoom> = {
  d: 'days',
  w: 'weeks',
  m: 'months',
  q: 'quarters',
  y: 'year',
}

export type CalendarShortcut =
  | { type: 'today' }
  | { type: 'prev' }
  | { type: 'next' }
  | { type: 'zoom'; zoom: Zoom }
  | { type: 'escape' }

export function isTextEntryTarget(target: EventTarget | null) {
  const el = target instanceof Element ? target : target instanceof Node ? target.parentElement : null
  if (!el) return false
  const host = el.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]')
  if (host instanceof HTMLSelectElement || host instanceof HTMLTextAreaElement) return true
  if (host instanceof HTMLElement && host.isContentEditable) return true
  if (host instanceof HTMLInputElement) {
    const type = host.type
    return type !== 'radio' && type !== 'checkbox' && type !== 'button' && type !== 'submit' && type !== 'reset'
  }
  return el instanceof HTMLElement && el.isContentEditable
}

export function isTimelineKeyTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  if (target.closest(GUTTER_OR_SCROLLBAR)) return false
  return Boolean(target.closest(TIMELINE_PANE))
}

export function tryFocusTimeline(target: EventTarget | null) {
  if (!(target instanceof Element)) return
  if (target.closest(GUTTER_OR_SCROLLBAR)) {
    const active = document.activeElement
    if (
      active instanceof HTMLElement &&
      active.closest(TIMELINE_PANE) &&
      !active.closest(GUTTER_OR_SCROLLBAR)
    ) {
      active.blur()
    }
    return
  }
  const pane = target.closest(TIMELINE_PANE)
  if (pane instanceof HTMLElement) pane.focus({ preventScroll: true })
}

export function blurTimeline(scrollEl: HTMLElement | null) {
  const active = document.activeElement
  if (active instanceof HTMLElement && (active === scrollEl || Boolean(scrollEl?.contains(active)))) {
    active.blur()
  }
}

export function matchCalendarShortcut(
  event: KeyboardEvent,
  opts: { timelineFocused: boolean },
): CalendarShortcut | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null
  if (event.key === 'Escape') return { type: 'escape' }
  if (event.key === 'ArrowLeft') return opts.timelineFocused ? { type: 'prev' } : null
  if (event.key === 'ArrowRight') return opts.timelineFocused ? { type: 'next' } : null
  if (event.key.length !== 1) return null
  const letter = event.key.toLowerCase()
  if (letter === 't') return { type: 'today' }
  if (letter === 'j' || letter === 'n') return { type: 'next' }
  if (letter === 'k' || letter === 'p') return { type: 'prev' }
  const zoom = ZOOM_BY_KEY[letter]
  return zoom ? { type: 'zoom', zoom } : null
}

export function closeDatePicker() {
  window.dispatchEvent(new Event(CLOSE_DATE_PICKER_EVENT))
}
