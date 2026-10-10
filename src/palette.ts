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

/** Light bar fill: 22% of the 500 mixed into white. Ink is the 600. */
export function swatch(family: keyof typeof PROJECT_COLORS): ProjectSwatch {
  const pair = PROJECT_COLORS[family]
  return { fill: pair[500], ink: pair[600] }
}

export function tintFill(hex: string, amount = 22) {
  return `color-mix(in srgb, ${hex} ${amount}%, #ffffff)`
}
