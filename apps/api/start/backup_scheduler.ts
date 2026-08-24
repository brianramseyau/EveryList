/*
|--------------------------------------------------------------------------
| Automated database backup scheduler
|--------------------------------------------------------------------------
|
| Single-process app, so the schedule is checked with an in-process timer
| rather than a second OS-level service. Checking every 5 minutes comfortably
| satisfies "fires within 15 minutes of the configured time" while keeping
| `runScheduledBackupIfDue`'s own last-run tracking as the sole guarantee
| against firing twice in the same period.
|
| Skipped under Japa (`app.inTest`) and ace/console commands (migrations,
| REPL, etc.) — neither should be taking real backups or holding the process
| open with a live interval.
|
*/

import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { runScheduledBackupIfDue } from '#services/backup_service'

const CHECK_INTERVAL_MS = 5 * 60 * 1000

if (!app.inTest && app.getEnvironment() !== 'console') {
  logger.debug({ intervalMs: CHECK_INTERVAL_MS }, 'starting backup scheduler')

  const check = () => {
    runScheduledBackupIfDue().catch((error: unknown) => {
      logger.error({ err: error }, 'scheduled database backup failed')
    })
  }

  check()
  setInterval(check, CHECK_INTERVAL_MS)
}
