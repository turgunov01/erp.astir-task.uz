import type { AuthUser } from '@astir/types'

declare global {
  namespace Express {
    interface Request {
      /** Populated by the authenticate middleware. */
      user?: AuthUser
    }
  }
}

export {}
