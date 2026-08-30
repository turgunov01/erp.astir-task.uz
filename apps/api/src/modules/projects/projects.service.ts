import type { Prisma } from '@prisma/client'
import { DEFAULT_PIPELINE, PROJECT_TEMPLATES } from '@astir/config'
import type { CreateProjectInput } from '@astir/validation'
import { prisma } from '../../lib/prisma'
import { badRequest, conflict, notFound } from '../../lib/errors'
import { buildMeta, toSkipTake } from '../../lib/http'
import { recordActivity } from '../../lib/activity'
import { storage } from '../../lib/storage'
import * as repo from './projects.repository'
import { calculateProgress, calculateRisk } from './projects.progress'
import { toPrismaProjectType } from './projects.mapper'

const CODE_PREFIX = 'AST-'

/** Next free AST-nnn code. Explicit codes from the caller win. */
async function nextProjectCode(): Promise<string> {
  const highest = await repo.highestCodeNumber(CODE_PREFIX)
  return CODE_PREFIX + String(highest + 1).padStart(3, '0')
}

function toDate(value?: string | null): Date | null {
  return value ? new Date(value) : null
}

export async function list(query: Parameters<typeof repo.findMany>[0] & {
  page: number
  limit: number
}) {
  const { skip, take } = toSkipTake(query.page, query.limit)
  const [items, total] = await Promise.all([
    repo.findMany({ ...query, skip, take }),
    repo.count(query)
  ])
  return { items, meta: buildMeta(total, query.page, query.limit) }
}

export async function getById(id: string) {
  const project = await repo.findById(id)
  if (!project) throw notFound('Project')
  return project
}

/**
 * Create a project and, when a template is named, materialise its pipeline in
 * the same transaction so a project can never exist without stages (spec 84).
 */
export async function create(input: CreateProjectInput, actorId?: string) {
  const client = await prisma.client.findFirst({
    where: { id: input.clientId, deletedAt: null },
    select: { id: true }
  })
  if (!client) throw notFound('Client')

  const code = input.code ?? (await nextProjectCode())
  if (await repo.findByCode(code)) throw conflict('Project code ' + code + ' is already in use')

  const templateStages = input.template ? PROJECT_TEMPLATES[input.template] : undefined
  const stages = templateStages
    ? DEFAULT_PIPELINE.filter(stage => templateStages.includes(stage.name))
    : []

  return prisma.$transaction(async tx => {
    const project = await tx.project.create({
      data: {
        code,
        name: input.name,
        description: input.description ?? null,
        clientId: input.clientId,
        projectManagerId: input.projectManagerId ?? null,
        producerId: input.producerId ?? null,
        projectType: toPrismaProjectType(input.projectType) as never,
        status: input.status,
        priority: input.priority,
        startDate: toDate(input.startDate),
        deadline: toDate(input.deadline),
        budget: input.budget ?? null,
        currency: input.currency
      }
    })

    if (stages.length > 0) {
      const departments = await tx.department.findMany({ select: { id: true, name: true } })
      const departmentByName = new Map(departments.map(d => [d.name, d.id]))

      await tx.projectStage.createMany({
        data: stages.map((stage, index) => ({
          projectId: project.id,
          name: stage.name,
          // Re-index so a filtered template still has contiguous ordering.
          order: index + 1,
          weight: stage.weight,
          departmentId: stage.department ? departmentByName.get(stage.department) ?? null : null
        }))
      })
    }

    await tx.projectBudget.create({
      data: {
        projectId: project.id,
        revenue: input.budget ?? 0,
        currency: input.currency
      }
    })

    await recordActivity(
      {
        actorId,
        entityType: 'Project',
        entityId: project.id,
        projectId: project.id,
        action: 'project.created',
        metadata: { code: project.code, name: project.name, stages: stages.length }
      },
      tx
    )

    return project
  })
}

export async function update(id: string, input: Record<string, unknown>, actorId?: string) {
  const existing = await getById(id)

  const data: Prisma.ProjectUpdateInput = { ...input } as Prisma.ProjectUpdateInput
  if (input.projectType) data.projectType = toPrismaProjectType(input.projectType as string) as never
  if ('startDate' in input) data.startDate = toDate(input.startDate as string | null)
  if ('deadline' in input) data.deadline = toDate(input.deadline as string | null)

  const project = await repo.update(id, data)

  if (input.status && input.status !== existing.status) {
    await recordActivity({
      actorId,
      entityType: 'Project',
      entityId: id,
      projectId: id,
      action: 'project.status_changed',
      metadata: { from: existing.status, to: input.status }
    })
  }

  return project
}

export async function archive(id: string) {
  await getById(id)
  return repo.softDelete(id)
}

/**
 * Recompute derived progress and risk from the pipeline, then persist so list
 * queries stay a single indexed read instead of recalculating per row.
 */
export async function refreshHealth(id: string) {
  const project = await getById(id)
  const [stages, overdueTasks] = await Promise.all([
    repo.stageProgress(id),
    repo.countOverdueTasks(id)
  ])

  const progress = calculateProgress(stages)
  const risk = calculateRisk({
    progress,
    startDate: project.startDate,
    deadline: project.deadline,
    overdueTasks
  })

  return repo.update(id, { progress, risk })
}

/**
 * Permanently destroy a project and everything hanging off it.
 *
 * Irreversible, so the caller must echo the project code back: an accidental
 * click cannot satisfy that, only a deliberate one can. Blobs are removed
 * before the rows, and activity rows are cleared explicitly because they
 * carry a denormalised projectId rather than a foreign key.
 */
export async function hardDelete(id: string, confirmCode: string) {
  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, code: true, name: true }
  })
  if (!project) throw notFound('Project')

  if (confirmCode.trim().toUpperCase() !== project.code.toUpperCase()) {
    throw badRequest('Type the project code to confirm permanent deletion')
  }

  const documents = await prisma.document.findMany({
    where: { projectId: id },
    select: { fileUrl: true }
  })

  await prisma.$transaction(async tx => {
    // Not covered by a cascade: projectId here is a plain indexed column.
    await tx.activityLog.deleteMany({ where: { projectId: id } })
    await tx.document.deleteMany({ where: { projectId: id } })
    await tx.payment.deleteMany({ where: { projectId: id } })
    await tx.invoice.deleteMany({ where: { projectId: id } })
    await tx.project.delete({ where: { id } })
  })

  // Blobs last: a failure here leaves orphaned files, not orphaned rows.
  for (const document of documents) {
    if (document.fileUrl.startsWith('/uploads/')) {
      await storage.remove(document.fileUrl.replace('/uploads/', ''))
    }
  }

  return project
}
