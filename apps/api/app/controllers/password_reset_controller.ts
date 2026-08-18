import mail from '@adonisjs/mail/services/main'
import User from '#models/user'
import PasswordResetMail from '#mails/password_reset_mail'
import isMailConfigured from '#services/mail_configured'
import { createPasswordResetToken, findActivePasswordResetToken } from '#services/password_reset'
import { forgotPasswordValidator, resetPasswordValidator } from '#validators/password_reset'
import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'

export default class PasswordResetController {
  /**
   * Always responds 204 whether or not the email matches an account, so the
   * endpoint can't be used to probe which addresses are registered. When a
   * user is found, mints a short-lived reset token and emails the link.
   */
  async forgot({ request, response }: HttpContext) {
    if (!isMailConfigured()) {
      return response.status(503).send({ message: 'Email is not configured on this server.' })
    }

    const { email } = await request.validateUsing(forgotPasswordValidator)
    const user = await User.query().where('email', email).first()

    if (user) {
      const token = await createPasswordResetToken(user)
      await mail.send(new PasswordResetMail(user.email, token))
    }

    return response.noContent()
  }

  /** Consumes a valid, unexpired reset token and sets a new password. */
  async reset({ request, response }: HttpContext) {
    const { token, password } = await request.validateUsing(resetPasswordValidator)

    const resetToken = await findActivePasswordResetToken(token)
    if (!resetToken) {
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

    return response.noContent()
  }
}
