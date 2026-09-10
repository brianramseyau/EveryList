import { serverConfigValue } from '#services/server_config'

/** True once real SMTP2GO credentials are supplied via env vars or `/config/config.yaml` — unset
 * in local dev, where the mail config falls back to placeholder values that can't actually send.
 * `serverConfigValue` reads `process.env` live under the hood (rather than the validated
 * `#start/env` service), so this stays a plain runtime check the test suite can toggle per-call. */
export default function isMailConfigured(): boolean {
  return Boolean(
    serverConfigValue('SMTP2GO_USERNAME', '') && serverConfigValue('SMTP2GO_PASSWORD', '')
  )
}
