import { z } from 'zod'
import { partialUpdate } from './common'

/*
 * The owner is not on the list: the owner's rights are not something a
 * studio role can be built from, and a role "based on the owner" would make
 * whoever holds it rank as the owner everywhere the enum is read.
 */
const CUSTOM_ROLE_BASE = [
  'ADMIN', 'PRODUCER', 'PROJECT_MANAGER',
  'ART_DIRECTOR', 'ARTIST', 'CLIENT', 'FINANCE'
] as const

/**
 * A studio-defined role.
 *
 * Permissions are plain strings here because this package does not know the
 * catalogue; the API checks every entry against it before saving.
 */
export const createCustomRoleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(400).optional().nullable(),
  baseRole: z.enum(CUSTOM_ROLE_BASE),
  permissions: z.array(z.string().trim().min(1).max(64)).max(200)
})
export type CreateCustomRoleInput = z.infer<typeof createCustomRoleSchema>

export const updateCustomRoleSchema = partialUpdate(createCustomRoleSchema)
export type UpdateCustomRoleInput = z.infer<typeof updateCustomRoleSchema>
