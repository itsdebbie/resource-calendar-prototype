import { useEffect, useMemo, useRef, useState } from 'react'
import type { TimeWindow } from './timeline'
import { isoFromTs } from './timeline'
import {
  EDGE_FETCH_DEBOUNCE_MS,
  MAX_CACHED_WEEKS,
  dataWindowFromWeeks,
  dedupeById,
  desiredWeekKeys,
  farthestWeek,
  type DatedItem,
} from './weekChunks'

type Options<T extends DatedItem> = {
  /** Clear the cache when this changes (schedule vs calendar, etc.). */
  resetKey?: string
  /** Edited / selected rows that must stay mounted even if their week was evicted. */
  pinned?: T[]
  omitIds?: Iterable<string>
}

export function useWeekChunks<T extends DatedItem>(
  viewWindow: TimeWindow,
  fetchWeek: (weekStart: string) => Promise<T[]>,
  options?: Options<T>,
) {
  const resetKey = options?.resetKey ?? ''
  const pinned = options?.pinned ?? []
  const omit = useMemo(() => new Set(options?.omitIds ?? []), [options?.omitIds])
  const [items, setItems] = useState<T[]>([])
  const [loadingWeeks, setLoadingWeeks] = useState<string[]>([])
  const [loadedWeeks, setLoadedWeeks] = useState<string[]>([])
  const cacheRef = useRef(new Map<string, T[]>())
  const inFlightRef = useRef(new Map<string, Promise<T[]>>())
  const fetchRef = useRef(fetchWeek)
  fetchRef.current = fetchWeek
  const omitRef = useRef(omit)
  omitRef.current = omit
  const pinnedRef = useRef(pinned)
  pinnedRef.current = pinned
  const viewRef = useRef(viewWindow)
  viewRef.current = viewWindow
  const genRef = useRef(0)

  const desired = useMemo(
    () => desiredWeekKeys(viewWindow, MAX_CACHED_WEEKS),
    [viewWindow.start, viewWindow.end],
  )
  const desiredKey = desired.join('|')

  const publish = () => {
    const skip = omitRef.current
    const byId = new Map<string, T>()
    for (const week of [...cacheRef.current.keys()].sort()) {
      const rows = cacheRef.current.get(week)
      if (!rows) continue
      for (const row of rows) {
        if (skip.has(row.id) || byId.has(row.id)) continue
        byId.set(row.id, row)
      }
    }
    for (const row of pinnedRef.current) {
      if (skip.has(row.id)) continue
      byId.set(row.id, row)
    }
    setItems(dedupeById([...byId.values()]))
    setLoadedWeeks([...cacheRef.current.keys()].sort())
    setLoadingWeeks([...inFlightRef.current.keys()].sort())
  }

  const evict = (centerIso: string, keep: Set<string>) => {
    while (cacheRef.current.size > MAX_CACHED_WEEKS) {
      const drop = farthestWeek(
        [...cacheRef.current.keys()].filter((key) => !keep.has(key) && !inFlightRef.current.has(key)),
        centerIso,
      )
      if (!drop) break
      cacheRef.current.delete(drop)
    }
  }

  useEffect(() => {
    genRef.current += 1
    cacheRef.current = new Map()
    inFlightRef.current = new Map()
    setItems([])
    setLoadedWeeks([])
    setLoadingWeeks([])
  }, [resetKey])

  useEffect(() => {
    const weeks = desired
    const keep = new Set(weeks)
    const gen = genRef.current
    const immediate = cacheRef.current.size === 0
    const delay = immediate ? 0 : EDGE_FETCH_DEBOUNCE_MS

    const loadWeek = (week: string) => {
      if (cacheRef.current.has(week) || inFlightRef.current.has(week)) return
      const pending = fetchRef
        .current(week)
        .then((rows) => {
          if (gen !== genRef.current) return rows
          cacheRef.current.set(week, rows)
          const center = isoFromTs((viewRef.current.start + viewRef.current.end) / 2)
          evict(center, keep)
          return rows
        })
        .finally(() => {
          inFlightRef.current.delete(week)
          if (gen === genRef.current) publish()
        })
      inFlightRef.current.set(week, pending)
    }

    const timer = window.setTimeout(() => {
      if (gen !== genRef.current) return
      for (const week of weeks) loadWeek(week)
      publish()
    }, delay)

    return () => {
      window.clearTimeout(timer)
    }
  }, [desiredKey, resetKey, desired])

  const conflictWindow = useMemo(() => {
    const weeks = desired.length ? desired : loadedWeeks
    const window = dataWindowFromWeeks(weeks)
    if (window.end > window.start) return window
    return viewWindow
  }, [desired, loadedWeeks, viewWindow])

  const loadingSet = useMemo(() => new Set(loadingWeeks), [loadingWeeks])

  const merged = useMemo(() => {
    const skip = omit
    const byId = new Map<string, T>()
    for (const row of items) {
      if (!skip.has(row.id)) byId.set(row.id, row)
    }
    for (const row of pinned) {
      if (!skip.has(row.id)) byId.set(row.id, row)
    }
    return dedupeById([...byId.values()])
  }, [items, pinned, omit])

  return {
    items: merged,
    loadingWeeks,
    loadingSet,
    loadedWeeks,
    desiredWeeks: desired,
    conflictWindow,
  }
}
