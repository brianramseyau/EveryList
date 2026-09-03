/*
|--------------------------------------------------------------------------
| Deadline notification scheduler
|--------------------------------------------------------------------------
|
| Single-process app, so due deadlines are checked with an in-process timer
| rather than a second OS-level service — same shape as
| `backup_scheduler.ts`. A 60s interval matches deadlines' minute precision.
|
| Skipped under Japa (`app.inTest`) and ace/console commands (migrations,
| REPL, etc.) — neither should be sending real push notifications or holding
| the process open with a live interval.
|
*/

import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { sendDueDeadlineNotifications } from '#services/deadline_notification_service'

const CHECK_INTERVAL_MS = 60 * 1000

if (!app.inTest && app.getEnvironment() !== 'console') {
  logger.debug({ intervalMs: CHECK_INTERVAL_MS }, 'starting deadline notification scheduler')

  const check = () => {
    sendDueDeadlineNotifications().catch((error: unknown) => {
      logger.error({ err: error }, 'deadline notification check failed')
    })
  }

  check()
  setInterval(check, CHECK_INTERVAL_MS)
}
