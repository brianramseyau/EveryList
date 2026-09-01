import env from '#start/env'
import type { HttpContext } from '@adonisjs/core/http'
import type { MetaResponse } from '@everylist/shared'

export default class MetasController {
  async show({ response, logger }: HttpContext) {
    const body: MetaResponse = {
      version: env.get('APP_VERSION', 'nightly'),
      commit: env.get('GIT_SHA', 'unknown'),
      builtAt: env.get('BUILD_DATE', 'unknown'),
      publicSignupEnabled: env.get('PUBLIC_SIGNUP_ENABLED', true),
    }
    logger.debug(body, 'served meta info')
    return response.ok(body)
  }
}
