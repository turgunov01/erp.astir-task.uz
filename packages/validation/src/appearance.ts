import { z } from 'zod'

/*
 * The studio's appearance (Settings → «Оформление»): font, size, corner
 * radius, two colours and the colour mode. One row for everyone, the sign-in
 * page included; the web app turns it into CSS variables on <html>.
 *
 * The catalogue lives here rather than in @astir/types because the schema
 * below needs it and this package does not depend on that one.
 */

/**
 * Fonts on offer: each draws Cyrillic and Latin, so Russian, Uzbek, English
 * and Turkish all render in the same face. `google` is the family as the
 * Google Fonts css2 API spells it; the system font loads nothing.
 */
export const THEME_FONTS = {
  system: { label: 'System', google: null, stack: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  inter: { label: 'Inter', google: 'Inter:wght@400;500;600;700', stack: '"Inter", ui-sans-serif, system-ui, sans-serif' },
  manrope: { label: 'Manrope', google: 'Manrope:wght@400;500;600;700', stack: '"Manrope", ui-sans-serif, system-ui, sans-serif' },
  roboto: { label: 'Roboto', google: 'Roboto:wght@400;500;700', stack: '"Roboto", ui-sans-serif, system-ui, sans-serif' },
  'open-sans': { label: 'Open Sans', google: 'Open+Sans:wght@400;500;600;700', stack: '"Open Sans", ui-sans-serif, system-ui, sans-serif' },
  montserrat: { label: 'Montserrat', google: 'Montserrat:wght@400;500;600;700', stack: '"Montserrat", ui-sans-serif, system-ui, sans-serif' },
  'pt-sans': { label: 'PT Sans', google: 'PT+Sans:wght@400;700', stack: '"PT Sans", ui-sans-serif, system-ui, sans-serif' },
  nunito: { label: 'Nunito', google: 'Nunito:wght@400;500;600;700', stack: '"Nunito", ui-sans-serif, system-ui, sans-serif' },
  'ibm-plex-sans': { label: 'IBM Plex Sans', google: 'IBM+Plex+Sans:wght@400;500;600;700', stack: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif' },
  'fira-sans': { label: 'Fira Sans', google: 'Fira+Sans:wght@400;500;600;700', stack: '"Fira Sans", ui-sans-serif, system-ui, sans-serif' }
} as const

export type ThemeFont = keyof typeof THEME_FONTS
export const THEME_FONT_IDS = Object.keys(THEME_FONTS) as [ThemeFont, ...ThemeFont[]]

export const THEME_COLOR_MODES = ['light', 'dark', 'system'] as const
export type ThemeColorMode = (typeof THEME_COLOR_MODES)[number]

/** Root font size in px. Below 12 the small print stops being legible. */
export const THEME_FONT_SIZE = { min: 12, max: 20 } as const
/** Corner radius in px, at the default 16px root. */
export const THEME_RADIUS = { min: 0, max: 20 } as const

export interface Appearance {
  font: ThemeFont
  fontSize: number
  radius: number
  /** #rrggbb, or null for the built-in colour. */
  primaryColor: string | null
  signalColor: string | null
  colorMode: ThemeColorMode
}

/** What the interface looks like with nothing chosen; the schema defaults match. */
export const DEFAULT_APPEARANCE: Appearance = {
  font: 'system',
  fontSize: 16,
  radius: 10,
  primaryColor: null,
  signalColor: null,
  colorMode: 'light'
}

export const HEX_COLOR = /^#[0-9a-f]{6}$/i

const hexColor = z
  .string()
  .trim()
  .regex(HEX_COLOR, 'i18n:common.validation.hexColor')
  .transform(value => value.toLowerCase())

/** Every field optional: a PATCH sends what changed; null restores a built-in colour. */
export const appearanceSchema = z.object({
  themeFont: z.enum(THEME_FONT_IDS).optional(),
  themeFontSize: z.coerce.number().int().min(THEME_FONT_SIZE.min).max(THEME_FONT_SIZE.max).optional(),
  themeRadius: z.coerce.number().int().min(THEME_RADIUS.min).max(THEME_RADIUS.max).optional(),
  themePrimary: hexColor.nullable().optional(),
  themeSignal: hexColor.nullable().optional(),
  themeColorMode: z.enum(THEME_COLOR_MODES).optional()
})
export type AppearanceInput = z.infer<typeof appearanceSchema>

/**
 * A stored row as the interface should use it.
 *
 * The database columns are plain text, so anything that is not on the lists
 * (a value written by hand, a font since retired) falls back to the default
 * instead of reaching a style sheet.
 */
export function toAppearance(row: {
  themeFont?: string | null
  themeFontSize?: number | null
  themeRadius?: number | null
  themePrimary?: string | null
  themeSignal?: string | null
  themeColorMode?: string | null
} | null | undefined): Appearance {
  if (!row) return { ...DEFAULT_APPEARANCE }
  const within = (value: number | null | undefined, range: { min: number, max: number }, fallback: number) =>
    typeof value === 'number' && Number.isInteger(value) && value >= range.min && value <= range.max ? value : fallback
  const colour = (value: string | null | undefined) =>
    typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : null
  return {
    font: row.themeFont && row.themeFont in THEME_FONTS ? row.themeFont as ThemeFont : DEFAULT_APPEARANCE.font,
    fontSize: within(row.themeFontSize, THEME_FONT_SIZE, DEFAULT_APPEARANCE.fontSize),
    radius: within(row.themeRadius, THEME_RADIUS, DEFAULT_APPEARANCE.radius),
    primaryColor: colour(row.themePrimary),
    signalColor: colour(row.themeSignal),
    colorMode: (THEME_COLOR_MODES as readonly string[]).includes(row.themeColorMode ?? '')
      ? row.themeColorMode as ThemeColorMode
      : DEFAULT_APPEARANCE.colorMode
  }
}

/** The same check for an appearance that arrived over the wire (the brand endpoint). */
export function normalizeAppearance(value: unknown): Appearance {
  if (!value || typeof value !== 'object') return { ...DEFAULT_APPEARANCE }
  const source = value as Record<string, unknown>
  const text = (key: string) => (typeof source[key] === 'string' ? source[key] as string : null)
  const number = (key: string) => (typeof source[key] === 'number' ? source[key] as number : null)
  return toAppearance({
    themeFont: text('font'),
    themeFontSize: number('fontSize'),
    themeRadius: number('radius'),
    themePrimary: text('primaryColor'),
    themeSignal: text('signalColor'),
    themeColorMode: text('colorMode')
  })
}
