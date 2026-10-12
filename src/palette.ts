/** Figma project colors (G5AQXaknT6QOyevDL40dd4, node 4042:383086). Row 1 = 500s, row 2 = 600s. */
export const PROJECT_COLORS = {
  red: { 500: '#e13212', 600: '#bf2a00' },
  orange: { 500: '#b14c00', 600: '#7a2f00' },
  yellow: { 500: '#ffbe00', 600: '#de9500' },
  green: { 500: '#007a4d', 600: '#005132' },
  cyan: { 500: '#0ca5c0', 600: '#038299' },
  blue: { 500: '#0265dc', 600: '#004491' },
  magenta: { 500: '#982071', 600: '#7d165b' },
  purple: { 500: '#4f3a9e', 600: '#422799' },
  'blue-grey': { 500: '#6a7a85', 600: '#576671' },
} as const

export type ProjectSwatch = { fill: string; ink: string }

/** Prototype default foreground (Anvil2 `--a2-foreground-color-default`). */
export const BAR_TEXT_DARK = '#040404'
export const BAR_TEXT_LIGHT = '#ffffff'
export const BAR_FILL_UNASSIGNED = '#ffffff'

const TEXT_MIN = 4.5
const ICON_MIN = 3
const BORDER_MIN = 3

export function swatch(family: keyof typeof PROJECT_COLORS): ProjectSwatch {
  const pair = PROJECT_COLORS[family]
  return { fill: pair[500], ink: pair[600] }
}

/** Kept for crew-panel meters, not booking bars. */
export function tintFill(hex: string, amount = 22) {
  return `color-mix(in srgb, ${hex} ${amount}%, #ffffff)`
}

function srgbChannel(value: number) {
  const s = value / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function parseHex(hex: string): [number, number, number] {
  const raw = hex.replace('#', '').trim()
  const full = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw
  const n = Number.parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** WCAG 2 relative luminance. */
export function relativeLuminance(hex: string) {
  const [r, g, b] = parseHex(hex)
  return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b)
}

/** WCAG 2 contrast ratio of two sRGB hex colors. */
export function contrastRatio(a: string, b: string) {
  const l1 = relativeLuminance(a)
  const l2 = relativeLuminance(b)
  const hi = Math.max(l1, l2)
  const lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}

export function pickOnFill(fill: string) {
  const light = contrastRatio(BAR_TEXT_LIGHT, fill)
  const dark = contrastRatio(BAR_TEXT_DARK, fill)
  if (light >= dark) return { color: BAR_TEXT_LIGHT, ratio: light, light, dark }
  return { color: BAR_TEXT_DARK, ratio: dark, light, dark }
}

export type BarTone = {
  fill: string
  text: string
  textRatio: number
  textMeets: boolean
  icon: string
  iconRatio: number
  iconMeets: boolean
  ink: string
  border: string
  borderRatio: number
  borderMeets: boolean
}

function pickUnassignedBorder(fill: string, ink: string) {
  const fillRatio = contrastRatio(fill, BAR_FILL_UNASSIGNED)
  const inkRatio = contrastRatio(ink, BAR_FILL_UNASSIGNED)
  return inkRatio >= fillRatio
    ? { border: ink, borderRatio: inkRatio }
    : { border: fill, borderRatio: fillRatio }
}

/** Solid 500 fill (or white for unassigned) plus WCAG-picked text/icon color. */
export function barTone(fill: string, ink: string, unassigned = false): BarTone {
  const surface = unassigned ? BAR_FILL_UNASSIGNED : fill
  const picked = pickOnFill(surface)
  const border = unassigned ? pickUnassignedBorder(fill, ink) : { border: ink, borderRatio: contrastRatio(ink, surface) }
  const icon = picked.color
  const iconRatio = picked.ratio
  return {
    fill: surface,
    text: picked.color,
    textRatio: picked.ratio,
    textMeets: picked.ratio >= TEXT_MIN,
    icon,
    iconRatio,
    iconMeets: iconRatio >= ICON_MIN,
    ink,
    border: border.border,
    borderRatio: border.borderRatio,
    borderMeets: unassigned ? border.borderRatio >= BORDER_MIN : true,
  }
}

export type ContrastRow = {
  family: keyof typeof PROJECT_COLORS
  fill: string
  text: string
  textRatio: number
  textMeets: boolean
  icon: string
  iconRatio: number
  iconMeets: boolean
}

export function projectContrastTable(): ContrastRow[] {
  return (Object.keys(PROJECT_COLORS) as (keyof typeof PROJECT_COLORS)[]).map((family) => {
    const tone = barTone(PROJECT_COLORS[family][500], PROJECT_COLORS[family][600])
    return {
      family,
      fill: tone.fill,
      text: tone.text,
      textRatio: tone.textRatio,
      textMeets: tone.textMeets,
      icon: tone.icon,
      iconRatio: tone.iconRatio,
      iconMeets: tone.iconMeets,
    }
  })
}
