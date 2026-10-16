# Resource Calendar prototype

Interactive Anvil2 prototype of the signed-off Group by Projects resource calendar (Debbie Pan, 9 Oct 2026). A separate **prod + scroll** page (`#/prod/schedule`, `#/prod/calendar`) recreates today’s production Schedule tab and Resource Calendar chrome.

Engineer-facing interaction rules (continuous pan, one-drag buffer, snap, edits per zoom, Day viewport, motion) are in **[docs/INTERACTION-LOGIC.md](docs/INTERACTION-LOGIC.md)**.

- Horizontal timeline opens on today. **Continuous pan** never hits a wall (trackpad, Shift+wheel, always-visible scrollbar). Toolbar **‹ ›** after Today pan by one visible span (Day ~3 weeks; ASSUMPTION — Debbie approved the arrows, step size is our call). **Drag / resize is not infinite:** in one gesture the bar can travel only the zoom buffer past its current start (left) or end (right). After drop, drag again for another buffer. Drag/move and resize work in **Day, Week, Month, Quarter, and Year**.
- Default **Day** zoom shows **~3 weeks** (21 day columns). Zoom Day → Week → Month → Quarter → Year from the segmented control, `+`/`-`, or pinch / ⌘ or Ctrl + scroll.
- Projects view has sticky project rows, Budget / Sched. / Actual columns (blank unless booked or logged), and an optional crew panel (folded by default, remembered in `localStorage`). Trackpad, Shift+wheel, and drag on the crew strip pan the same timeline.
- People view has sticky person rows. The crew panel is hidden.
- Bars use solid Figma project **500** fills with WCAG-picked text and icons. Confirmed bookings show a calendar-check. Unassigned uses Anvil Neutral 500 (`#707070`) and **Needs a tech · 40h**. Hover tooltips pin at the pointer’s x when the hover starts, then stay put (Anvil flip/shift keeps them on screen).
- Short bars that share a week merge into an **N bookings · Xh** chip at Month zoom and finer. Quarter and Year short bars are color only.
- Weekends are off by default in Week and coarser zooms. The hatch always shows in Day, or when **Show Weekends** is on.
- Single-day / day-segment edits are **Day view only**. Week–Year move the whole bar. Both-edge resize handles appear on hover at every zoom. ⌘/Ctrl-click adds to the selection; Shift-click selects a range.
- **Edge auto-scroll** (`autoScrollFromPointer` in `useTimelineScroll`): while moving or resizing a bar, holding the pointer in the left/right edge of the timeline scrolls that way until the bar hits the one-drag buffer (from the bar’s start/end, not the old range). The bar and live date label clamp there. Same behavior on `#/`, `#/prod/schedule`, and `#/prod/calendar`.

- **Prod + scroll** (`#/prod/schedule` and `#/prod/calendar`): production styling. The existing prod toolbar (next to Today) hosts the redesign `DateJumpPicker` (fixed width, period snap) plus Day / Week / Month / Quarter / Year zoom. `#/prod/calendar` also has People vs Projects. Day-view picker range is 21 days (`Oct 15 to Nov 4, 2026`). Week-view picker follows the week columns on screen. Move and resize still use edge auto-scroll, a live date tooltip, undo toast, and the edit flyout. Weekend hatch on assignment bars follows **Show Weekends** (always on in Day).

## Decisions and assumptions

- **Quarter project bars:** Project and phase bars are static catalog rows, not week-fetched. After week-chunk loading, they were gated with `rangeReadyInWindow(..., conflictWindow)`. `conflictWindow` is a 10-week slice centered on the viewport (`MAX_CACHED_WEEKS`). Quarter forces at least 8 quarter columns (~2 years), so that cache often does not intersect a project such as Summit (2026-01-05–2026-06-26) and `rangeReadyInWindow` returns false — the bar is omitted even though it is already in the catalog. The 10-week cache size is only a contributing window; the bug is applying week-chunk readiness to bars that are not fetched per week. Fix: catalog project/phase bars render whenever they overlap visible columns (`inTimeWindow` in `SpanBar`).
- **Technician actual over scheduled (14 Oct 2026):** per-tech rows in the redesign left panel show scheduled and actual hours only (no budget — budget stays on project/phase rows). When actual exceeds scheduled, both numbers stay visible (e.g. `Scheduled 8h / Actual 10h`) with a subdued `+2h` variance. No red and no warning icon for that case. Red conflict is only for **scheduled hours over that tech’s available hours**, using the existing conflict treatment. This follows Float / Smartsheet / MS Project / Resource Guru / monday patterns. Pending Jade Vasun’s confirmation.
- **Continuous pan + one-drag buffer (15 Oct 2026):** Debbie Pan. Plain pan is infinite. Drag/resize in one gesture is limited to the zoom buffer past the bar’s current start or end (Jade Vasun: Smartsheet measures from wherever the bar ends). After drop, another drag may travel another buffer.
- **Edge auto-scroll constants (unvalidated):** `EDGE_SCROLL_ZONE_PX = 56`, `EDGE_SCROLL_MIN_PX = 12`, `EDGE_SCROLL_MAX_PX = 36`, `EDGE_SCROLL_GAIN = 3`. Zone width and speed were guessed for this prototype and have not been checked against a real gantt.
- **Extend-on-drop buffers (15 Oct 2026):** same magnitude each way. Day +21 days and Week +9 weeks and Quarter ~16 months are from Jade Vasun (verbal Smartsheet note, not Smartsheet docs). **Month +4 months** and **Year +2 years** are **assumptions** — not specified in review. See `docs/INTERACTION-LOGIC.md`.
- **Date picker (Debbie Pan, 15 Oct 2026):** Day uses a 21-day short range with `to` and no weekday (`Oct 15 to Nov 4, 2026`). Week uses the first through last **visible week column**, not a hardcoded 14 days. Month / Quarter / Year stay `Oct 2026` / `Q4 2026` / `2026`. The control is fixed-width via `PICKER_LABEL_SIZER` so it does not jump between zooms.
- **Motion:** Anvil 2 duration tokens only — `--a2-duration-default` 200ms, `--a2-duration-fast` 100ms for snaps. **ASSUMPTION:** no Anvil easing tokens in the design guidance; CSS `ease-out`.
- Bars are clipped to the timeline (`clipBarToGutter`) and must not paint under the left name pane or headers. Grab/drop on the left matches the right. The selection ring sits on the wrapper.

```bash
npm install
npm run dev
```
