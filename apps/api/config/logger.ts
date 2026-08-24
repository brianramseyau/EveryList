import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig, syncDestination, destination } from '@adonisjs/core/logger'

const loggerConfig = defineConfig({
  /**
   * Default logger name used by ctx.logger and app logger calls.
   */
  default: 'app',

  loggers: {
    app: {
      /**
       * Toggle this logger on/off.
       */
      enabled: true,

      /**
       * Logger name shown in log records.
       */
      name: env.get('APP_NAME'),

      /**
       * Minimum level to output (trace, debug, info, warn, error, fatal).
       */
      level: env.get('LOG_LEVEL'),

      /**
       * ISO8601 timestamps instead of pino's default epoch milliseconds.
       */
      timestamp: 'iso',

      /**
       * Log the level's label ("warn") instead of its numeric value (40).
       */
      formatters: {
        level: (label) => ({ level: label }),
      },

      /**
       * Non-production gets a sync destination for immediate flush.
       * Production writes straight to stdout via a plain pino destination
       * stream rather than `transport.targets` — pino's worker-thread
       * transports can't accept the `formatters.level` function above
       * ("option.transport.targets do not allow custom level formatters"),
       * so a plain destination is the only way to get human-readable
       * levels in production too.
       */
      destination: !app.inProduction ? await syncDestination() : destination(1),
    },
  },
})

export default loggerConfig

/**
 * Inferring types for the list of loggers you have configured
 * in your application.
 */
declare module '@adonisjs/core/types' {
  export interface LoggersList extends InferLoggers<typeof loggerConfig> {}
}
