import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, open, readdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { UploadKind } from '@astir/types'
import { env } from '../../config/env'
import { badRequest, conflict } from '../../lib/errors'

/**
 * Chunked upload sessions, kept entirely on disk.
 *
 * One directory per session holds a manifest and one file per chunk. Nothing
 * lives in process memory, so a session survives an API restart, and a chunk
 * that arrives twice simply replaces the first copy. The staging area sits
 * outside STORAGE_PATH because that directory is served publicly.
 */
const ROOT = resolve(env.UPLOAD_TMP_PATH ?? join(env.STORAGE_PATH, '..', 'upload-sessions'))

/** A session nobody has touched for this long is abandoned. */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000

const MANIFEST = 'manifest.json'
const LOCK = 'complete.lock'
const PART_PATTERN = /^(\d+)\.part$/

export interface UploadSession {
  id: string
  userId: string
  kind: UploadKind
  fileName: string
  mimeType: string
  size: number
  chunkSize: number
  chunkCount: number
  /** Metadata for the record the upload becomes, already validated. */
  fields: Record<string, unknown>
  createdAt: string
}

function sessionDir(id: string) {
  return join(ROOT, id)
}

function partPath(id: string, index: number) {
  return join(sessionDir(id), index + '.part')
}

function isMissing(err: unknown) {
  return (err as NodeJS.ErrnoException)?.code === 'ENOENT'
}

export async function createSession(
  input: Omit<UploadSession, 'id' | 'chunkCount' | 'createdAt'>
): Promise<UploadSession> {
  const session: UploadSession = {
    ...input,
    id: randomUUID(),
    chunkCount: Math.ceil(input.size / input.chunkSize),
    createdAt: new Date().toISOString()
  }
  await mkdir(sessionDir(session.id), { recursive: true })
  await writeFile(join(sessionDir(session.id), MANIFEST), JSON.stringify(session))
  return session
}

/** The session, or null when it never existed, expired or was finished. */
export async function readSession(id: string): Promise<UploadSession | null> {
  try {
    const raw = await readFile(join(sessionDir(id), MANIFEST), 'utf8')
    return JSON.parse(raw) as UploadSession
  } catch (err) {
    if (isMissing(err)) return null
    throw err
  }
}

/** Last activity: every stored chunk renames a file into the directory. */
export async function lastActivity(id: string): Promise<Date> {
  return (await stat(sessionDir(id))).mtime
}

export async function receivedChunks(id: string): Promise<number[]> {
  const names = await readdir(sessionDir(id))
  return names
    .map(name => PART_PATTERN.exec(name)?.[1])
    .filter((index): index is string => index !== undefined)
    .map(Number)
    .sort((a, b) => a - b)
}

/** Every chunk is chunkSize bytes except the last, which takes the remainder. */
export function expectedChunkBytes(session: UploadSession, index: number): number {
  if (index < session.chunkCount - 1) return session.chunkSize
  return session.size - session.chunkSize * (session.chunkCount - 1)
}

/** Passes bytes through until more arrive than the chunk may hold. */
function sizeGuard(limit: number) {
  let bytes = 0
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length
      if (bytes > limit) {
        callback(badRequest('Часть файла больше заявленного размера'))
        return
      }
      callback(null, chunk)
    }
  })
  return { stream, bytes: () => bytes }
}

/**
 * Store one chunk.
 *
 * Written to a temporary name and renamed into place only once complete and
 * the right size, so a dropped connection never leaves a short chunk that
 * would pass for a received one. A retry of the same index overwrites it.
 */
export async function writeChunk(session: UploadSession, index: number, source: Readable) {
  const expected = expectedChunkBytes(session, index)
  const target = partPath(session.id, index)
  const temp = target + '.' + randomUUID() + '.tmp'
  const guard = sizeGuard(expected)

  try {
    await pipeline(source, guard.stream, createWriteStream(temp))
    if (guard.bytes() !== expected) {
      throw badRequest(
        'Часть ' + index + ' неполная: получено ' + guard.bytes() + ' из ' + expected + ' байт'
      )
    }
    await rename(temp, target)
  } catch (err) {
    await unlink(temp).catch(() => undefined)
    throw err
  }
}

/** Every chunk in order as one stream; files are opened only as they are reached. */
export function assembledStream(session: UploadSession): Readable {
  async function* chunks() {
    for (let index = 0; index < session.chunkCount; index += 1) {
      yield* createReadStream(partPath(session.id, index))
    }
  }
  return Readable.from(chunks())
}

/**
 * Claim the right to finish a session.
 *
 * Two completion requests racing (a retry after a timeout, say) must not both
 * create a record from the same chunks; the loser gets a conflict.
 */
export async function lockForCompletion(id: string): Promise<() => Promise<void>> {
  const lockPath = join(sessionDir(id), LOCK)
  try {
    const handle = await open(lockPath, 'wx')
    await handle.close()
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'EEXIST') {
      throw conflict('Загрузка уже завершается')
    }
    throw err
  }
  return () => unlink(lockPath).catch(() => undefined)
}

export async function removeSession(id: string) {
  await rm(sessionDir(id), { recursive: true, force: true })
}

async function sessionIds(): Promise<string[]> {
  try {
    const entries = await readdir(ROOT, { withFileTypes: true })
    return entries.filter(entry => entry.isDirectory()).map(entry => entry.name)
  } catch (err) {
    if (isMissing(err)) return []
    throw err
  }
}

/** Open sessions belonging to one user, to cap how much disk one user can hold. */
export async function countUserSessions(userId: string): Promise<number> {
  const sessions = await Promise.all((await sessionIds()).map(readSession))
  return sessions.filter(session => session?.userId === userId).length
}

/** Remove sessions idle for longer than the TTL; returns how many went. */
export async function sweepExpiredSessions(now = Date.now()): Promise<number> {
  let removed = 0
  for (const id of await sessionIds()) {
    const idleFor = now - (await lastActivity(id).catch(() => new Date(0))).getTime()
    if (idleFor < SESSION_TTL_MS) continue
    await removeSession(id)
    removed += 1
  }
  return removed
}
