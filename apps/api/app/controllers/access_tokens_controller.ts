import User from '#models/user'
import { loginValidator } from '#validators/user'
import type { HttpContext } from '@adonisjs/core/http'
import UserTransformer from '#transformers/user_transformer'

export default class AccessTokensController {
  async store({ request, serialize, logger }: HttpContext) {
    const { email, password } = await request.validateUsing(loginValidator)

    // A failed `verifyCredentials` throws `E_INVALID_CREDENTIALS` — logged as
    // a warn from `exceptions/handler.ts#report` (the base handler ignores
    // its 400 status by default, which would otherwise leave every failed
    // login attempt with zero trace, on the one route group the app treats
    // as its brute-force/credential-stuffing surface — see `start/limiter.ts`).
    const user = await User.verifyCredentials(email, password)
    const token = await User.accessTokens.create(user)
    logger.debug({ userId: user.id }, 'login succeeded')

    return serialize({
      user: UserTransformer.transform(user),
      token: token.value!.release(),
    })
  }

  async destroy({ auth, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    if (user.currentAccessToken) {
      await User.accessTokens.delete(user, user.currentAccessToken.identifier)
      logger.debug({ userId: user.id }, 'logout: access token revoked')
    }

    return {
      message: 'Logged out successfully',
    }
  }

  /**
   * Rotates the caller's access token: issues a fresh one and revokes the
   * one used to authenticate this request, so a long-lived client session
   * never has to ask the user to re-enter their password to stay signed in.
   */
  async refresh({ auth, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const previousToken = user.currentAccessToken

    const token = await User.accessTokens.create(user)
    if (previousToken) {
      await User.accessTokens.delete(user, previousToken.identifier)
    }
    logger.debug({ userId: user.id }, 'access token refreshed')

    return serialize({
      user: UserTransformer.transform(user),
      token: token.value!.release(),
    })
  }
}
