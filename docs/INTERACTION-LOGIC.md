# Interaction logic (locked 15 Oct 2026)

Engineer-facing rules for `#/` (redesign), `#/prod/schedule`, and `#/prod/calendar`. Locked 15 Oct 2026 by Debbie Pan (with Jade Vasun on buffers). Code lives in `src/interaction.ts`, `src/useTimelineScroll.ts`, `src/timeline.ts`.

There is **no prototype mode switch**. Two rules are always on:

1. **Plain pan is infinite** (trackpad, Shift+wheel, scrollbar).
2. **Drag / resize is not infinite** — one zoom buffer per gesture, measured from the bar.

## Continuous pan

Plain horizontal pan (trackpad swipe, Shift+mouse wheel, scrollbar thumb/track) never hits a wall. The sliding extent grows in the pan direction as the viewport or thumb nears either end, so columns keep filling the timeline and the range never dead-ends.

- Day viewport still targets **21 day columns** (`DAY_VIEW_DAYS`).
- Grid columns never end with blank space on the left or right.
- Grow amount is the zoom buffer (`padColumns`): Day 21, Week 9, Month 4, Quarter 6 (~16 months), Year 2.
- A visible horizontal scrollbar is pinned at the bottom of the timeline viewport on every route and zoom. Dragging the thumb or clicking the track pans time and extends the range the same way.
- Trackpad `deltaX` and **Shift+wheel** both call `scrollBy` (the Shift+wheel event is consumed so the browser cannot swallow it). Wheel over the date header or the bottom scrollbar also pans time (`deltaY` counts there). JS/CSS assets use hashed filenames (`assets/index-<hash>.js`).

## Day viewport

Day zoom targets **21 day columns** (~3 weeks) in the visible timeline, not 14.

- `DAY_VIEW_DAYS = 21`
- `columnWidth('days')` ≈ `viewportPx / 21`
- Same density on redesign and prod

## Date picker

Fixed-width control (`PICKER_LABEL_SIZER`, currently `Sep 30 to Oct 20, 2026`). Label does not jump between zooms.

| Zoom | Label | Range |
| --- | --- | --- |
| Day | `Oct 15 to Nov 4, 2026` (short `to`, no weekday) | First through last **visible day column** (~**21 days**) |
| Week | `Oct 12 to Nov 8, 2026` | First through last **visible week column** (not a hardcoded 14 days) |
| Month | `Oct 2026` | Calendar month |
| Quarter | `Q4 2026` | Calendar quarter |
| Year | `2026` | Calendar year |

The popover still snaps Day/Week to the first visible week unless a picked date is still in that week (`pickerAnchorStart`). The chip **label** follows the columns on screen (`visibleColumnRange` from `firstVisible` / `lastVisible`) and updates while scrolling.

## Drag / resize limit (not infinite)

Same magnitude **forward and backward**. During **one** drag or resize, the bar can travel only this far past **where that bar currently ends** (right) or **starts** (left) — Jade Vasun: Smartsheet gives the buffer “from wherever it ends,” not from the old timeline range edge.

| Zoom | Buffer each way |
| --- | --- |
| Day | +21 days |
| Week | +9 weeks |
| Month | +4 months |
| Quarter | ~16 months (16 calendar months, not 5 quarter columns) |
| Year | +2 years |

**ASSUMPTION:** Month (+4 months) and Year (+2 years) were not specified in review.

Rules (`clampDragSpan` / `dragTravelLimits`):

1. Snapshot the bar’s start and end when the pointer goes down.
2. Limit box = `[addExtendBuffer(start, zoom, −1), addExtendBuffer(end, zoom, +1)]`.
3. Move keeps duration and clamps the whole bar into that box. Resize clamps the moving edge. The live date label shows the **clamped** range.
4. Edge auto-scroll while dragging **stops** when the bar/handle hits that limit. The bar does not pass it.
5. After drop, the snapshot resets. The next drag may travel another buffer from the new start/end. Plain pan stays infinite.

On drop, the canvas still `includeRange`s the clamped bar (and may pad) so the drop is visible. The viewport is not jumped.

## Snap while dragging / resizing

| Zoom | Snap unit |
| --- | --- |
| Day | Day |
| Week | Day |
| Month | Week (start of week; resize-end → last day of that week) |
| Quarter | Month (start of month; resize-end → last day of that month) |
| Year | Month (same as quarter) |

Move keeps duration: delta is `snap(pointer) − snap(origin)`, then clamped to the one-drag buffer. Live date label follows the **clamped** range at every zoom.

## Which edits per zoom

| Zoom | Body drag | Resize handles | Day-segment / single-day edit |
| --- | --- | --- | --- |
| Day | Day-segment (whole-bar move via double-click / top strip, unchanged) | Both edges, on hover | **Yes — Day only** |
| Week | Whole bar | Both edges, on hover | No |
| Month | Whole bar | Both edges, on hover | No |
| Quarter | Whole bar | Both edges, on hover | No |
| Year | Whole bar | Both edges, on hover | No |

Move **and** resize are enabled in **all five zooms**, including Year. Selection ring sits on the wrapper so clipping the bar fill cannot hide it.

## Left pane (WBS / Name)

Bars never paint under the sticky left gutter. The bar wrap is clipped to the timeline (`clipBarToGutter`) so the visible left edge — and its resize handle — sits in the timeline, not under the name pane. Grab/drop sensitivity is the same on the left as the right.

## Weekends

Weekends are **off by default** in Week and coarser zooms. The hatch always shows in Day, or when **Show Weekends** is on (`weekendsVisible`).

## Motion

Use **Anvil 2 duration tokens only**:

- Default: `--a2-duration-default` → **200ms** (extend settle, hover chrome)
- Fast: `--a2-duration-fast` → **100ms** (post-drop snap of bar left/width)
- Do **not** transition `left`/`width` while `.is-dragging` (lag)

**ASSUMPTION:** Anvil 2 has no easing tokens in the design guidance. Snaps use CSS `ease-out`.

## Smoothness rules

- Continuous pan grows the extent before the thumb or wheel can dead-end (`scrollBy` / `fillAndGrow`, including Shift+wheel).
- No post-drop `scrollLeft = scrollWidth` jump (that blanked the right side).
- `publishWindow` stays in sync with native pan so sliced columns never leave a void.
- Edge auto-scroll (`EDGE_SCROLL_*`) runs while the pointer is in the zone **and** the bar has not hit the one-drag buffer limit.
- Picker width is sizer-locked so the toolbar does not thrash on zoom/scroll.
- Resize hit targets stay active on both edges (12px); the glyph fades in on hover.

## Prod chrome

Unchanged ports, still inside the **existing** prod toolbar:

- Both prod routes: Day–Year zoom + redesign `DateJumpPicker` next to Today
- `#/prod/calendar` only: People vs Projects
- `#/prod/schedule`: no People vs Projects
