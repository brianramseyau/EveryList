/** True once real SMTP2GO credentials are supplied via env vars — unset in local dev,
 * where the mail config falls back to placeholder values that can't actually send.
 * Reads `process.env` directly (rather than the validated `#start/env` service) so
 * this stays a plain runtime check the test suite can toggle per-call. */
export default function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP2GO_USERNAME && process.env.SMTP2GO_PASSWORD)
}
