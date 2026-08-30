import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'

export interface ActivityInput {
  actorId?: string | null
  entityType: string
  entityId: string
  action: string
  projectId?: string | null
  metadata?: Prisma.InputJsonValue
}

/**
 * Append to the business activity feed (spec 49).
 *
 * Pass `tx` when the event must be atomic with the change it describes, so a
 * rolled-back write never leaves a phantom entry in the feed.
 */
export function recordActivity(
  input: ActivityInput,
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  return tx.activityLog.create({
    data: {
      actorId: input.actorId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      projectId: input.projectId ?? null,
      metadata: input.metadata
    }
  })
}

export interface AuditInput {
  actorId?: string | null
  action: string
  entityType?: string
  entityId?: string
  ipAddress?: string
  userAgent?: string
  metadata?: Prisma.InputJsonValue
}

/** Security-relevant trail: deletions, permission and finance changes (spec 50). */
export function recordAudit(
  input: AuditInput,
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  return tx.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: input.metadata
    }
  })
}
