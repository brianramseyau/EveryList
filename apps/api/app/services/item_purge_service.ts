import Item from '#models/item'
import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'

/**
 * Soft-deleted items older than this are hard-deleted by the periodic purge
 * job. The category matcher no longer reads `items` history (Phase 17 moved
 * learning into `category_learnings`), so a deleted row has no reason to be
 * kept forever — 180 days of recovery headroom matches the Phase 17 learned
 * model's 180-day half-life and gives plenty of time for an accidental delete
 * to be noticed and restored.
 */
export const DELETED_ITEM_RETENTION_DAYS = 180

/** Deletes in small batches so a huge backlog never holds the single SQLite write lock for long. */
export const PURGE_BATCH_SIZE = 500

/** Cap per run so the first run against a large backlog can't starve the live server — the backlog drains over successive runs. */
export const MAX_PURGE_PER_RUN = 50_000

/** Optional overrides — tests use these to shrink the batch/cap without seeding 50k rows. */
export interface PurgeOptions {
  batchSize?: number
  maxPerRun?: number
}

/**
 * Hard-deletes soft-deleted items whose `deletedAt` predates the retention
 * window. Anchored on `deletedAt` (the moment the user removed the item): it is
 * the only meaningful "last interacted" timestamp a soft-deleted row has —
 * `updatedAt` is written at delete time too, and nothing touches the row again
 * afterwards (restoring clears `deletedAt`, which also removes it from this
 * scan).
 *
 * Deletes in batches of `PURGE_BATCH_SIZE` and stops at `MAX_PURGE_PER_RUN`.
 * Deliberately does NOT write SyncEvents or broadcast: a background retention
 * sweep shouldn't re-bloat `sync_events` (itself an unbounded append-only
 * table) for rows that have been gone from every live client since the moment
 * they were soft-deleted — clients reconcile on their next fetch.
 */
export async function purgeExpiredDeletedItems(
  now: DateTime = DateTime.now(),
  { batchSize = PURGE_BATCH_SIZE, maxPerRun = MAX_PURGE_PER_RUN }: PurgeOptions = {}
): Promise<{ purged: number }> {
  const cutoff = now.minus({ days: DELETED_ITEM_RETENTION_DAYS })
  // Stored as `yyyy-MM-dd HH:mm:ss` (Lucid's SQLite dateTime format, in the
  // server's local zone — the same path every write goes through), so a
  // fixed-width string comparison is correct.
  const cutoffSql = cutoff.toFormat('yyyy-MM-dd HH:mm:ss')
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
    logger.debug({ count: expired.length, purged }, 'purged expired deleted items')
  }

  if (purged > 0) {
    logger.info({ purged, cutoff: cutoffSql }, 'deleted-item TTL purge completed')
  }

  return { purged }
}
