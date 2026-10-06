import { createWriteStream } from 'node:fs'
import { mkdir, unlink } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { Readable, Transform } from 'node:stream'
import { UPLOAD_LIMITS } from '@astir/types'
import { env } from '../config/env'

/**
 * Storage abstraction (spec 27).
 *
 * Everything upstream depends on this interface rather than the filesystem, so
 * swapping in S3, R2, MinIO or GCS later is a new implementation and a config
 * change, not a rewrite of the upload paths.
 */
export interface StoredFile {
  key: string
  url: string
  size: number
  mimeType: string
  originalName: string
}

export interface StorageProvider {
  /**
   * Write a blob from a stream. The stream is consumed exactly once; the size
   * is whatever actually arrived, never what the client claimed.
   */
  save(input: {
    stream: Readable
    originalName: string
    mimeType: string
    /** Logical folder, e.g. "projects/<id>". */
    prefix: string
  }): Promise<StoredFile>
  remove(key: string): Promise<void>
}

/** Counts the bytes passing through, for the stored size. */
function byteCounter() {
  let bytes = 0
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length
      callback(null, chunk)
    }
  })
  return { stream, bytes: () => bytes }
}

/** Local disk provider used in development and single-server deployments. */
class LocalStorageProvider implements StorageProvider {
  private readonly root: string

  constructor(root: string) {
    this.root = root
  }

  async save(input: {
    stream: Readable
    originalName: string
    mimeType: string
    prefix: string
  }): Promise<StoredFile> {
    // Never trust the client filename for the path: keep only its extension.
    const extension = extname(input.originalName).slice(0, 12)
    const key = input.prefix + '/' + randomUUID() + extension
    const target = join(this.root, key)
    const counter = byteCounter()

    await mkdir(dirname(target), { recursive: true })
    try {
      await pipeline(input.stream, counter.stream, createWriteStream(target))
    } catch (err) {
      // A half-written blob is never referenced by a row; do not leave it behind.
      await unlink(target).catch(() => undefined)
      throw err
    }

    return {
      key,
      url: '/uploads/' + key,
      size: counter.bytes(),
      mimeType: input.mimeType,
      originalName: input.originalName
    }
  }

  async remove(key: string): Promise<void> {
    await unlink(join(this.root, key)).catch(() => undefined)
  }
}

function createProvider(): StorageProvider {
  switch (env.STORAGE_PROVIDER) {
    case 'local':
      return new LocalStorageProvider(env.STORAGE_PATH)
    default:
      // Fail loudly rather than silently writing to disk under a config that
      // claims to be using object storage.
      throw new Error(
        'Storage provider "' + env.STORAGE_PROVIDER + '" is not implemented yet'
      )
  }
}

export const storage: StorageProvider = createProvider()

/** A buffered upload (multer memory storage) as a stream for storage.save. */
export function bufferStream(buffer: Buffer): Readable {
  return Readable.from([buffer])
}

/** Accepted upload types, checked against the sniffed mime type (spec 59). */
export const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/']

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv'
])

export function isAllowedMimeType(mimeType: string): boolean {
  if (ALLOWED_MIME_PREFIXES.some(prefix => mimeType.startsWith(prefix))) return true
  return ALLOWED_MIME_TYPES.has(mimeType)
}

/** Largest file accepted, through the chunked upload API. */
export const MAX_UPLOAD_BYTES = UPLOAD_LIMITS.MAX_FILE_BYTES

/**
 * The legacy single-request multipart endpoints buffer the whole file in
 * memory, so they keep a much smaller cap; anything larger goes in chunks.
 */
export const MAX_SINGLE_REQUEST_BYTES = UPLOAD_LIMITS.MAX_SINGLE_REQUEST_BYTES
