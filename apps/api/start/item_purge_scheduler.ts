/*
|--------------------------------------------------------------------------
| Deleted-item TTL purge scheduler
|--------------------------------------------------------------------------
|
| Runs the soft-deleted item retention sweep (see item_purge_service.ts).
| A 6-hour cadence keeps the table from accumulating a large backlog while
| leaving plenty of headroom around the daily frequency a 180-day window
| actually needs. The sweep is idempotent and cheap when nothing is expired,
| and stops itself early (MAX_PURGE_PER_RUN) if a backlog is still draining.
|
| Skipped under Japa (`app.inTest`) and ace/console commands (migrations,
| REPL, etc.) — neither should be mutating the production database's rows or
| holding the process open with a live interval.
|
*/

import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { purgeExpiredDeletedItems } from '#services/item_purge_service'

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

if (!app.inTest && app.getEnvironment() !== 'console') {
  logger.debug({ intervalMs: CHECK_INTERVAL_MS }, 'starting deleted-item TTL purge scheduler')

  const check = () => {
    purgeExpiredDeletedItems().catch((error: unknown) => {
      logger.error({ err: error }, 'deleted-item TTL purge failed')
    })
  }

  check()
  setInterval(check, CHECK_INTERVAL_MS)
}
