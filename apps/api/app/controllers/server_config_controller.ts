import type User from '#models/user'
import { updateServerConfigValidator } from '#validators/server_config'
import { serverConfigState, updateServerConfig } from '#services/server_config'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Server settings backed by `/config/config.yaml` (mail, public signups, Alexa account-linking —
 * see server_config.ts for the full list and why it excludes core/boot-time vars). Same shape as
 * `backup_settings_controller.ts`/`debug_controller.ts`: there's no admin role in this app, so
 * this hard-codes the caller to user id 1 rather than a role/permission flag.
 */
export default class ServerConfigController {
  private requireAdmin({ auth, response, logger }: HttpContext): User | null {
    const user = auth.getUserOrFail()
    if (user.id !== 1) {
      logger.warn({ userId: user.id }, 'server config endpoint access denied')
      response.forbidden({ message: 'Not authorized' })
      return null
    }
    return user
  }

  async show(ctx: HttpContext) {
    if (!this.requireAdmin(ctx)) return
    return ctx.response.ok({ data: serverConfigState() })
  }

  async update(ctx: HttpContext) {
    if (!this.requireAdmin(ctx)) return
    const { request, response, logger } = ctx
    const payload = await request.validateUsing(updateServerConfigValidator)

    // ConfigFieldLockedException/ConfigReadOnlyException carry their own HTTP status (400/403)
    // via `createError` — Adonis's default exception handler turns the bare throw into the
    // right response, same as ListForbiddenException elsewhere. No try/catch needed here.
    const state = await updateServerConfig(payload)
    logger.debug({ fields: Object.keys(payload) }, 'updated server config')
    return response.ok({ data: state })
  }
}
