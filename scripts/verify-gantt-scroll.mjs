import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const OUT = process.env.SHOT_DIR || '/tmp/gantt-verify'
const ZOOMS = ['Day', 'Week', 'Month', 'Quarter', 'Year']
const ROUTES = [
  { name: 'redesign', hash: '#/' },
  { name: 'schedule', hash: '#/prod/schedule' },
  { name: 'calendar', hash: '#/prod/calendar' },
]

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const failures = []

async function metrics() {
  return page.evaluate(() => {
    const el = document.querySelector('.rc-scroll, .prod-scroll')
    const bar = document.querySelector('.gantt-hscroll')
    const thumb = document.querySelector('.gantt-hscroll-thumb')
    const proto = Boolean(
      document.querySelector('.proto-scroll-switch, [aria-label="Prototype scroll comparison"]') ||
        /Stop at edge|Extend on drop|Infinite scroll is dropped/.test(document.body.innerText),
    )
    if (!el) return null
    const gutter = el.querySelector('.rc-gutter, .prod-gutter')
    const wraps = [...el.querySelectorAll('.rc-bar-wrap, .prod-bar-wrap')]
    const gutterBox = gutter?.getBoundingClientRect()
    let underGutter = 0
    if (gutterBox) {
      for (const wrap of wraps) {
        const b = wrap.getBoundingClientRect()
        if (b.width < 2 || b.height < 2) continue
        if (b.left + 1 < gutterBox.right - 2 && b.right > gutterBox.left + 4) underGutter += 1
      }
    }
    const chip = document.querySelector('.rc-date-label')?.textContent?.trim() ?? ''
    const barBox = bar?.getBoundingClientRect()
    return {
      scrollLeft: el.scrollLeft,
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      proto,
      underGutter,
      chip,
      hscroll: Boolean(bar),
      hscrollH: barBox ? Math.round(barBox.height) : 0,
      thumbW: thumb ? Math.round(thumb.getBoundingClientRect().width) : 0,
      roomRight: el.scrollWidth - el.clientWidth - el.scrollLeft,
    }
  })
}

async function setZoom(label) {
  const clicked = await page.evaluate((wanted) => {
    const labels = [...document.querySelectorAll('label, button, [role="radio"]')]
    const btn = labels.find((el) => el.textContent?.trim() === wanted)
    if (!btn) return false
    btn.click()
    return true
  }, label)
  if (!clicked) failures.push(`zoom ${label} not found`)
  await page.waitForTimeout(350)
}

async function pan(dx) {
  await page.evaluate((delta) => {
    const el = document.querySelector('.rc-scroll, .prod-scroll')
    if (el) el.scrollLeft += delta
  }, dx)
  await page.waitForTimeout(100)
}

async function growUntil(direction, viewports) {
  const start = await metrics()
  if (!start) throw new Error('no scroll pane')
  const target = start.clientWidth * viewports
  let moved = 0
  for (let i = 0; i < 48; i++) {
    const before = await metrics()
    await pan(direction * Math.round(before.clientWidth * 0.85))
    const after = await metrics()
    moved += Math.abs(after.scrollLeft - before.scrollLeft)
    if (after.scrollWidth <= after.clientWidth + 8) {
      failures.push(`no overflow after pan ${direction}`)
      break
    }
    if (moved >= target) break
  }
  const end = await metrics()
  return { start, end, moved }
}

for (const route of ROUTES) {
  await page.goto(`${BASE}/${route.hash}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.rc-scroll, .prod-scroll', { timeout: 15000 })
  await page.waitForSelector('.gantt-hscroll', { timeout: 8000 })
  await page.waitForTimeout(500)
  const open = await metrics()
  if (!open) {
    failures.push(`${route.name}: no scroll pane`)
    continue
  }
  if (open.proto) failures.push(`${route.name}: prototype panel still mounted`)
  if (!open.hscroll || open.hscrollH < 10) failures.push(`${route.name}: timeline scrollbar missing (h=${open.hscrollH})`)
  if (open.thumbW < 24) failures.push(`${route.name}: scrollbar thumb missing`)
  await page.screenshot({ path: `${OUT}/${route.name}-day-scrollbar.png`, fullPage: false })

  for (const zoom of ZOOMS) {
    await setZoom(zoom)
    const before = await metrics()
    const right = await growUntil(1, 3)
    if (right.moved < right.start.clientWidth * 2.4) {
      failures.push(`${route.name} ${zoom}: right pan only ${Math.round(right.moved)}px`)
    }
    const left = await growUntil(-1, 3)
    if (left.moved < left.start.clientWidth * 2.4) {
      failures.push(`${route.name} ${zoom}: left pan only ${Math.round(left.moved)}px`)
    }
    const after = await metrics()
    if (after?.underGutter) failures.push(`${route.name} ${zoom}: ${after.underGutter} bars under left gutter`)
    if (after?.proto) failures.push(`${route.name} ${zoom}: prototype panel visible`)
    if ((zoom === 'Day' || zoom === 'Week') && after?.chip && before?.chip && after.chip === before.chip && right.moved > 400) {
      failures.push(`${route.name} ${zoom}: chip did not update (${after.chip})`)
    }
    if (zoom === 'Day' || zoom === 'Year' || zoom === 'Week') {
      await page.screenshot({ path: `${OUT}/${route.name}-${zoom.toLowerCase()}.png` })
    }
  }

  await setZoom('Day')
  const drag = await page.evaluate(() => {
    const el = document.querySelector('.rc-scroll, .prod-scroll')
    const gutter = el?.querySelector('.rc-gutter, .prod-gutter')
    const bar = el?.querySelector('.rc-bar, .prod-bar')
    if (!el || !gutter || !bar) return { ok: false, reason: 'missing' }
    const g = gutter.getBoundingClientRect()
    const b = bar.getBoundingClientRect()
    return {
      ok: true,
      hitX: Math.max(b.left + 6, g.right + 8),
      hitY: b.top + b.height / 2,
      overlap: b.left + 1 < g.right - 2 && b.right > g.left,
    }
  })
  if (!drag.ok) failures.push(`${route.name}: no bar for left-edge drag`)
  else {
    if (drag.overlap) failures.push(`${route.name}: bar overlaps gutter before drag`)
    await page.mouse.move(drag.hitX, drag.hitY)
    await page.mouse.down()
    await page.mouse.move(drag.hitX - 90, drag.hitY, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(250)
    const afterDrag = await metrics()
    if (afterDrag?.underGutter) failures.push(`${route.name}: bars under gutter after left drag`)
    await page.screenshot({ path: `${OUT}/${route.name}-left-drag.png` })
  }

  const thumb = page.locator('.gantt-hscroll-thumb')
  const box = await thumb.boundingBox()
  if (box) {
    const beforeThumb = await metrics()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 180, box.y + box.height / 2, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(200)
    const afterThumb = await metrics()
    if (afterThumb.scrollLeft <= beforeThumb.scrollLeft + 20) {
      failures.push(`${route.name}: thumb drag did not pan`)
    }
  }
}

await page.screenshot({ path: `${OUT}/final-no-prototype.png` })
await browser.close()

console.log(JSON.stringify({ failures, out: OUT }, null, 2))
if (failures.length) process.exit(1)
