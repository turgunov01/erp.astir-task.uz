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

/**
 * A page of rows plus figures about every row the filter matched, not just
 * this page — per-currency totals on the finance lists.
 */
export function sendListWithSummary<T, S>(
  res: Response,
  data: T[],
  meta: PaginationMeta,
  summary: S
) {
  return res.status(200).json({ data, meta, summary })
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
