import app from '@adonisjs/core/services/app'
import { type HttpContext, ExceptionHandler } from '@adonisjs/core/http'

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
   */
  async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }
}
