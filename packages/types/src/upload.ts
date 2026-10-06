/**
 * Upload limits shared by the API and the web client, so the size the browser
 * refuses up front is the same size the server would reject.
 */
export const UPLOAD_LIMITS = {
  /** Largest file accepted, whichever way it travels. */
  MAX_FILE_BYTES: 1024 * 1024 * 1024,
  /**
   * One chunk of a chunked upload.
   *
   * Sized well under the production proxy's 64 MB request cap, and large
   * enough that a 1 GB file is 64 requests rather than hundreds against the
   * API rate limit.
   */
  CHUNK_BYTES: 16 * 1024 * 1024,
  /** Old multipart endpoints buffer in memory, so they stay small. */
  MAX_SINGLE_REQUEST_BYTES: 64 * 1024 * 1024
} as const

/** What a finished chunked upload turns into. */
export const UPLOAD_KIND = {
  DOCUMENT: 'document',
  VERSION: 'version'
} as const
export type UploadKind = (typeof UPLOAD_KIND)[keyof typeof UPLOAD_KIND]

/** An upload session as the API reports it. */
export interface UploadSessionInfo {
  id: string
  kind: UploadKind
  fileName: string
  mimeType: string
  size: number
  chunkSize: number
  chunkCount: number
  /** Chunk indexes already stored, so an interrupted upload can resume. */
  received: number[]
  expiresAt: string
}
