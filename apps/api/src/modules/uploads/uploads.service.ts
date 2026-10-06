import type { Readable } from 'node:stream'
import {
  PERMISSION,
  UPLOAD_KIND,
  UPLOAD_LIMITS,
  type AuthUser,
  type Permission,
  type UploadKind,
  type UploadSessionInfo
} from '@astir/types'
import type { CreateUploadSessionInput } from '@astir/validation'
import { badRequest, forbidden, notFound } from '../../lib/errors'
import { hasPermission } from '../../lib/rbac'
import { isAllowedMimeType, MAX_UPLOAD_BYTES } from '../../lib/storage'
import { createDocument, resolveDocumentTarget, type DocumentFields } from '../files/files.service'
import * as versions from '../versions/versions.service'
import type { CreateVersionInput } from '../versions/versions.service'
import * as sessions from './upload-sessions'

/** Open sessions one user may hold at once, so abandoned ones cannot fill the disk. */
const MAX_OPEN_SESSIONS_PER_USER = 20

/** The same permission the single-request endpoint for each kind requires. */
const KIND_PERMISSION: Record<UploadKind, Permission> = {
  [UPLOAD_KIND.DOCUMENT]: PERMISSION.DOCUMENT_MANAGE,
  [UPLOAD_KIND.VERSION]: PERMISSION.VERSION_UPLOAD
}

async function assertKindPermission(user: AuthUser, kind: UploadKind) {
  if (!(await hasPermission(user.role, KIND_PERMISSION[kind]))) {
    throw forbidden('Missing permission: ' + KIND_PERMISSION[kind])
  }
}

async function toInfo(session: sessions.UploadSession): Promise<UploadSessionInfo> {
  const activity = await sessions.lastActivity(session.id)
  return {
    id: session.id,
    kind: session.kind,
    fileName: session.fileName,
    mimeType: session.mimeType,
    size: session.size,
    chunkSize: session.chunkSize,
    chunkCount: session.chunkCount,
    received: await sessions.receivedChunks(session.id),
    expiresAt: new Date(activity.getTime() + sessions.SESSION_TTL_MS).toISOString()
  }
}

/**
 * The caller's live session.
 *
 * Another user's session answers "not found" rather than "forbidden", so ids
 * cannot be probed; an expired one is cleared on the spot.
 */
async function requireSession(id: string, user: AuthUser) {
  const session = await sessions.readSession(id)
  if (!session || session.userId !== user.id) throw notFound('Upload session')

  const idleFor = Date.now() - (await sessions.lastActivity(id)).getTime()
  if (idleFor > sessions.SESSION_TTL_MS) {
    await sessions.removeSession(id)
    throw notFound('Upload session')
  }

  await assertKindPermission(user, session.kind)
  return session
}

/** Fail on a bad owner now, not after the whole file has been sent. */
async function assertTarget(input: CreateUploadSessionInput) {
  if (input.kind === UPLOAD_KIND.DOCUMENT) {
    await resolveDocumentTarget(input.fields as DocumentFields)
    return
  }
  await versions.assertVersionTarget(input.fields)
}

export async function open(input: CreateUploadSessionInput, user: AuthUser) {
  await assertKindPermission(user, input.kind)

  if (input.size > MAX_UPLOAD_BYTES) throw badRequest('Файл больше 1 ГБ')
  if (!isAllowedMimeType(input.mimeType)) {
    throw badRequest('Тип файла ' + input.mimeType + ' не поддерживается')
  }
  await assertTarget(input)

  if ((await sessions.countUserSessions(user.id)) >= MAX_OPEN_SESSIONS_PER_USER) {
    throw badRequest('Слишком много незавершённых загрузок. Завершите или отмените их.')
  }

  const session = await sessions.createSession({
    userId: user.id,
    kind: input.kind,
    fileName: input.fileName,
    mimeType: input.mimeType,
    size: input.size,
    chunkSize: UPLOAD_LIMITS.CHUNK_BYTES,
    fields: input.fields
  })
  return toInfo(session)
}

export async function status(id: string, user: AuthUser) {
  return toInfo(await requireSession(id, user))
}

export async function putChunk(
  id: string,
  index: number,
  body: Readable,
  declaredLength: number | null,
  user: AuthUser
) {
  const session = await requireSession(id, user)
  if (index >= session.chunkCount) {
    throw badRequest('Номер части вне диапазона: ' + index + ' из ' + session.chunkCount)
  }
  const expected = sessions.expectedChunkBytes(session, index)
  if (declaredLength !== null && declaredLength !== expected) {
    throw badRequest('Часть ' + index + ' должна быть ' + expected + ' байт, а не ' + declaredLength)
  }

  await sessions.writeChunk(session, index, body)
  return { index, size: expected }
}

async function createRecord(session: sessions.UploadSession, actorId: string) {
  const file = {
    stream: sessions.assembledStream(session),
    originalName: session.fileName,
    mimeType: session.mimeType
  }
  if (session.kind === UPLOAD_KIND.DOCUMENT) {
    return createDocument({ fields: session.fields as DocumentFields, file, actorId })
  }
  const fields = session.fields as unknown as Omit<CreateVersionInput, 'file'>
  return versions.create({ ...fields, file }, actorId)
}

/**
 * Assemble the chunks into the final record.
 *
 * The file streams straight from the chunk files into storage, never through
 * memory, and the record is created by the same service code the multipart
 * endpoints use. The session is deleted only once that succeeds, so a failed
 * completion can simply be retried.
 */
export async function complete(id: string, user: AuthUser) {
  const session = await requireSession(id, user)

  const received = new Set(await sessions.receivedChunks(id))
  const missing = Array.from({ length: session.chunkCount }, (_, index) => index)
    .filter(index => !received.has(index))
  if (missing.length > 0) {
    throw badRequest('Получены не все части файла', {
      missing: missing.slice(0, 50).map(String)
    })
  }

  const release = await sessions.lockForCompletion(id)
  try {
    const record = await createRecord(session, user.id)
    await sessions.removeSession(id)
    return { kind: session.kind, record }
  } catch (err) {
    await release()
    throw err
  }
}

export async function cancel(id: string, user: AuthUser) {
  await requireSession(id, user)
  await sessions.removeSession(id)
}
