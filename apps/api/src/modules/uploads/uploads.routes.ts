import { Router, type Request } from 'express'
import type { AuthUser } from '@astir/types'
import {
  createUploadSessionSchema,
  idParamSchema,
  uploadChunkParamsSchema
} from '@astir/validation'
import { authenticate } from '../../middleware/auth'
import { validate } from '../../middleware/validate'
import { sendItem, sendNoContent } from '../../lib/http'
import { unauthenticated } from '../../lib/errors'
import * as service from './uploads.service'

/**
 * Chunked uploads (files and versions up to 1 GB).
 *
 *   POST   /api/uploads                    open a session, get chunk size and count
 *   PUT    /api/uploads/:id/chunks/:index  send one chunk as a raw binary body
 *   GET    /api/uploads/:id                which chunks have arrived, to resume
 *   POST   /api/uploads/:id/complete       assemble and create the Document/Version
 *   DELETE /api/uploads/:id                cancel and discard the chunks
 *
 * Each chunk is a request of its own, well under the proxy's body limit, and
 * a failed one is retried alone instead of restarting the whole file.
 * Permissions are those of the matching single-request endpoint, checked on
 * every call through the service.
 */
export const uploadsRouter = Router()

uploadsRouter.use(authenticate)

function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthenticated()
  return req.user
}

/** Content-Length when the client sent one; chunked transfer has none. */
function declaredLength(req: Request): number | null {
  const header = req.headers['content-length']
  if (!header) return null
  const value = Number(header)
  return Number.isFinite(value) ? value : null
}

uploadsRouter.post('/', validate(createUploadSessionSchema), async (req, res, next) => {
  try {
    return sendItem(res, await service.open(req.body, currentUser(req)), 201)
  } catch (err) {
    next(err)
  }
})

uploadsRouter.get('/:id', validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    return sendItem(res, await service.status(req.params.id as string, currentUser(req)))
  } catch (err) {
    next(err)
  }
})

// The body is streamed to disk as it arrives, never parsed or buffered.
uploadsRouter.put(
  '/:id/chunks/:index',
  validate(uploadChunkParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      const params = req.params as unknown as { id: string, index: number }
      const result = await service.putChunk(
        params.id,
        params.index,
        req,
        declaredLength(req),
        currentUser(req)
      )
      return sendItem(res, result)
    } catch (err) {
      // Whatever of the body was not read must not hold the connection open.
      req.resume()
      next(err)
    }
  }
)

uploadsRouter.post(
  '/:id/complete',
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const result = await service.complete(req.params.id as string, currentUser(req))
      return sendItem(res, result, 201)
    } catch (err) {
      next(err)
    }
  }
)

uploadsRouter.delete('/:id', validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    await service.cancel(req.params.id as string, currentUser(req))
    return sendNoContent(res)
  } catch (err) {
    next(err)
  }
})
