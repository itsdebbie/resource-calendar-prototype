# Resource Calendar prototype

Interactive Anvil2 prototype of Group by Projects from the Resource Calendar Figma screens.

- Continuous horizontal timeline (shared across People / Projects). Opens on today. Scroll earlier or later at every zoom.
- Default **Days** zoom shows two weeks. Zoom Days → Weeks → Months → Quarters → Year (buttons, `+`/`-`, or ctrl/pinch scroll).
- Today + a single **Go to** date. Technician hours are scheduled / capacity for the visible range.
- Editing is Days and Weeks only. Day view moves a single day; Week view moves the whole bar and resizes from the right edge, snapping to the nearest day, with a live date tooltip and a day guide in the week column.
- Month, Quarter, and Year are read-only (select and view). Shift-click adds bars to the selection.

```bash
npm install
npm run dev
```
