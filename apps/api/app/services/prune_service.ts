import Item from '#models/item'
import SyncEvent from '#models/sync_event'
import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'

/**
 * Soft-deleted items older than this are hard-deleted by the periodic prune
 * job. The category matcher no longer reads `items` history (Phase 17 moved
 * learning into `category_learnings`), so a deleted row has no reason to be
 * kept forever — 180 days of recovery headroom matches the Phase 17 learned
 * model's 180-day half-life and gives plenty of time for an accidental delete
 * to be noticed and restored.
 */
export const DELETED_ITEM_RETENTION_DAYS = 180

/**
 * SyncEvents older than this are pruned. The table is an insert-only broadcast
 * log with no functional read path (see PLAN.md §8) — this window keeps a
 * bounded audit trail for debugging without letting the table grow forever.
 */
export const SYNC_EVENT_RETENTION_DAYS = 30

/** Deletes in small batches so a huge backlog never holds the single SQLite write lock for long. */
export const ITEM_PRUNE_BATCH_SIZE = 500

/** Cap per run so the first run against a large backlog can't starve the live server — the backlog drains over successive runs. */
export const ITEM_MAX_PRUNE_PER_RUN = 50_000

/** SyncEvents are much more numerous than items (every mutation writes one), so use larger batches. */
export const SYNC_EVENT_PRUNE_BATCH_SIZE = 1_000

/** Cap per run — the larger volume justifies a bigger cap, but still bounded so a backlog drains across runs rather than in one giant transaction. */
export const SYNC_EVENT_MAX_PRUNE_PER_RUN = 100_000

/** Optional overrides — tests use these to shrink the batch/cap without seeding tens of thousands of rows. */
export interface PruneOptions {
  batchSize?: number
  maxPerRun?: number
}

/** The retention-cutoff comparison value, in the same `yyyy-MM-dd HH:mm:ss` format Lucid's SQLite dateTime columns store (server-local zone, the path every write goes through) — a fixed-width string comparison is correct. */
function dateCutoff(now: DateTime, days: number): string {
  return now.minus({ days }).toFormat('yyyy-MM-dd HH:mm:ss')
}

/**
 * Hard-deletes soft-deleted items whose `deletedAt` predates the retention
 * window. Anchored on `deletedAt` (the moment the user removed the item): it is
 * the only meaningful "last interacted" timestamp a soft-deleted row has —
 * `updatedAt` is written at delete time too, and nothing touches the row again
 * afterwards (restoring clears `deletedAt`, which also removes it from this
 * scan).
 *
 * Deliberately does NOT write SyncEvents or broadcast: a background retention
 * sweep shouldn't re-bloat `sync_events` (itself a prune target here) for rows
 * that have been gone from every live client since the moment they were
 * soft-deleted — clients reconcile on their next fetch.
 */
export async function pruneExpiredDeletedItems(
  now: DateTime = DateTime.now(),
  { batchSize = ITEM_PRUNE_BATCH_SIZE, maxPerRun = ITEM_MAX_PRUNE_PER_RUN }: PruneOptions = {}
): Promise<{ purged: number }> {
  const cutoffSql = dateCutoff(now, DELETED_ITEM_RETENTION_DAYS)
  let purged = 0

  while (purged < maxPerRun) {
    const expired = await Item.query()
      .whereNotNull('deletedAt')
      .where('deletedAt', '<', cutoffSql)
      .orderBy('deletedAt', 'asc')
      .select('id')
      .limit(Math.min(batchSize, maxPerRun - purged))

    if (expired.length === 0) break

    await Item.query()
      .whereIn(
        'id',
        expired.map((row) => row.id)
      )
      .delete()
    purged += expired.length
    logger.debug({ count: expired.length, purged }, 'pruned expired deleted items')
  }

  if (purged > 0) {
    logger.info({ purged, cutoff: cutoffSql }, 'deleted-item retention prune completed')
  }

  return { purged }
}

/**
 * Prunes SyncEvent rows older than the retention window. Time-based rather
 * than join-based: the table is polymorphic (`entity_type`/`entity_id`, no
 * FK), soft-deleted entities still exist as rows, and `purge`-op events point
 * at rows that are gone by design — so "event references a missing entity"
 * isn't a well-defined condition. A fixed age cutoff is unambiguous and cheap
 * with the `occurred_at` index.
 */
export async function pruneExpiredSyncEvents(
  now: DateTime = DateTime.now(),
  {
    batchSize = SYNC_EVENT_PRUNE_BATCH_SIZE,
    maxPerRun = SYNC_EVENT_MAX_PRUNE_PER_RUN,
  }: PruneOptions = {}
): Promise<{ purged: number }> {
  const cutoffSql = dateCutoff(now, SYNC_EVENT_RETENTION_DAYS)
  let purged = 0

  while (purged < maxPerRun) {
    const expired = await SyncEvent.query()
      .where('occurredAt', '<', cutoffSql)
      .orderBy('occurredAt', 'asc')
      .select('id')
      .limit(Math.min(batchSize, maxPerRun - purged))

    if (expired.length === 0) break

    await SyncEvent.query()
      .whereIn(
        'id',
        expired.map((row) => row.id)
      )
      .delete()
    purged += expired.length
    logger.debug({ count: expired.length, purged }, 'pruned expired sync events')
  }

  if (purged > 0) {
    logger.info({ purged, cutoff: cutoffSql }, 'sync-event retention prune completed')
  }

  return { purged }
}

/**
 * Runs every retention sweep the app maintains — the scheduler's single entry
 * point, so a new table only needs a new `prune*` function wired in here.
 * Sequential (not Promise.all) because both sweeps write to the same single
 * SQLite file.
 */
export async function runPruneSweep(
  now: DateTime = DateTime.now()
): Promise<{ purgedItems: number; purgedSyncEvents: number }> {
  const items = await pruneExpiredDeletedItems(now)
  const syncEvents = await pruneExpiredSyncEvents(now)
  return { purgedItems: items.purged, purgedSyncEvents: syncEvents.purged }
}
