import { DEFAULT_LOCALE, type Locale } from '@astir/types'
import { DEFAULT_APPEARANCE, type Appearance } from '@astir/validation'

/**
 * The name and logo this instance goes by, the language it greets a
 * stranger in, and how it looks.
 *
 * All of it comes from the studio settings, so each deployment of the same
 * code is called what its owner named it. The locale plugin loads them once
 * per page load (the endpoint is public, so the sign-in page has them too)
 * and the settings page updates them in place after a save.
 */
export interface Brand {
  name: string
  logoUrl: string | null
  /** Interface language for everyone without a choice of their own. */
  defaultLocale: Locale
  /** Font, size, radius, colours and colour mode; applied by useAppearanceHead(). */
  appearance: Appearance
  /** False until /api/settings/brand has answered once. */
  loaded: boolean
}

export function useBrand() {
  return useState<Brand>('brand', () => ({
    name: 'Astir Studio',
    logoUrl: null,
    defaultLocale: DEFAULT_LOCALE,
    appearance: { ...DEFAULT_APPEARANCE },
    loaded: false
  }))
}
