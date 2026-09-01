import { DateTime } from 'luxon'
import SyncEvent from '#models/sync_event'
import type { SyncEntityType, SyncOp } from '#models/sync_event'
import type Store from '#models/store'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import transmit from '@adonisjs/transmit/services/main'
import logger from '@adonisjs/core/services/logger'

type BroadcastPayload = NonNullable<Parameters<typeof transmit.broadcast>[1]>

export interface SyncBroadcastInput {
  listId: number
  entityType: SyncEntityType
  entityId: number
  op: SyncOp
  payload?: Record<string, unknown>
  /** Omitted only for batch events (e.g. bulk import) that don't map to one row's version. */
  version?: number
  /**
   * Runs the `SyncEvent` write on this transaction client instead of the
   * default connection. Required (not just nice-to-have) for any caller
   * inside an open `db.transaction()` — the SQLite pool is effectively
   * single-connection, so acquiring a second, untransacted connection from
   * inside an open transaction deadlocks waiting for the first to free up.
   * See #commands/demo_seed for the caller that hit this.
   */
  client?: QueryClientContract
}

export interface SyncBroadcaster {
  broadcast(input: SyncBroadcastInput): Promise<void>
}

/** Persists a `SyncEvent` row and pushes it over the list's Transmit channel — see PLAN_00_FOUNDATIONAL_PLAN.md §8. */
export class TransmitSyncBroadcaster implements SyncBroadcaster {
  async broadcast(input: SyncBroadcastInput): Promise<void> {
    await SyncEvent.create(
      {
        listId: input.listId,
        entityType: input.entityType,
        entityId: input.entityId,
        op: input.op,
        occurredAt: DateTime.now(),
        payload: input.payload ?? null,
      },
      { client: input.client }
    )

    const channel = `list/${input.listId}`
    // Subscriber count is captured *before* the broadcast call for
    // debugging the "first write after boot" gap noted in AGENTS.md — the
    // theory under investigation is a subscriber that's registered but
    // still doesn't receive the message, so knowing whether it was even
    // registered at broadcast time is the useful signal here, not proof of
    // delivery (`transmit.broadcast` doesn't report that either way).
    logger.debug(
      {
        channel,
        entityType: input.entityType,
        entityId: input.entityId,
        op: input.op,
        subscriberCount: transmit.getSubscribersFor(channel).length,
      },
      'broadcasting sync event'
    )

    transmit.broadcast(channel, {
      entityType: input.entityType,
      entityId: input.entityId,
      op: input.op,
      payload: input.payload ?? null,
      version: input.version ?? null,
    } as BroadcastPayload)
  }
}

let broadcaster: SyncBroadcaster = new TransmitSyncBroadcaster()

/** Swaps the module-level broadcaster singleton — functional tests use this to assert calls without touching Transmit. */
export function setSyncBroadcasterForTesting(fake: SyncBroadcaster): void {
  broadcaster = fake
}

export function resetSyncBroadcaster(): void {
  broadcaster = new TransmitSyncBroadcaster()
}

export async function broadcastSync(input: SyncBroadcastInput): Promise<void> {
  await broadcaster.broadcast(input)
}

/** Fans a Store/StoreCategoryOrder edit out to every list that store is attached to — PLAN_00_FOUNDATIONAL_PLAN.md §7/§8. */
export async function broadcastToStoreLists(
  store: Store,
  input: Omit<SyncBroadcastInput, 'listId'>
): Promise<void> {
  await store.load('lists')
  await Promise.all(store.lists.map((list) => broadcastSync({ ...input, listId: list.id })))
}
