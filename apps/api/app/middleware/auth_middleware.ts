import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { Authenticators } from '@adonisjs/auth/types'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'

/** Minimum gap between `last_seen_at` writes per user, so a busy session costs one write a
 * minute rather than one per request. */
const LAST_SEEN_WRITE_INTERVAL_SECONDS = 60

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

    const user = ctx.auth.user
    // An admin impersonating a user isn't that user interacting with the app, so it doesn't
    // count toward their "last seen".
    if (user && !user.isImpersonated) {
      const now = DateTime.now()
      if (
        !user.lastSeenAt ||
        now.diff(user.lastSeenAt, 'seconds').seconds >= LAST_SEEN_WRITE_INTERVAL_SECONDS
      ) {
        try {
          // Query-builder update rather than `user.save()` so `updatedAt` isn't bumped too. The
          // builder skips the model's column `prepare`, so format the way the dialect (and thus
          // a normal model save) would.
          await db
            .from('users')
            .where('id', user.id)
            .update({ last_seen_at: now.toFormat(db.connection().dialect.dateTimeFormat) })
          user.lastSeenAt = now
        } catch (error) {
          // Best-effort bookkeeping: a failed write must never turn a valid request into a 500.
          ctx.logger.warn({ err: error, userId: user.id }, 'failed to record last seen')
        }
      }
    }

    return next()
  }
}
