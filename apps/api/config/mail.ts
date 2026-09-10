import env from '#start/env'
import { defineConfig, transports } from '@adonisjs/mail'
import type { InferMailers } from '@adonisjs/mail/types'

/**
 * Exported (rather than inlined below) so `server_config.ts` can mutate these fields in place
 * after an admin edits mail settings in `/config/config.yaml` — `transports.smtp()` closes over
 * this same object reference and only constructs the actual `SMTPTransport` lazily, the first
 * time `mail.use('smtp')` is called, so mutating it here and then evicting the cached transport
 * (`mail.close('smtp')`) is enough to pick up new settings with no restart. See server_config.ts.
 */
export const smtpTransportConfig = {
  host: env.get('SMTP2GO_HOST', 'mail.smtp2go.com'),
  port: env.get('SMTP2GO_PORT', 2525),
  auth: {
    type: 'login' as const,
    user: env.get('SMTP2GO_USERNAME', ''),
    pass: env.get('SMTP2GO_PASSWORD', ''),
  },
}

/** Same mutation-in-place trick as `smtpTransportConfig` above. */
export const mailFromConfig = {
  address: env.get('SMTP2GO_FROM_ADDRESS', 'no-reply@everylist.app'),
  name: env.get('SMTP2GO_FROM_NAME', 'EveryList'),
}

const mailConfig = defineConfig({
  default: 'smtp',

  from: mailFromConfig,

  mailers: {
    smtp: transports.smtp(smtpTransportConfig),
  },
})

export default mailConfig

declare module '@adonisjs/mail/types' {
  export interface MailersList extends InferMailers<typeof mailConfig> {}
}
