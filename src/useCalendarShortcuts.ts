import { useEffect, useRef } from 'react'
import type { Zoom } from './data'
import {
  closeDatePicker,
  isTextEntryTarget,
  isTimelineKeyTarget,
  matchCalendarShortcut,
} from './shortcuts'

type CalendarShortcutHandlers = {
  goToday: () => void
  panPrev: () => void
  panNext: () => void
  setZoom: (zoom: Zoom) => void
  zoomIn: () => void
  zoomOut: () => void
  cancelDrag: () => boolean
  interceptKey?: (event: KeyboardEvent) => boolean
}

export function useCalendarShortcuts(handlers: CalendarShortcutHandlers) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.isComposing) return
      const isEsc = event.key === 'Escape'
      if (!isEsc && isTextEntryTarget(event.target)) return
      if (handlersRef.current.interceptKey?.(event)) return
      const action = matchCalendarShortcut(event, {
        timelineFocused: isTimelineKeyTarget(document.activeElement) || isTimelineKeyTarget(event.target),
      })
      if (!action) return
      const current = handlersRef.current
      if (action.type === 'escape') {
        if (current.cancelDrag()) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        if (document.querySelector('.rc-date-pop')) {
          event.preventDefault()
          event.stopPropagation()
          closeDatePicker()
        }
        return
      }
      if (isTextEntryTarget(event.target)) return
      event.preventDefault()
      if (action.type === 'today') current.goToday()
      else if (action.type === 'prev') current.panPrev()
      else if (action.type === 'next') current.panNext()
      else if (action.type === 'zoomIn') current.zoomIn()
      else if (action.type === 'zoomOut') current.zoomOut()
      else current.setZoom(action.zoom)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
}
