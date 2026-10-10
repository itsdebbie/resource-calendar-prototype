# Resource Calendar prototype

Interactive Anvil2 prototype of the signed-off Group by Projects resource calendar (Debbie, 9 Oct 2026).

- Continuous horizontal timeline. Opens on today. Scroll earlier or later at every zoom.
- Default **Day** zoom shows two weeks. Zoom Day → Week → Month → Quarter → Year from the segmented control, `+`/`-`, or pinch / ⌘ or Ctrl + scroll.
- Projects view has sticky project rows, Budget / Sched. / Actual columns (blank unless booked or logged), and an optional crew panel (folded by default, remembered in `localStorage`).
- People view has sticky person rows. The crew panel is hidden.
- Bars use Figma project colors (500 fill mixed 22% into white, 600 ink). Confirmed bookings show a calendar-check. Unassigned is a white bar with a project-color border and “Needs a tech”.
- Short bars that share a week merge into an **N bookings · Xh** chip at Month zoom and finer. Quarter and Year short bars are color only.
- Weekends are off by default in Week and coarser zooms. The hatch always shows in Day, or when **Show Weekends** is on.
- Editing is Day and Week only. Month, Quarter, and Year are read-only: click a bar for a popover and **Edit in Week view**. ⌘/Ctrl-click adds to the selection; Shift-click selects a range.

```bash
npm install
npm run dev
```
