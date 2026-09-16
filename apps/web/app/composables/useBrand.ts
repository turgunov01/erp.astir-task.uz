/**
 * The name and logo this instance goes by.
 *
 * Both come from the studio settings, so each deployment of the same code
 * is called what its owner named it. app.vue loads them once per page load
 * (the endpoint is public, so the sign-in page has them too) and the settings
 * page updates them in place after a save.
 */
export interface Brand {
  name: string
  logoUrl: string | null
}

export function useBrand() {
  return useState<Brand>('brand', () => ({ name: 'ERP', logoUrl: null }))
}
