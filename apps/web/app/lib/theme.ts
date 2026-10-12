import { DEFAULT_APPEARANCE, HEX_COLOR, THEME_FONTS, type Appearance, type ThemeFont } from '@astir/validation'

/**
 * The studio appearance as CSS.
 *
 * Only what differs from tailwind.css is written out, so a studio on the
 * defaults gets an empty rule and the built-in tokens stay the single source
 * of the neutral look. Every value comes from toAppearance(): fonts from a
 * fixed list, numbers within range, colours matching #rrggbb — nothing a
 * settings row could smuggle into a style sheet.
 */

/** Text on a colour fill: whichever of these two reads better against it. */
const LIGHT_TEXT = '#fafafa'
const DARK_TEXT = '#18181b'

function channel(value: number) {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of #rrggbb. */
export function luminance(hex: string) {
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** Light or dark text, by contrast against the fill, so a pale brand colour still gets readable buttons. */
export function readableOn(hex: string) {
  return contrastRatio(hex, LIGHT_TEXT) >= contrastRatio(hex, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT
}

/**
 * The CSS custom properties an appearance sets.
 *
 * Returned as a map so the settings preview can apply it to one box as an
 * inline style while the head gets the same values for the whole document.
 */
export function themeVariables(appearance: Appearance): Record<string, string> {
  const vars: Record<string, string> = {}

  if (appearance.font !== DEFAULT_APPEARANCE.font) vars['--font-sans'] = THEME_FONTS[appearance.font].stack
  if (appearance.radius !== DEFAULT_APPEARANCE.radius) vars['--radius'] = appearance.radius / 16 + 'rem'

  const primary = appearance.primaryColor
  if (primary && HEX_COLOR.test(primary)) {
    vars['--primary'] = primary
    vars['--primary-foreground'] = readableOn(primary)
    // Focus outlines and focused borders follow the brand, softened so they do not shout.
    vars['--ring'] = 'color-mix(in oklab, ' + primary + ' 60%, transparent)'
  }

  const signal = appearance.signalColor
  if (signal && HEX_COLOR.test(signal)) {
    vars['--signal'] = signal
    vars['--signal-foreground'] = readableOn(signal)
  }

  return vars
}

function declarations(vars: Record<string, string>) {
  return Object.entries(vars).map(([name, value]) => name + ':' + value + ';').join('')
}

/**
 * The style sheet for <head>.
 *
 * `:root:root` and `:root.dark` outrank the plain `:root` / `.dark` blocks of
 * tailwind.css whatever order the two sheets load in, so the dark theme gets
 * the brand colour too instead of its own near-white primary.
 */
export function themeCss(appearance: Appearance) {
  const vars = declarations(themeVariables(appearance))
  const size = appearance.fontSize !== DEFAULT_APPEARANCE.fontSize ? 'font-size:' + appearance.fontSize + 'px;' : ''
  if (!vars && !size) return ''
  return ':root:root{' + vars + size + '}' + (vars ? ':root.dark{' + vars + '}' : '')
}

/** One Google Fonts request for the given faces, or null when they are all local. */
export function googleFontsHref(fonts: readonly ThemeFont[]) {
  const families = fonts
    .map(font => THEME_FONTS[font].google)
    .filter((family): family is NonNullable<typeof family> => Boolean(family))
  if (families.length === 0) return null
  return 'https://fonts.googleapis.com/css2?' + families.map(family => 'family=' + family).join('&') + '&display=swap'
}

/*
 * «As the device prefers»: decided in the browser before the first paint, and
 * kept in step if the device switches while the page is open. Inline so it
 * runs before the body renders; the server cannot know the answer.
 */
export const SYSTEM_COLOR_MODE_SCRIPT
  = '(function(){var m=window.matchMedia("(prefers-color-scheme: dark)");'
    + 'function a(){document.documentElement.classList.toggle("dark",m.matches)}'
    + 'a();m.addEventListener("change",a)})()'
