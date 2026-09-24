import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { databaseFilename } from '#services/backup_service'

/**
 * Lives next to the database file (`/config` in prod, alongside `config.yaml`/`backups` — same
 * pattern as `server_config.ts`'s `serverConfigYamlPath`), rather than anywhere under the app
 * itself, so it survives a database wipe/reseed the same way `config.yaml` does.
 */
export function demoAdminPasswordFilePath(): string {
  return path.join(path.dirname(databaseFilename()), 'demo-admin-password.txt')
}

/**
 * Password for the demo/review instance's private admin account (`demo:seed`'s user id 1) —
 * generated once and persisted to `/config`, unlike the demo/sharing accounts' fixed, publicly
 * documented `password`. Reads back the existing file rather than regenerating on every call, so
 * a container restart or a fresh reseed after a database wipe (`/config` itself isn't wiped)
 * doesn't invalidate credentials an operator already fetched.
 */
export function ensureDemoAdminPassword(): string {
  const filePath = demoAdminPasswordFilePath()
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8').trim()
  }

  // 18 random bytes -> 24 base64url characters, comfortably inside the app's 8-32 char password
  // bounds (see validators/user.ts and friends) with no padding characters to strip.
  const password = randomBytes(18).toString('base64url')
  // Same 0600 rationale as server_config.ts's config.yaml write: this file holds a live
  // credential, readable only by the account the server runs as.
  fs.writeFileSync(filePath, `${password}\n`, { encoding: 'utf8', mode: 0o600 })
  return password
}
