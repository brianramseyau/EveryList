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
| Guarded against overlap: a slow tick (many recipients × slow push
| endpoints taking >60s) must not let the next tick start while the
| previous is still running — two ticks racing over the same due item would
| both read `deadline_notification_sends` before either had written its
| row, double-sending to the same subscription.
|
*/

import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { sendDueDeadlineNotifications } from '#services/deadline_notification_service'

const CHECK_INTERVAL_MS = 60 * 1000

if (!app.inTest && app.getEnvironment() !== 'console') {
  logger.debug({ intervalMs: CHECK_INTERVAL_MS }, 'starting deadline notification scheduler')

  let checkInFlight = false
  const check = () => {
    if (checkInFlight) return
    checkInFlight = true
    sendDueDeadlineNotifications()
      .catch((error: unknown) => {
        logger.error({ err: error }, 'deadline notification check failed')
      })
      .finally(() => {
        checkInFlight = false
      })
  }

  check()
  setInterval(check, CHECK_INTERVAL_MS)
}
