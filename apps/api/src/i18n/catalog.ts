import ruAuth from './locales/ru/auth'
import ruCommon from './locales/ru/common'
import ruFinance from './locales/ru/finance'
import ruProduction from './locales/ru/production'
import ruProjects from './locales/ru/projects'
import ruTeam from './locales/ru/team'
import uzAuth from './locales/uz/auth'
import uzCommon from './locales/uz/common'
import uzFinance from './locales/uz/finance'
import uzProduction from './locales/uz/production'
import uzProjects from './locales/uz/projects'
import uzTeam from './locales/uz/team'
import enAuth from './locales/en/auth'
import enCommon from './locales/en/common'
import enFinance from './locales/en/finance'
import enProduction from './locales/en/production'
import enProjects from './locales/en/projects'
import enTeam from './locales/en/team'
import trAuth from './locales/tr/auth'
import trCommon from './locales/tr/common'
import trFinance from './locales/tr/finance'
import trProduction from './locales/tr/production'
import trProjects from './locales/tr/projects'
import trTeam from './locales/tr/team'
import type { Locale } from './locales'
import type { LeafPaths, Messages } from './types'

/**
 * All server messages, one tree per language, one branch per namespace.
 *
 * The namespaces are the same as the web app's (apps/web/i18n/locales) so a
 * Phase 2 owner of, say, finance edits finance files on both sides and never
 * touches another area's file. There is no `shell` namespace here: the API has
 * no layout.
 */
const ru = {
  common: ruCommon,
  auth: ruAuth,
  production: ruProduction,
  projects: ruProjects,
  finance: ruFinance,
  team: ruTeam
}

export type Catalog = typeof ru

/** A key that exists in the Russian catalogue; typos fail the typecheck. */
export type MessageKey = LeafPaths<Catalog>

export const CATALOG: Record<Locale, Messages<Catalog>> = {
  ru,
  uz: { common: uzCommon, auth: uzAuth, production: uzProduction, projects: uzProjects, finance: uzFinance, team: uzTeam },
  en: { common: enCommon, auth: enAuth, production: enProduction, projects: enProjects, finance: enFinance, team: enTeam },
  tr: { common: trCommon, auth: trAuth, production: trProduction, projects: trProjects, finance: trFinance, team: trTeam }
}
