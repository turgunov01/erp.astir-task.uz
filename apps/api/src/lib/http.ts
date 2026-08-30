import type { Response } from 'express'
import type { PaginationMeta } from '@astir/types'

/** Envelope helpers so no controller hand-rolls a response shape (spec 66). */

export function sendItem<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ data })
}

export function sendList<T>(
  res: Response,
  data: T[],
  meta: PaginationMeta,
  status = 200
) {
  return res.status(status).json({ data, meta })
}

export function sendNoContent(res: Response) {
  return res.status(204).send()
}

export function buildMeta(total: number, page: number, limit: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    pages: limit > 0 ? Math.ceil(total / limit) : 0
  }
}

/** Translates page/limit into Prisma skip/take. */
export function toSkipTake(page: number, limit: number) {
  return { skip: (page - 1) * limit, take: limit }
}
