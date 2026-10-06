import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import multer from 'multer'
import { Prisma } from '@prisma/client'
import { ERROR_CODE } from '@astir/types'
import { AppError } from '../lib/errors'
import { logger } from '../lib/logger'
import { isProduction } from '../config/env'

/** Collapse a ZodError into the field-keyed details shape (spec 67). */
function zodDetails(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_'
    details[key] = [...(details[key] ?? []), issue.message]
  }
  return details
}

/**
 * First meaningful line of an error message, capped.
 *
 * Prisma messages open with a blank line and then quote the source file and
 * query, so neither the raw message nor a naive first-line slice is usable:
 * one leaks paths, the other is empty.
 */
function firstLine(message: string) {
  const line = message
    .split(String.fromCharCode(10))
    .map(part => part.trim())
    .find(part => part.length > 0)
  return (line ?? 'Неизвестная ошибка').slice(0, 200)
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: {
      code: ERROR_CODE.NOT_FOUND,
      message: 'Адрес ' + req.method + ' ' + req.path + ' не существует'
    }
  })
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof AppError) {
    // Expected failure: log at warn, no stack noise.
    logger.warn({ code: err.code, path: req.path }, err.message)
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details }
    })
  }

  // The legacy multipart endpoints cap a single request; larger files go in chunks.
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: {
        code: ERROR_CODE.VALIDATION_FAILED,
        message: 'Файл слишком большой для одного запроса — загрузите его по частям через /api/uploads'
      }
    })
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        code: ERROR_CODE.VALIDATION_FAILED,
        message: 'Проверьте заполнение полей',
        details: zodDetails(err)
      }
    })
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'field'
      return res.status(409).json({
        success: false,
        error: { code: ERROR_CODE.CONFLICT, message: 'Запись с таким значением уже существует (' + target + ')' }
      })
    }
    if (err.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: { code: ERROR_CODE.NOT_FOUND, message: 'Запись не найдена' }
      })
    }
    if (err.code === 'P2003') {
      return res.status(409).json({
        success: false,
        error: { code: ERROR_CODE.CONFLICT, message: 'Связанная запись не найдена или ещё используется' }
      })
    }
  }

  /*
   * The database being unreachable is an environment problem, not a defect
   * in this code. It answers 503 so a monitor, a client and a developer can
   * all tell the two apart, and the message stays free of connection strings
   * and source paths that Prisma puts in its own.
   */
  const unreachableCodes = ['P1000', 'P1001', 'P1002', 'P1008', 'P1017']
  const isUnreachable =
    err instanceof Prisma.PrismaClientInitializationError ||
    (err instanceof Prisma.PrismaClientKnownRequestError &&
      unreachableCodes.includes(err.code))

  if (isUnreachable) {
    logger.error({ path: req.path, method: req.method }, 'database unreachable')
    return res.status(503).json({
      success: false,
      error: {
        code: ERROR_CODE.SERVICE_UNAVAILABLE,
        message: 'База данных недоступна. Попробуйте ещё раз, когда соединение восстановится.'
      }
    })
  }

  // Anything reaching here is a genuine defect.
  logger.error({ err, path: req.path, method: req.method }, 'unhandled error')
  return res.status(500).json({
    success: false,
    error: {
      code: ERROR_CODE.INTERNAL_ERROR,
      // Outside production the message helps debugging, but a Prisma error
      // embeds the source path and query, so those are cut to one line.
      message: isProduction
        ? 'Внутренняя ошибка сервера'
        : err instanceof Error
          ? firstLine(err.message)
          : 'Неизвестная ошибка'
    }
  })
}
