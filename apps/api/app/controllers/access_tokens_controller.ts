import User from '#models/user'
import { loginValidator } from '#validators/user'
import type { HttpContext } from '@adonisjs/core/http'
import UserTransformer from '#transformers/user_transformer'

export default class AccessTokensController {
  async store({ request, serialize }: HttpContext) {
    const { email, password } = await request.validateUsing(loginValidator)

    const user = await User.verifyCredentials(email, password)
    const token = await User.accessTokens.create(user)

    return serialize({
      user: UserTransformer.transform(user),
      token: token.value!.release(),
    })
  }

  async destroy({ auth }: HttpContext) {
    const user = auth.getUserOrFail()
    if (user.currentAccessToken) {
      await User.accessTokens.delete(user, user.currentAccessToken.identifier)
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
  async refresh({ auth, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const previousToken = user.currentAccessToken

    const token = await User.accessTokens.create(user)
    if (previousToken) {
      await User.accessTokens.delete(user, previousToken.identifier)
    }

    return serialize({
      user: UserTransformer.transform(user),
      token: token.value!.release(),
    })
  }
}
