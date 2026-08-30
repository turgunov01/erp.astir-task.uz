import type { NextFunction, Request, Response } from 'express'
import type { ZodType } from 'zod'

type Source = 'body' | 'query' | 'params'

/**
 * Validate and REPLACE the request segment with the parsed result, so
 * downstream handlers receive coerced, trimmed, defaulted values rather than
 * raw strings (spec 68).
 */
export function validate(schema: ZodType, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source])
    if (!result.success) return next(result.error)

    if (source === 'query') {
      // Express 5 exposes req.query as a getter — assign onto a shadow field.
      Object.defineProperty(req, 'validatedQuery', {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true
      })
    } else {
      req[source] = result.data as never
    }
    next()
  }
}

/** Typed accessor for the value stashed by validate(schema, 'query'). */
export function validatedQuery<T>(req: Request): T {
  return (req as Request & { validatedQuery: T }).validatedQuery
}
