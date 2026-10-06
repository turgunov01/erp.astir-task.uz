import type { Readable } from 'node:stream'
import { prisma } from '../../lib/prisma'
import { badRequest, notFound } from '../../lib/errors'
import { recordActivity } from '../../lib/activity'
import { storage } from '../../lib/storage'

export const DOCUMENT_TYPES = [
  'CONTRACT', 'BRIEF', 'SPECIFICATION', 'INVOICE', 'ACT', 'NDA', 'OTHER'
] as const

/**
 * Relations a document can hang from, and how to find the project it belongs
 * to.
 *
 * Every table in the app lets a file be attached to the record being created,
 * so the owner is looked up in this table rather than being another branch in
 * the upload handler for each new entity.
 */
/** The owning row, seen loosely: only the project link is read off it. */
type OwnerRow = Record<string, unknown> & {
  projectId?: string | null
  version?: { projectId: string } | null
}

interface OwnerSpec {
  /** Prisma delegate key. */
  model: string
  /** Project the document should also be filed under, when there is one. */
  project: (row: OwnerRow) => string | null
}

const OWNERS = {
  taskId: { model: 'task', project: row => row.projectId ?? null },
  reviewId: { model: 'review', project: row => row.version?.projectId ?? null },
  assetId: { model: 'asset', project: row => row.projectId ?? null },
  renderJobId: { model: 'renderJob', project: row => row.projectId ?? null },
  episodeId: { model: 'episode', project: row => row.projectId ?? null },
  sceneId: { model: 'scene', project: row => row.projectId ?? null },
  shotId: { model: 'shot', project: row => row.projectId ?? null },
  revisionId: { model: 'revision', project: row => row.projectId ?? null },
  departmentId: { model: 'department', project: () => null },
  employeeId: { model: 'employee', project: () => null }
} satisfies Record<string, OwnerSpec>

export type OwnerKey = keyof typeof OWNERS

export const OWNER_KEYS = Object.keys(OWNERS) as OwnerKey[]

/** Upload metadata, as form fields or as a chunked session's JSON. */
export type DocumentFields = Partial<Record<OwnerKey | 'projectId' | 'clientId' | 'type' | 'name', string | null>>

/** Where a document ends up once its owner has been checked. */
export interface DocumentTarget {
  projectId: string | null
  clientId: string | null
  owners: Partial<Record<OwnerKey, string>>
}

/** The blob of an upload, however it arrived. */
export interface IncomingFile {
  stream: Readable
  originalName: string
  mimeType: string
}

async function findOwner(key: OwnerKey, id: string): Promise<OwnerRow> {
  const spec: OwnerSpec = OWNERS[key]
  const delegate = (prisma as unknown as Record<string, {
    findFirst(args: unknown): Promise<OwnerRow | null>
  } | undefined>)[spec.model]
  if (!delegate) throw badRequest('Неизвестно, к чему прикрепить файл: ' + key)
  const row = await delegate.findFirst({
    where: { id, deletedAt: null },
    include: key === 'reviewId' ? { version: { select: { projectId: true } } } : undefined
  })
  if (!row) throw notFound(spec.model)
  return row
}

/**
 * Resolve whichever owner was sent.
 *
 * The owner is verified to exist before the blob is written, and the document
 * inherits its project so the upload also shows up in the project file list
 * without the caller passing both.
 */
export async function resolveDocumentTarget(fields: DocumentFields): Promise<DocumentTarget> {
  let projectId = fields.projectId || null
  const clientId = fields.clientId || null

  const owners: Partial<Record<OwnerKey, string>> = {}
  for (const key of OWNER_KEYS) {
    const value = fields[key]
    if (!value) continue
    const row = await findOwner(key, value)
    owners[key] = value
    projectId = projectId ?? OWNERS[key].project(row)
  }

  if (!projectId && !clientId && Object.keys(owners).length === 0) {
    throw badRequest('Прикрепите файл к записи, проекту или клиенту')
  }

  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true }
    })
    if (!project) throw notFound('Project')
  }

  return { projectId, clientId, owners }
}

function storagePrefix(target: DocumentTarget): string {
  if (target.projectId) return 'projects/' + target.projectId
  if (target.clientId) return 'clients/' + target.clientId
  return 'shared'
}

function documentType(value: string | null | undefined) {
  return DOCUMENT_TYPES.find(type => type === value) ?? 'OTHER'
}

/**
 * Store an upload and file it as a document.
 *
 * The single path both the multipart endpoint and a completed chunked upload
 * go through, so the two can never disagree on where a file lands.
 */
export async function createDocument(input: {
  fields: DocumentFields
  file: IncomingFile
  actorId?: string
}) {
  const target = await resolveDocumentTarget(input.fields)

  const stored = await storage.save({
    stream: input.file.stream,
    originalName: input.file.originalName,
    mimeType: input.file.mimeType,
    prefix: storagePrefix(target)
  })

  const document = await prisma.document.create({
    data: {
      projectId: target.projectId,
      clientId: target.clientId,
      ...target.owners,
      type: documentType(input.fields.type),
      name: input.fields.name?.trim() || input.file.originalName,
      fileUrl: stored.url,
      fileSize: BigInt(stored.size),
      mimeType: stored.mimeType,
      uploadedById: input.actorId ?? null
    },
    include: {
      uploadedBy: { select: { id: true, firstName: true, lastName: true } },
      task: { select: { id: true, title: true, status: true } }
    }
  }).catch(async (err: unknown) => {
    // A blob no row points at is unreachable; drop it with the failed write.
    await storage.remove(stored.key)
    throw err
  })

  await recordActivity({
    actorId: input.actorId,
    entityType: 'Document',
    entityId: document.id,
    projectId: target.projectId,
    action: 'file.uploaded',
    metadata: { name: document.name, size: stored.size }
  })

  return document
}
