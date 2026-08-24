import app from '@adonisjs/core/services/app'
import { type HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import { ListNotFoundException } from '#exceptions/list_access_exceptions'

/**
 * better-sqlite3 surfaces a unique-constraint violation as `SqliteError` with
 * `code: 'SQLITE_CONSTRAINT_UNIQUE'` — knex/Lucid pass that property through
 * unchanged, so this is a plain check of the error's own `code`.
 */
function isUniqueConstraintError(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code
  return typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT')
}

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * The method is used for handling errors and returning
   * response to the client
   */
  async handle(error: unknown, ctx: HttpContext) {
    if (isUniqueConstraintError(error)) {
      return ctx.response.status(422).send({
        errors: [{ message: 'That name is already in use.' }],
      })
    }

    return super.handle(error, ctx)
  }

  /**
   * The method is used to report error to the logging service or
   * the a third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   *
   * Two adjustments to the base handler's default reporting, both discovered
   * by reading `shouldReport`/`toHttpError` rather than from an incident:
   *
   * 1. A raw `SqliteError` from a unique-constraint hit has no `.status`, so
   *    `toHttpError` defaults it to 500 — meaning every "that name is already
   *    in use" 422 (handled above, a routine and expected case) was actually
   *    being logged as an `error`-level 500 with a full stack trace. Report
   *    it at `debug` instead so real 500s aren't buried in that noise.
   * 2. `shouldReport` ignores status 400 outright, which silently swallows
   *    failed-login attempts (`E_INVALID_CREDENTIALS` is a 400) — the one
   *    unauthenticated, internet-facing endpoint group `start/limiter.ts`
   *    already calls out as "the actual brute-force/credential-stuffing
   *    target". Log those explicitly at `warn` so a spike is visible.
   * 3. The base handler logs a bare "List not found" with nothing but the
   *    request id, so a recurring one can't be traced to a user or list.
   *    `ListNotFoundException` now carries that context (see
   *    `list_access_exceptions.ts`) — log it explicitly and skip the base
   *    logging (status 404 isn't in `ignoreStatuses`, so it would otherwise
   *    also get logged bare).
   */
  async report(error: unknown, ctx: HttpContext) {
    if (isUniqueConstraintError(error)) {
      ctx.logger.debug(
        { method: ctx.request.method(), url: ctx.request.url() },
        'unique constraint violation, responding 422'
      )
      return
    }

    if (error instanceof ListNotFoundException) {
      ctx.logger.warn(error.context, 'List not found')
      return
    }

    const code = (error as { code?: unknown })?.code
    if (code === 'E_INVALID_CREDENTIALS') {
      ctx.logger.warn(
        { email: ctx.request.input('email'), ip: ctx.request.ip() },
        'login attempt with invalid credentials'
      )
    }

    return super.report(error, ctx)
  }
}
