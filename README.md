# Resource Calendar prototype

Interactive Anvil2 prototype of Group by Projects from the Resource Calendar Figma screens.

- Continuous horizontal timeline (shared across People / Projects). Opens on today. Scroll earlier or later at every zoom.
- Default **Days** zoom shows two weeks. Zoom Days → Weeks → Months → Quarters → Year from the segmented control, `+`/`-`, or pinch / ⌘ or Ctrl + scroll.
- Sticky month (or year) stays pinned at the left of the timeline header. Today is a light vertical guide behind bars, with a blue pill/chip in the header.
- Technician hours in the gutter are for the visible dates; project and phase totals are whole-project budgets.
- Collapsed project rows are a single summary bar; expanding lists one phase per row. Row height does not change while scrolling.
- Editing is Days and Weeks only. Month, Quarter, and Year are read-only. Shift-click adds bars to the selection.

```bash
npm install
npm run dev
```
