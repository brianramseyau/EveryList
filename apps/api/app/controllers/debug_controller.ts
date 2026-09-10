import env from '#start/env'
import app from '@adonisjs/core/services/app'
import type { HttpContext } from '@adonisjs/core/http'
import type { DebugResponse } from '@everylist/shared'
import { toMb } from '#services/debug_info'
import { appUrl } from '#config/app'
import { serverConfigState } from '#services/server_config'

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
    const config = serverConfigState()
    // `(file)` marks a value resolved from /config/config.yaml rather than an env var — see
    // server_config.ts. Kept as a suffix rather than a separate field so DebugResponse's shape
    // (a flat env-var-name allowlist) doesn't need to change just for this.
    const withSource = (field: { value: string | number | boolean | null; source: string }) =>
      typeof field.value === 'string' && field.source === 'file'
        ? `${field.value} (file)`
        : field.value

    const body: DebugResponse = {
      app: {
        version: env.get('APP_VERSION', 'nightly'),
        commit: env.get('GIT_SHA', 'unknown'),
        builtAt: env.get('BUILD_DATE', 'unknown'),
        nodeEnv: env.get('NODE_ENV'),
        appUrl: appUrl(),
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
        // Below this point, values may come from /config/config.yaml rather than an env var —
        // see the `(file)` suffix and server_config.ts.
        APP_URL: withSource(config.appUrl),
        DATABASE_FILENAME: env.get('DATABASE_FILENAME', app.tmpPath('db.sqlite3')),
        SESSION_DRIVER: env.get('SESSION_DRIVER'),
        PUBLIC_SIGNUP_ENABLED: withSource(config.publicSignupEnabled),
        LIMITER_STORE: env.get('LIMITER_STORE'),
        SMTP2GO_HOST: withSource(config.mailHost),
        SMTP2GO_PORT: withSource(config.mailPort),
        SMTP2GO_USERNAME: withSource(config.mailUsername),
        SMTP2GO_PASSWORD: config.mailPassword.isSet ? 'set' : 'not set',
        SMTP2GO_FROM_ADDRESS: withSource(config.mailFromAddress),
        SMTP2GO_FROM_NAME: withSource(config.mailFromName),
        ALEXA_SKILL_ID: withSource(config.alexaSkillId),
        AUTHENTIK_TOKEN_URL: withSource(config.authentikTokenUrl),
        AUTHENTIK_USERINFO_URL: withSource(config.authentikUserinfoUrl),
        AUTHENTIK_CLIENT_ID: withSource(config.authentikClientId),
        AUTHENTIK_CLIENT_SECRET: config.authentikClientSecret.isSet ? 'set' : 'not set',
        CONFIG_YAML_WRITABLE: config.writable,
      },
    }

    logger.debug({ userId: user.id }, 'served debug info')

    return response.ok(body)
  }
}
