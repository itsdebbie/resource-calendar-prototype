# Interaction logic (locked 15 Oct 2026)

Engineer-facing rules for `#/` (redesign), `#/prod/schedule`, and `#/prod/calendar`. Locked 15 Oct 2026 by Debbie Pan (with Jade Vasun on buffers). Code lives in `src/interaction.ts`, `src/useTimelineScroll.ts`, `src/timeline.ts`.

Infinite scroll is **dropped**. The timeline is finite and grows with **extend-on-drop** in both directions.

## Day viewport

Day zoom targets **21 day columns** (~3 weeks) in the visible timeline, not 14.

- `DAY_VIEW_DAYS = 21`
- `columnWidth('days')` ≈ `viewportPx / 21`
- Same density on redesign and prod

## Date picker

Fixed-width control (`PICKER_LABEL_SIZER`, currently `Sep 30 to Oct 20, 2026`). Label does not jump between zooms.

| Zoom | Label | Range |
| --- | --- | --- |
| Day | `Oct 15 to Nov 4, 2026` (short `to`, no weekday) | Visible day columns (~**21 days**) |
| Week | `Oct 12 to Nov 8, 2026` | First through last **visible week column** (not a hardcoded 14 days) |
| Month | `Oct 2026` | Calendar month |
| Quarter | `Q4 2026` | Calendar quarter |
| Year | `2026` | Calendar year |

The popover still snaps Day/Week to the first visible week unless a picked date is still in that week (`pickerAnchorStart`). The chip **label** follows the columns on screen (`visibleColumnRange`).

## Extend-on-drop buffers

Same magnitude **forward and backward**. After a drag **reaches an edge and drops**, the timeline grows by the buffer **past that drop edge** (bar start on the left, bar end on the right). New grid columns/headers are painted; the viewport is not jumped, so the canvas does not flicker or go blank.

| Zoom | Buffer each way |
| --- | --- |
| Day | +21 days |
| Week | +9 weeks |
| Month | +4 months |
| Quarter | ~16 months (16 calendar months, not 5 quarter columns) |
| Year | +2 years |

**ASSUMPTION:** Month (+4 months) and Year (+2 years) were not specified in review.

Algorithm (`extendBoundsAfterDrop`):

1. While dragging, if auto-scroll hits the current start/end bound, grow that bound by **one zoom column** so edge scrolling stays continuous.
2. On drop, if the pointer hit an edge **or** the bar edge sits in the last visible window of that bound, set:
   - `boundStart = min(boundStart, addExtendBuffer(barStart, zoom, -1))`
   - `boundEnd = max(boundEnd, addExtendBuffer(barEnd, zoom, +1))`
3. Re-render columns for the new extent. Keep `scrollLeft` (compensate if `extent.min` moved). Do not jump to the new end.

Opening finite range = today’s visible window ∪ placeholder data span.

## Snap while dragging / resizing

| Zoom | Snap unit |
| --- | --- |
| Day | Day |
| Week | Day |
| Month | Week (start of week; resize-end → last day of that week) |
| Quarter | Month (start of month; resize-end → last day of that month) |
| Year | Month (same as quarter) |

Move keeps duration: delta is `snap(pointer) − snap(origin)`. Live date label follows the snapped range at every zoom.

## Which edits per zoom

| Zoom | Body drag | Resize handles | Day-segment / single-day edit |
| --- | --- | --- | --- |
| Day | Day-segment (whole-bar move via double-click / top strip, unchanged) | Both edges, on hover | **Yes — Day only** |
| Week | Whole bar | Both edges, on hover | No |
| Month | Whole bar | Both edges, on hover | No |
| Quarter | Whole bar | Both edges, on hover | No |
| Year | Whole bar | Both edges, on hover | No |

Move **and** resize are enabled in **all five zooms**. Selection ring sits on an unclipped wrapper (Anvil info/selected `--a2-status-color-info` / `#0265dc`), so `clip-path` on the bar fill cannot hide it.

## Motion

Use **Anvil 2 duration tokens only**:

- Default: `--a2-duration-default` → **200ms** (extend settle, hover chrome)
- Fast: `--a2-duration-fast` → **100ms** (post-drop snap of bar left/width)
- Do **not** transition `left`/`width` while `.is-dragging` (lag)

**ASSUMPTION:** Anvil 2 has no easing tokens in the design guidance. Snaps use CSS `ease-out`.

## Smoothness rules

- No infinite scroll grow/slide.
- No post-drop `scrollLeft = scrollWidth` jump (that blanked the right side).
- `publishWindow` stays in sync with native pan so sliced columns never leave a void.
- Edge auto-scroll (`EDGE_SCROLL_*`) keeps running while the pointer is in the zone; hitting a bound grows that bound by a column instead of stalling.
- Picker width is sizer-locked so the toolbar does not thrash on zoom/scroll.
- Resize hit targets stay active on both edges (12px); the glyph fades in on hover.

## Prod chrome

Unchanged ports, still inside the **existing** prod toolbar:

- Both prod routes: Day–Year zoom + redesign `DateJumpPicker` next to Today
- `#/prod/calendar` only: People vs Projects
- `#/prod/schedule`: no People vs Projects
