import { BaseMail } from '@adonisjs/mail'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export default class PasswordResetMail extends BaseMail {
  subject = ''

  constructor(
    private recipientEmail: string,
    private token: string,
    /** The public origin the reset link should point at (the requesting
     *  client's Origin, or the configured APP_URL as a fallback). */
    private baseUrl: string
  ) {
    super()
    this.subject = 'Reset your EveryList password'
  }

  prepare() {
    this.message.to(this.recipientEmail)

    const resetUrl = `${this.baseUrl}/reset-password?token=${encodeURIComponent(this.token)}`
    this.message.html(
      `<h1>Reset your password</h1>` +
        `<p>Someone asked to reset the password for your EveryList account. ` +
        `Open the link below to set a new one — it expires in 60 minutes.</p>` +
        `<p><a href="${escapeHtml(resetUrl)}">Reset your password</a></p>` +
        `<p>If you didn't ask for this, you can safely ignore this email.</p>`
    )
    this.message.text(
      `Reset your EveryList password\n\n` +
        `Open this link to set a new password (valid for 60 minutes):\n` +
        `${resetUrl}\n\n` +
        `If you didn't ask for this, you can safely ignore this email.`
    )
  }
}
