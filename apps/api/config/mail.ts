import env from '#start/env'
import { defineConfig, transports } from '@adonisjs/mail'
import type { InferMailers } from '@adonisjs/mail/types'

const mailConfig = defineConfig({
  default: 'smtp',

  from: {
    address: env.get('SMTP2GO_FROM_ADDRESS', 'no-reply@everylist.app'),
    name: env.get('SMTP2GO_FROM_NAME', 'EveryList'),
  },

  mailers: {
    smtp: transports.smtp({
      host: env.get('SMTP2GO_HOST', 'mail.smtp2go.com'),
      port: env.get('SMTP2GO_PORT', 2525),
      auth: {
        type: 'login',
        user: env.get('SMTP2GO_USERNAME', ''),
        pass: env.get('SMTP2GO_PASSWORD', ''),
      },
    }),
  },
})

export default mailConfig

declare module '@adonisjs/mail/types' {
  export interface MailersList extends InferMailers<typeof mailConfig> {}
}
