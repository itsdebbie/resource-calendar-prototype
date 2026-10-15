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

- **Prod + scroll** (`#/prod/schedule` and `#/prod/calendar`): production styling, two weeks in view, infinite horizontal scroll, Today + a single date picker (no prev/next or range field), move and resize with edge auto-scroll, a live date tooltip, snap-to-day, undo toast, and the edit flyout.

## Decisions and assumptions

- **Technician rows (Jade, 12 Oct 2026):** per-tech rows in the redesign left panel show scheduled and actual hours only. No budget on tech rows — budget stays on project/phase rows (e.g. a change order with 20 total hours). Overbooking is **scheduled hours over that tech’s available hours**, shown with the existing red conflict treatment (danger color, warning icon, row tint).
- **Actual over scheduled (open question for Jade):** the left panel shows both numbers when they differ (e.g. `Scheduled 8h / Actual 10h`) but does not flag that case. Whether to treat actual over scheduled as a conflict is still open.

```bash
npm install
npm run dev
```
