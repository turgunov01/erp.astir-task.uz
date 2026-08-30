import { z } from 'zod'
import { listQuerySchema, uuidSchema } from './common'

const ASSET_TYPE = [
  'CHARACTER', 'ENVIRONMENT', 'PROP', 'MODEL', 'RIG', 'TEXTURE',
  'ANIMATION', 'AUDIO', 'REFERENCE', 'TEMPLATE', 'OTHER'
] as const

const PRODUCTION_STATUS = [
  'NOT_STARTED', 'IN_PROGRESS', 'REVIEW', 'REVISION', 'APPROVED', 'COMPLETED', 'ON_HOLD'
] as const

export const createAssetSchema = z.object({
  projectId: uuidSchema.optional().nullable(),
  type: z.enum(ASSET_TYPE),
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  thumbnailUrl: z.string().trim().max(500).optional().nullable(),
  ownerId: uuidSchema.optional().nullable(),
  status: z.enum(PRODUCTION_STATUS).default('NOT_STARTED')
})

export const updateAssetSchema = createAssetSchema.partial()

export const assetListQuerySchema = listQuerySchema.extend({
  type: z.enum(ASSET_TYPE).optional(),
  status: z.enum(PRODUCTION_STATUS).optional(),
  projectId: uuidSchema.optional()
})
