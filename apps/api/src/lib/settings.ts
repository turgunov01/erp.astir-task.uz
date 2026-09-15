import type { StudioSettings } from '@prisma/client'
import { prisma } from './prisma'
import { env } from '../config/env'

/**
 * Studio-wide settings, read through a small cache.
 *
 * Nearly every request that formats money or sends mail wants these, and they
 * change a few times a year — so they are held in memory and dropped when a
 * save comes in, rather than fetched on every call.
 */

/** The single row. A constant, because there is one studio. */
const SETTINGS_ID = 'studio'

let cached: StudioSettings | null = null

/**
 * The settings row, created on first read.
 *
 * A fresh install has no row, and a settings page that cannot render until
 * somebody saves once is a worse first impression than one full of defaults.
 * Those defaults live in the schema, so the row created here is exactly what a
 * migration would have produced.
 */
export async function studioSettings(): Promise<StudioSettings> {
  if (cached) return cached
  cached = await prisma.studioSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID },
    update: {}
  })
  return cached
}

export async function saveStudioSettings(
  data: Partial<Omit<StudioSettings, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<StudioSettings> {
  cached = await prisma.studioSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data
  })
  return cached
}

/** Drop the cache so the next read sees somebody else's write. */
export function forgetStudioSettings() {
  cached = null
}

export interface MailConfig {
  host: string
  port: number
  user: string
  password: string
  from: string
}

/**
 * SMTP as it should actually be used: database first, environment second.
 *
 * The environment stays authoritative for a deployment configured before this
 * table existed, and it is the only way to configure mail before anybody can
 * log in to fill the form — so a half-filled row must not silently disable a
 * working env-based setup. Each field falls back on its own.
 */
export async function mailConfig(): Promise<MailConfig | null> {
  const settings = await studioSettings()

  const host = settings.smtpHost || env.SMTP_HOST
  const user = settings.smtpUser || env.SMTP_USER
  const password = settings.smtpPassword || env.SMTP_PASSWORD
  if (!host || !user || !password) return null

  return {
    host,
    port: settings.smtpPort ?? env.SMTP_PORT,
    user,
    password,
    from: settings.smtpFrom || env.SMTP_FROM || user
  }
}

/**
 * Settings as the API returns them.
 *
 * The SMTP password is write-only: it goes in through the form and never comes
 * back out, so a screenshot of the settings page cannot leak the mailbox. The
 * form still needs to know whether one is stored, hence the flag.
 */
export function publicStudioSettings(settings: StudioSettings) {
  const { smtpPassword, ...rest } = settings
  return { ...rest, smtpPasswordSet: Boolean(smtpPassword) }
}
