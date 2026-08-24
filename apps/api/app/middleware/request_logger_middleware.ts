import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * There was previously no per-request access log at all — nothing to grep
 * when a client reports "it didn't work" beyond whatever a specific
 * controller happened to log for its own case. Registered first in
 * `start/kernel.ts`'s server middleware stack, so it wraps every request
 * (including ones that 404 or fail in an earlier server middleware) and
 * measures the whole pipeline's duration.
 */
export default class RequestLoggerMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const start = performance.now()

    try {
      await next()
    } finally {
      const durationMs = Math.round(performance.now() - start)
      ctx.logger.debug(
        {
          method: ctx.request.method(),
          url: ctx.request.url(true),
          status: ctx.response.getStatus(),
          durationMs,
          userId: ctx.auth?.user?.id,
        },
        'request handled'
      )
    }
  }
}
