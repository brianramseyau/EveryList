import User from '#models/user'
import UserTransformer from '#transformers/user_transformer'
import { updateProfileValidator, updatePasswordValidator } from '#validators/user'
import type { HttpContext } from '@adonisjs/core/http'
import hash from '@adonisjs/core/services/hash'

export default class ProfileController {
  async show({ auth, serialize }: HttpContext) {
    return serialize(UserTransformer.transform(auth.getUserOrFail()))
  }

  async update({ auth, request, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(updateProfileValidator)

    user.merge(payload)
    await user.save()

    logger.debug({ userId: user.id }, 'updated profile')

    return serialize(UserTransformer.transform(user))
  }

  /**
   * Self-service password change from Settings. Requires the current
   * password since, unlike the email-token reset flow, there's no other
   * proof of identity here. Unlike the email-reset and admin-set flows,
   * this never touches the calling session's own token — a routine hygiene
   * change shouldn't force a re-login on this device. Signing out every
   * *other* session is opt-in via `signOutOtherDevices`, for when the user
   * suspects compromise rather than just rotating a password on schedule.
   */
  async updatePassword({ auth, request, response, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const { currentPassword, password, signOutOtherDevices } =
      await request.validateUsing(updatePasswordValidator)

    if (!(await hash.verify(user.password, currentPassword))) {
      logger.warn({ userId: user.id }, 'password change attempted with incorrect current password')
      return response.badRequest({ message: 'Current password is incorrect.' })
    }

    user.password = password
    await user.save()

    if (signOutOtherDevices) {
      const currentIdentifier = user.currentAccessToken?.identifier
      const tokens = await User.accessTokens.all(user)
      await Promise.all(
        tokens
          .filter((token) => token.identifier !== currentIdentifier)
          .map((token) => User.accessTokens.delete(user, token.identifier))
      )
      logger.debug({ userId: user.id }, 'password changed, other access tokens revoked')
    } else {
      logger.debug({ userId: user.id }, 'password changed')
    }

    return serialize(UserTransformer.transform(user))
  }
}
