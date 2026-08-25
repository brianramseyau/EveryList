import env from '#start/env'
import app from '@adonisjs/core/services/app'
import type { HttpContext } from '@adonisjs/core/http'
import type { DebugResponse } from '@everylist/shared'
import { presence, toMb } from '#services/debug_info'

export default class DebugController {
  /**
   * Runtime/environment diagnostics for troubleshooting a self-hosted deployment — built after a
   * real incident where a container was silently running with the wrong APP_URL (a leading space
   * in an Unraid-entered env var, preserved by Unraid's quoting) and the only way to catch it was
   * `docker exec ... env`. This surfaces the same resolved config from inside the app itself.
   *
   * There's no admin role in this app (see routes.ts's backup-settings comment) and this page
   * dumps resolved config, so it's hard-coded to user id 1 — the account that necessarily created
   * this instance's first list — rather than any role/permission flag that could be granted away
   * by mistake.
   */
  async show({ auth, request, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()

    if (user.id !== 1) {
      logger.warn({ userId: user.id }, 'debug endpoint access denied')
      return response.forbidden({ message: 'Not authorized' })
    }

    const memory = process.memoryUsage()

    const body: DebugResponse = {
      app: {
        version: env.get('APP_VERSION', 'nightly'),
        commit: env.get('GIT_SHA', 'unknown'),
        builtAt: env.get('BUILD_DATE', 'unknown'),
        nodeEnv: env.get('NODE_ENV'),
        appUrl: env.get('APP_URL'),
      },
      runtime: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        uptimeSeconds: Math.round(process.uptime()),
        memoryUsageMb: {
          rss: toMb(memory.rss),
          heapTotal: toMb(memory.heapTotal),
          heapUsed: toMb(memory.heapUsed),
          external: toMb(memory.external),
        },
      },
      request: {
        // What the reverse proxy actually forwarded — the fastest way to catch a
        // misconfigured proxy_set_header/Host passthrough from inside the app. HTTP
        // requires a Host header on every request, so this is never actually absent.
        hostHeader: request.header('host'),
        protocol: request.protocol(),
        ip: request.ip(),
      },
      env: {
        NODE_ENV: env.get('NODE_ENV'),
        PORT: env.get('PORT'),
        HOST: env.get('HOST'),
        LOG_LEVEL: env.get('LOG_LEVEL'),
        APP_URL: env.get('APP_URL'),
        DATABASE_FILENAME: env.get('DATABASE_FILENAME', app.tmpPath('db.sqlite3')),
        SESSION_DRIVER: env.get('SESSION_DRIVER'),
        PUBLIC_SIGNUP_ENABLED: env.get('PUBLIC_SIGNUP_ENABLED', true),
        LIMITER_STORE: env.get('LIMITER_STORE'),
        SMTP2GO_HOST: env.get('SMTP2GO_HOST') ?? null,
        SMTP2GO_PORT: env.get('SMTP2GO_PORT') ?? null,
        SMTP2GO_USERNAME: env.get('SMTP2GO_USERNAME') ?? null,
        SMTP2GO_PASSWORD: presence(env.get('SMTP2GO_PASSWORD')),
        SMTP2GO_FROM_ADDRESS: env.get('SMTP2GO_FROM_ADDRESS') ?? null,
        SMTP2GO_FROM_NAME: env.get('SMTP2GO_FROM_NAME') ?? null,
        ALEXA_SKILL_ID: env.get('ALEXA_SKILL_ID') ?? null,
        AUTHENTIK_TOKEN_URL: env.get('AUTHENTIK_TOKEN_URL') ?? null,
        AUTHENTIK_USERINFO_URL: env.get('AUTHENTIK_USERINFO_URL') ?? null,
        AUTHENTIK_CLIENT_ID: env.get('AUTHENTIK_CLIENT_ID') ?? null,
        AUTHENTIK_CLIENT_SECRET: presence(env.get('AUTHENTIK_CLIENT_SECRET')),
      },
    }

    logger.debug({ userId: user.id }, 'served debug info')

    return response.ok(body)
  }
}
