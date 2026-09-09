import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { Authenticators } from '@adonisjs/auth/types'

/**
 * Auth middleware is used authenticate HTTP requests and deny
 * access to unauthenticated users.
 */
export default class AuthMiddleware {
  async handle(
    ctx: HttpContext,
    next: NextFn,
    options: {
      guards?: (keyof Authenticators)[]
    } = {}
  ) {
    await ctx.auth.authenticateUsing(options.guards)

    // Checked here rather than only at login, so disabling a user (see
    // admin_users_controller.ts) takes effect on every route immediately —
    // including for tokens that were already issued before the account was disabled.
    if (ctx.auth.user?.disabledAt) {
      return ctx.response.forbidden({ message: 'This account has been disabled.' })
    }

    return next()
  }
}
