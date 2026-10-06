import { UPLOAD_LIMITS, type UploadKind, type UploadSessionInfo } from '@astir/types'

/**
 * Chunked upload of one file at a time (up to 1 GB).
 *
 * The file is opened as a session on the API, sent in 16 MB chunks (each its
 * own request, well under the production proxy's body limit) and then
 * assembled server-side into a Document or a Version. A chunk that fails on
 * the network, a 5xx or a rate limit is retried on its own a few times; an
 * access token that expires during a long upload is refreshed and the chunk
 * resent. Progress is reported per byte via XHR upload events.
 */

const MAX_ATTEMPTS = 4
const RETRY_BASE_MS = 1000

export interface ChunkedUploadOptions {
  kind: UploadKind
  /** Metadata of the record the file becomes, e.g. { projectId, type }. */
  fields: Record<string, unknown>
}

/** Thrown when the user cancels; callers usually show nothing for it. */
export class UploadCancelledError extends Error {
  constructor() {
    super('Загрузка отменена')
    this.name = 'UploadCancelledError'
  }
}

export function isUploadCancelled(err: unknown): boolean {
  return err instanceof UploadCancelledError
}

type ErrorEnvelope = { error?: { code?: string, message?: string } } | undefined

/** Carries the same `data` envelope $fetch errors do, so apiErrorMessage() reads both alike. */
export class UploadRequestError extends Error {
  readonly statusCode: number
  readonly data: ErrorEnvelope

  constructor(statusCode: number, data: ErrorEnvelope) {
    super(data?.error?.message ?? 'Upload request failed with status ' + statusCode)
    this.name = 'UploadRequestError'
    this.statusCode = statusCode
    this.data = data
  }
}

function requestError(statusCode: number, message: string): UploadRequestError {
  return new UploadRequestError(statusCode, { error: { message } })
}

function statusOf(err: unknown): number {
  const value = err as { statusCode?: number, status?: number } | null
  return value?.statusCode ?? value?.status ?? 0
}

/** Network drops, timeouts, rate limits and server faults are worth another try. */
function isRetryable(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new UploadCancelledError())
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new UploadCancelledError())
    }, { once: true })
  })
}

function parseErrorBody(text: string): ErrorEnvelope {
  try {
    return JSON.parse(text) as ErrorEnvelope
  } catch {
    // A proxy error page rather than the API's JSON; the status still tells.
    return undefined
  }
}

/** One chunk over XHR: fetch() cannot report upload progress. */
function sendChunk(
  url: string,
  blob: Blob,
  signal: AbortSignal,
  onProgress: (loaded: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new UploadCancelledError())
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.withCredentials = true
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.upload.onprogress = event => onProgress(event.loaded)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      reject(new UploadRequestError(xhr.status, parseErrorBody(xhr.responseText)))
    }
    xhr.onerror = () => reject(requestError(0, 'Нет связи с сервером'))
    xhr.ontimeout = () => reject(requestError(408, 'Сервер не ответил вовремя'))
    xhr.onabort = () => reject(new UploadCancelledError())
    signal.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(blob)
  })
}

/** Rotate the session cookies after a 401 mid-upload. */
async function refreshSession() {
  await $fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
}

/** A JSON call that survives one access-token expiry. */
async function apiCall<T>(path: string, options: Parameters<typeof $fetch>[1]): Promise<T> {
  try {
    return await $fetch<T>(path, { credentials: 'include', ...options })
  } catch (err) {
    if (statusOf(err) !== 401) throw err
    await refreshSession()
    return $fetch<T>(path, { credentials: 'include', ...options })
  }
}

export function useChunkedUpload() {
  /** 0 to 100 for the file in flight. */
  const progress = ref(0)
  const uploading = ref(false)
  const fileName = ref('')
  let controller: AbortController | null = null
  let sessionId: string | null = null

  function report(sentBytes: number, total: number) {
    // 100 is reserved for "assembled and saved", not merely "sent".
    progress.value = Math.min(99, Math.floor((sentBytes / total) * 100))
  }

  async function sendWithRetry(
    url: string,
    blob: Blob,
    signal: AbortSignal,
    onProgress: (loaded: number) => void
  ) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await sendChunk(url, blob, signal, onProgress)
        return
      } catch (err) {
        if (isUploadCancelled(err)) throw err
        const status = statusOf(err)
        if (status === 401 && attempt < MAX_ATTEMPTS) {
          await refreshSession()
          continue
        }
        if (!isRetryable(status) || attempt >= MAX_ATTEMPTS) throw err
        onProgress(0)
        await wait(RETRY_BASE_MS * 2 ** (attempt - 1), signal)
      }
    }
  }

  async function sendChunks(file: File, session: UploadSessionInfo, signal: AbortSignal) {
    const received = new Set(session.received)
    let sentBytes = session.received.length * session.chunkSize
    for (let index = 0; index < session.chunkCount; index += 1) {
      if (received.has(index)) continue
      const start = index * session.chunkSize
      const blob = file.slice(start, Math.min(file.size, start + session.chunkSize))
      const url = '/api/uploads/' + session.id + '/chunks/' + index
      await sendWithRetry(url, blob, signal, loaded => report(sentBytes + loaded, file.size))
      sentBytes += blob.size
      report(sentBytes, file.size)
    }
  }

  /** Upload one file; resolves to the created Document or Version. */
  async function upload<T = unknown>(file: File, options: ChunkedUploadOptions): Promise<T> {
    if (file.size === 0) throw requestError(400, 'Файл «' + file.name + '» пустой')
    if (file.size > UPLOAD_LIMITS.MAX_FILE_BYTES) {
      throw requestError(400, 'Файл «' + file.name + '» больше 1 ГБ')
    }

    controller = new AbortController()
    const signal = controller.signal
    uploading.value = true
    fileName.value = file.name
    progress.value = 0

    try {
      const opened = await apiCall<{ data: UploadSessionInfo }>('/api/uploads', {
        method: 'POST',
        body: {
          kind: options.kind,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          fields: options.fields
        }
      })
      sessionId = opened.data.id
      await sendChunks(file, opened.data, signal)
      if (signal.aborted) throw new UploadCancelledError()

      const done = await apiCall<{ data: { record: T } }>(
        '/api/uploads/' + sessionId + '/complete',
        { method: 'POST' }
      )
      sessionId = null
      progress.value = 100
      return done.data.record
    } catch (err) {
      // A failed upload starts over next time; its chunks are of no further use.
      discardSession()
      throw err
    } finally {
      uploading.value = false
      controller = null
    }
  }

  function discardSession() {
    const id = sessionId
    sessionId = null
    if (!id) return
    // Best effort: an abandoned session is also swept by the server after 24 h,
    // and the user is already being told why the upload stopped.
    $fetch('/api/uploads/' + id, { method: 'DELETE', credentials: 'include' })
      .catch(() => undefined)
  }

  /** Stop the file in flight and discard what the server already holds. */
  function cancel() {
    controller?.abort()
    discardSession()
  }

  onBeforeUnmount(cancel)

  return {
    progress: readonly(progress),
    uploading: readonly(uploading),
    fileName: readonly(fileName),
    upload,
    cancel
  }
}
