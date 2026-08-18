import { BaseMail } from '@adonisjs/mail'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// The app's design tokens (see apps/web/src/routes/layout.css): a warm paper
// canvas, dark ink text, and quiet slate chrome. The checklist mark above the
// headline echoes the app icon's clipboard of checked rows — the product's
// own vernacular as a logo substitute, since external images get blocked by
// email clients.
const PAPER = '#f6f5f1'
const INK = '#201f1d'
const MUTED = '#6b7280'
const SLATE = '#283a54'
const CHECK = '#10b981'
const ROW_BAR = '#e5e7eb'

// Dark-mode tokens mirror the app's own `:root.dark` override.
const DARK_PAPER = '#1b1d1f'
const DARK_CARD = '#26282b'
const DARK_INK = '#edeae3'
const DARK_MUTED = '#9aa0a6'

const CHECKLIST_ROW = (barWidth: string) =>
  `<tr>` +
  `<td style="padding:3px 0;">` +
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0">` +
  `<tr>` +
  `<td style="width:16px;height:16px;border-radius:5px;background-color:${CHECK};text-align:center;font-family:Arial,sans-serif;font-size:11px;line-height:16px;color:#ffffff;font-weight:700;">&#10003;</td>` +
  `<td style="padding-left:8px;width:${barWidth};height:8px;border-radius:4px;background-color:${ROW_BAR};"></td>` +
  `</tr>` +
  `</table>` +
  `</td>` +
  `</tr>`

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
      `<!DOCTYPE html>` +
        `<html lang="en">` +
        `<head>` +
        `<meta charset="utf-8" />` +
        `<meta name="viewport" content="width=device-width, initial-scale=1" />` +
        `<meta name="color-scheme" content="light dark" />` +
        `<meta name="supported-color-schemes" content="light dark" />` +
        `<link rel="preconnect" href="https://fonts.googleapis.com" />` +
        `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />` +
        `<link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;600&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />` +
        `<style>` +
        `:root{color-scheme:light dark;}` +
        `@media (prefers-color-scheme: dark){` +
        `.el-paper{background-color:${DARK_PAPER} !important;}` +
        `.el-card{background-color:${DARK_CARD} !important;}` +
        `.el-ink{color:${DARK_INK} !important;}` +
        `.el-muted{color:${DARK_MUTED} !important;}` +
        `}` +
        `</style>` +
        `</head>` +
        `<body style="margin:0;padding:0;background-color:${PAPER};">` +
        `<table class="el-paper" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAPER};font-family:'Public Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">` +
        `<tr>` +
        `<td align="center" style="padding:40px 16px;">` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">` +
        `<tr>` +
        `<td class="el-card" align="left" style="background-color:#ffffff;border-radius:16px;padding:40px 36px;color:${INK};">` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 28px auto;">` +
        `${CHECKLIST_ROW('100px')}${CHECKLIST_ROW('70px')}${CHECKLIST_ROW('88px')}` +
        `</table>` +
        `<h1 class="el-ink" style="margin:0 0 12px 0;font-family:'Space Grotesk',Arial,sans-serif;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:${INK};">Reset your password</h1>` +
        `<p class="el-muted" style="margin:0;font-size:15px;line-height:1.6;color:${MUTED};">` +
        `We got a request to reset the password for your EveryList account. The link below works for the next ` +
        `<strong class="el-ink" style="color:${INK};">60 minutes</strong> — after that you'll need to ask for a new one.` +
        `</p>` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">` +
        `<tr>` +
        `<td bgcolor="${SLATE}" style="border-radius:10px;background-color:${SLATE};">` +
        `<a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:13px 28px;font-family:'Public Sans',Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;background-color:${SLATE};text-decoration:none;border-radius:10px;">Reset password</a>` +
        `</td>` +
        `</tr>` +
        `</table>` +
        `<p class="el-muted" style="margin:0;font-size:14px;line-height:1.6;color:${MUTED};">` +
        `Didn't ask for this? You can safely ignore this email — your password won't change unless you click the link above.` +
        `</p>` +
        `</td>` +
        `</tr>` +
        `<tr>` +
        `<td class="el-muted" align="center" style="padding:20px 16px 0;font-size:12px;line-height:1.5;color:${MUTED};">` +
        `EveryList — your self-hosted shopping list` +
        `</td>` +
        `</tr>` +
        `</table>` +
        `</td>` +
        `</tr>` +
        `</table>` +
        `</body>` +
        `</html>`
    )

    this.message.text(
      `Reset your EveryList password\n\n` +
        `We got a request to reset the password for your EveryList account. This link ` +
        `works for the next 60 minutes — after that you'll need to ask for a new one.\n\n` +
        `Open this link to set a new password:\n` +
        `${resetUrl}\n\n` +
        `Didn't ask for this? You can safely ignore this email — your password won't ` +
        `change unless you click the link above.`
    )
  }
}
