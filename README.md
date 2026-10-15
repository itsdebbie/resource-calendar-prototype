# Resource Calendar prototype

Interactive Anvil2 prototype of the signed-off Group by Projects resource calendar (Debbie, 9 Oct 2026). A separate **prod + scroll** page (`#/prod/schedule`, `#/prod/calendar`) recreates today’s production Schedule tab and Resource Calendar chrome with a two-week infinite day timeline.

- Continuous horizontal timeline. Opens on today. Scroll earlier or later at every zoom.
- Default **Day** zoom shows two weeks. Zoom Day → Week → Month → Quarter → Year from the segmented control, `+`/`-`, or pinch / ⌘ or Ctrl + scroll.
- Projects view has sticky project rows, Budget / Sched. / Actual columns (blank unless booked or logged), and an optional crew panel (folded by default, remembered in `localStorage`). Trackpad, Shift+wheel, and drag on the crew strip pan the same infinite timeline.
- People view has sticky person rows. The crew panel is hidden.
- Bars use solid Figma project **500** fills with WCAG-picked text and icons. Confirmed bookings show a calendar-check. Unassigned uses Anvil Neutral 500 (`#707070`) and **Needs a tech · 40h**. Hover tooltips pin at the pointer’s x when the hover starts, then stay put (Anvil flip/shift keeps them on screen).
- Short bars that share a week merge into an **N bookings · Xh** chip at Month zoom and finer. Quarter and Year short bars are color only.
- Weekends are off by default in Week and coarser zooms. The hatch always shows in Day, or when **Show Weekends** is on.
- Editing is Day and Week only. Month, Quarter, and Year are read-only: click a bar for a popover and **Edit in Week view**. ⌘/Ctrl-click adds to the selection; Shift-click selects a range.

- **Prod + scroll** (`#/prod/schedule` and `#/prod/calendar`): production styling, two weeks in view, Today + a single date picker (no prev/next or range field), move and resize with edge auto-scroll, a live date tooltip, snap-to-day, undo toast, and the edit flyout.

## Decisions and assumptions

- **Prototype scroll versions:** a dashed, bottom-right **Prototype** switch (not a product control) compares Version A infinite scroll vs Version B extend-on-drop. Default is Version A. It is not a proposed user setting.
- **Edge auto-scroll constants (unvalidated):** `EDGE_SCROLL_ZONE_PX = 56`, `EDGE_SCROLL_MIN_PX = 12`, `EDGE_SCROLL_MAX_PX = 36`, `EDGE_SCROLL_GAIN = 3`. Zone width and speed were guessed for this prototype and have not been checked against a real gantt.
- **Extend on drop (`EXTEND_ON_DROP_DAYS = 10`):** Version B starts with a finite timeline (today’s visible range ∪ the placeholder data span). Drag auto-scroll stops at that end. Dropping a bar in the last visible days, or at the end, extends the end by 10 days past the bar’s new end. The 10-day value and trigger rule are from Jade’s verbal description (12 Oct 2026, ~52:20), not Smartsheet docs — unverified.
- Dragged bars are clipped to the timeline and must not paint over the left name pane or headers.

```bash
npm install
npm run dev
```
