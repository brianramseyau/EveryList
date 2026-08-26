/*
|--------------------------------------------------------------------------
| Retention pruner scheduler
|--------------------------------------------------------------------------
|
| Runs every retention sweep the app maintains — currently the soft-deleted
| item TTL (180 days) and the SyncEvent broadcast-log retention (30 days), see
| prune_service.ts. A 6-hour cadence keeps tables from accumulating a large
| backlog while leaving plenty of headroom around the daily frequency the
| windows actually need. Each sweep is idempotent and cheap when nothing is
| expired, and stops itself early (the per-table MAX_*_PRUNE_PER_RUN) if a
| backlog is still draining.
|
| Skipped under Japa (`app.inTest`) and ace/console commands (migrations,
| REPL, etc.) — neither should be mutating the production database's rows or
| holding the process open with a live interval.
|
*/

import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { runPruneSweep } from '#services/prune_service'

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

if (!app.inTest && app.getEnvironment() !== 'console') {
  logger.debug({ intervalMs: CHECK_INTERVAL_MS }, 'starting retention pruner scheduler')

  const check = () => {
    runPruneSweep().catch((error: unknown) => {
      logger.error({ err: error }, 'retention prune sweep failed')
    })
  }

  check()
  setInterval(check, CHECK_INTERVAL_MS)
}
