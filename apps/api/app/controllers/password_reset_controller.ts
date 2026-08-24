import mail from '@adonisjs/mail/services/main'
import User from '#models/user'
import PasswordResetMail from '#mails/password_reset_mail'
import isMailConfigured from '#services/mail_configured'
import { createPasswordResetToken, findActivePasswordResetToken } from '#services/password_reset'
import { forgotPasswordValidator, resetPasswordValidator } from '#validators/password_reset'
import type { HttpContext } from '@adonisjs/core/http'
import { appUrl } from '#config/app'
import { DateTime } from 'luxon'

export default class PasswordResetController {
  /**
   * Always responds 204 whether or not the email matches an account, so the
   * endpoint can't be used to probe which addresses are registered. When a
   * user is found, mints a short-lived reset token and emails the link.
   */
  async forgot({ request, response, logger }: HttpContext) {
    if (!isMailConfigured()) {
      return response.serviceUnavailable({ message: 'Email is not configured on this server.' })
    }

    const { email } = await request.validateUsing(forgotPasswordValidator)
    const user = await User.query().where('email', email).first()

    // Deliberately not logging the unmatched-email case at anything above
    // debug — the 204 response already keeps this from leaking which emails
    // are registered, and a warn/info record would just recreate that leak
    // for anyone with log access.
    if (user) {
      const token = await createPasswordResetToken(user)
      // The requesting browser's Origin is the public URL the user is actually
      // on — use it so the emailed link works even when APP_URL wasn't
      // configured (the container's baked-in default is a loopback address).
      const baseUrl = request.header('origin') ?? appUrl
      await mail.send(new PasswordResetMail(user.email, token, baseUrl))
      logger.debug({ userId: user.id }, 'password reset email sent')
    } else {
      logger.debug('password reset requested for unregistered email')
    }

    return response.noContent()
  }

  /** Consumes a valid, unexpired reset token and sets a new password. */
  async reset({ request, response, logger }: HttpContext) {
    const { token, password } = await request.validateUsing(resetPasswordValidator)

    const resetToken = await findActivePasswordResetToken(token)
    if (!resetToken) {
      logger.warn('password reset attempted with an invalid or expired token')
      return response.badRequest({ message: 'This reset link is invalid or has expired.' })
    }

    const user = await User.findOrFail(resetToken.userId)
    user.password = password
    await user.save()

    // Reusing a reset token must never work twice.
    resetToken.revokedAt = DateTime.now()
    await resetToken.save()

    // A password change makes every previously issued access token suspect —
    // kill them all so a leaked session can't outlive the reset.
    await User.accessTokens.deleteAll(user)
    logger.debug({ userId: user.id }, 'password reset completed, all access tokens revoked')

    return response.noContent()
  }
}
