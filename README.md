# Resource Calendar prototype

Interactive Anvil2 prototype of Group by Projects from the Resource Calendar Figma screens.

- Continuous horizontal timeline (shared across People / Projects). Opens on today. Scroll earlier or later at every zoom.
- Default **Day** zoom shows two weeks. Zoom Day → Week → Month → Quarter → Year from the segmented control, `+`/`-`, or pinch / ⌘ or Ctrl + scroll.
- Sticky month (or year) stays pinned at the left of the timeline header. Today is a light vertical guide behind bars, with a blue pill/chip in the header.
- Technician hours in the gutter are for the visible dates; project and phase totals are whole-project budgets. The gutter header is just **Projects** or **People**; the visible range is the first line of the technician hours hover.
- Bar labels stick to the left edge of the visible timeline when a bar is clipped, then ride off with the bar. Hours hide first; the name ellipsizes.
- People rows stack overlapping bookings into lanes and grow only on overlap. Conflict styling is for days over 8h capacity, not every overlap.
- Collapsed project rows are a single summary bar; expanding lists one phase per row. Row height does not change while scrolling.
- Editing is Day and Week only. Month, Quarter, and Year are read-only: click a bar for a popover and **Edit in Week view**. Shift-click adds bars to the selection in Day/Week.

```bash
npm install
npm run dev
```
