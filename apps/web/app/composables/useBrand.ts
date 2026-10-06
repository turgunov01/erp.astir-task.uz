import { DEFAULT_LOCALE, type Locale } from '@astir/types'

/**
 * The name and logo this instance goes by, and the language it greets a
 * stranger in.
 *
 * All three come from the studio settings, so each deployment of the same
 * code is called what its owner named it. The locale plugin loads them once
 * per page load (the endpoint is public, so the sign-in page has them too)
 * and the settings page updates them in place after a save.
 */
export interface Brand {
  name: string
  logoUrl: string | null
  /** Interface language for everyone without a choice of their own. */
  defaultLocale: Locale
  /** False until /api/settings/brand has answered once. */
  loaded: boolean
}

export function useBrand() {
  return useState<Brand>('brand', () => ({
    name: 'Astir Studio',
    logoUrl: null,
    defaultLocale: DEFAULT_LOCALE,
    loaded: false
  }))
}
