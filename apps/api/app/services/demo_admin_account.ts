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
    // Re-tighten permissions on every read, not just at creation — same rationale as
    // server_config.ts's updateServerConfig re-chmod-ing config.yaml on every write: a
    // pre-existing file (hand-copied, restored from a looser-permissioned backup, ...) shouldn't
    // stay readable by anyone but the account the server runs as.
    fs.chmodSync(filePath, 0o600)
    return fs.readFileSync(filePath, 'utf8').trim()
  }

  // 18 random bytes -> 24 base64url characters, comfortably inside the app's 8-32 char password
  // bounds (see validators/user.ts and friends) with no padding characters to strip.
  const password = randomBytes(18).toString('base64url')
  try {
    publishPasswordFile(filePath, password)
    return password
  } catch (error) {
    if (!isFileExistsError(error)) throw error
    // Lost the race — another process published the file between our existsSync check above and
    // this write. Read back whatever it published instead of returning our own, now-orphaned
    // password.
    return fs.readFileSync(filePath, 'utf8').trim()
  }
}

/**
 * Publish via write-temp + link + unlink-temp rather than a direct writeFileSync(..., { flag:
 * 'wx' }): 'wx' only makes the file's *creation* exclusive, not its content atomic — a
 * concurrent demo:seed process racing past `ensureDemoAdminPassword`'s existsSync check could
 * open the file for read between its create and its write finishing, and see empty/partial
 * content. A hard link can only be created once the temp file's write has been fully flushed and
 * closed, and `linkSync` itself fails with EEXIST rather than replacing an existing target, so
 * whichever process's link wins is guaranteed to expose fully-written content.
 */
function publishPasswordFile(filePath: string, password: string): void {
  const tmpPath = `${filePath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  try {
    fs.writeFileSync(tmpPath, `${password}\n`, { encoding: 'utf8', mode: 0o600 })
    fs.linkSync(tmpPath, filePath)
  } finally {
    fs.rmSync(tmpPath, { force: true })
  }
}

/**
 * Same shape of check as commands/user_create.ts's `isUniqueConstraintError` — Node's fs errors
 * are plain `Error` instances carrying a `code`, not a dedicated error class to `instanceof`.
 */
function isFileExistsError(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code
  return code === 'EEXIST'
}
