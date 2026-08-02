import type { AuthenticatedPrincipal } from '../modules/auth/auth.types.js'

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedPrincipal
    }
  }
}

export {}
